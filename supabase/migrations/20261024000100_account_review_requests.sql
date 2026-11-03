create table if not exists public.account_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 5 and 3000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists account_review_requests_one_pending_per_user
  on public.account_review_requests(user_id) where status = 'pending';
create index if not exists account_review_requests_status_created_idx
  on public.account_review_requests(status, created_at desc);

alter table public.account_review_requests enable row level security;
revoke all on public.account_review_requests from public, anon, authenticated;
grant select on public.account_review_requests to authenticated;
drop policy if exists account_review_requests_admin_read on public.account_review_requests;
create policy account_review_requests_admin_read on public.account_review_requests
  for select to authenticated using (coalesce(public.is_admin(), false));

create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_active boolean,
  p_reason text
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target_role text;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then
    raise exception 'A reason is required (up to 2000 characters)' using errcode = '22023';
  end if;

  select role into target_role from public.profiles where id = p_user_id for update;
  if not found or target_role not in ('customer', 'provider') then
    raise exception 'Customer or provider account not found' using errcode = 'P0002';
  end if;

  update public.profiles set is_active = p_active, updated_at = now() where id = p_user_id;
  insert into public.admin_actions(admin_id, action, target_type, target_id, description, metadata)
    values (
      auth.uid(),
      case when p_active then 'user_activated' else 'user_deactivated' end,
      'profile',
      p_user_id,
      btrim(p_reason),
      jsonb_build_object('role', target_role, 'is_active', p_active)
    );
  return true;
end;
$$;

create or replace function public.submit_account_review_request(p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 3000 or length(btrim(p_reason)) < 5 then
    raise exception 'Explain why your account should be reviewed (5 to 3000 characters)' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('customer', 'provider') and is_active = false
  ) then
    raise exception 'Only deactivated customer or provider accounts can request a review' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.account_review_requests
    where user_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'Your account review request is already awaiting a decision' using errcode = '23505';
  end if;

  insert into public.account_review_requests(user_id, reason)
    values(auth.uid(), btrim(p_reason)) returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.account_review_request_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select to_jsonb(r) - 'user_id' into result
    from public.account_review_requests r
    where r.user_id = auth.uid()
    order by r.created_at desc limit 1;
  return result;
end;
$$;

create or replace function public.admin_list_account_review_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'denied') then
    raise exception 'Unknown account review status' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) || jsonb_build_object(
      'user_name', profile.full_name,
      'email', account.email,
      'phone', profile.phone,
      'role', profile.role,
      'is_active', profile.is_active
    ) order by r.created_at desc)
    from public.account_review_requests r
    join public.profiles profile on profile.id = r.user_id
    left join auth.users account on account.id = r.user_id
    where p_status is null or r.status = p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_review_account_request(
  p_request_id uuid,
  p_decision text,
  p_notes text
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare review_request public.account_review_requests%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'Choose approve or deny' using errcode = '22023';
  end if;
  if nullif(btrim(p_notes), '') is null or length(p_notes) > 2000 then
    raise exception 'An admin decision note is required (up to 2000 characters)' using errcode = '22023';
  end if;

  select * into review_request
    from public.account_review_requests where id = p_request_id for update;
  if not found then
    raise exception 'Account review request not found' using errcode = 'P0002';
  end if;
  if review_request.status <> 'pending' then
    raise exception 'This account review request has already been decided' using errcode = '22023';
  end if;

  update public.account_review_requests
    set status = p_decision, admin_notes = btrim(p_notes),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;

  if p_decision = 'approved' then
    update public.profiles set is_active = true, updated_at = now()
      where id = review_request.user_id and role in ('customer', 'provider');
    if not found then
      raise exception 'Customer or provider account not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.admin_actions(admin_id, action, target_type, target_id, description, metadata)
    values (
      auth.uid(),
      'account_review_' || p_decision,
      'account_review_request',
      review_request.id,
      btrim(p_notes),
      jsonb_build_object('user_id', review_request.user_id, 'status', p_decision)
    );
  return true;
end;
$$;

revoke all on function public.admin_set_user_active(uuid, boolean, text) from public, anon;
revoke all on function public.submit_account_review_request(text) from public, anon;
revoke all on function public.account_review_request_status() from public, anon;
revoke all on function public.admin_list_account_review_requests(text) from public, anon;
revoke all on function public.admin_review_account_request(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean, text) to authenticated;
grant execute on function public.submit_account_review_request(text) to authenticated;
grant execute on function public.account_review_request_status() to authenticated;
grant execute on function public.admin_list_account_review_requests(text) to authenticated;
grant execute on function public.admin_review_account_request(uuid, text, text) to authenticated;
