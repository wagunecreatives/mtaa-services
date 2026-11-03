alter table public.reviews
  alter column customer_id drop not null,
  alter column provider_id drop not null;

alter table public.reviews
  drop constraint if exists reviews_customer_id_fkey,
  drop constraint if exists reviews_provider_id_fkey;

alter table public.reviews
  add constraint reviews_customer_id_fkey
    foreign key (customer_id) references public.profiles(id) on delete set null,
  add constraint reviews_provider_id_fkey
    foreign key (provider_id) references public.providers(id) on delete set null;

alter table public.user_reports
  alter column reporter_id drop not null;

alter table public.user_reports
  drop constraint if exists user_reports_reporter_id_fkey;

alter table public.user_reports
  add constraint user_reports_reporter_id_fkey
    foreign key (reporter_id) references public.profiles(id) on delete set null;

alter table public.job_disputes
  alter column raised_by drop not null;

alter table public.job_disputes
  drop constraint if exists job_disputes_raised_by_fkey;

alter table public.job_disputes
  add constraint job_disputes_raised_by_fkey
    foreign key (raised_by) references public.profiles(id) on delete set null;

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint account_deletion_requests_token_hash_check
    check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

create or replace function public.start_account_deletion_request(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  accepted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at <= now()
    or p_expires_at > now() + interval '30 minutes' then
    raise exception 'Invalid account deletion request' using errcode = '22023';
  end if;

  insert into public.account_deletion_requests(user_id, token_hash, expires_at)
  values (p_user_id, p_token_hash, p_expires_at)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash,
        requested_at = now(),
        expires_at = excluded.expires_at
    where public.account_deletion_requests.token_hash is null
       or public.account_deletion_requests.expires_at <= now()
       or public.account_deletion_requests.requested_at <= now() - interval '15 minutes'
  returning true into accepted;

  return coalesce(accepted, false);
end;
$$;
revoke all on function public.start_account_deletion_request(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.start_account_deletion_request(uuid, text, timestamptz) to service_role;

create or replace function public.claim_account_deletion_request(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  delete from public.account_deletion_requests
  where token_hash = p_token_hash
    and expires_at > now()
  returning user_id into requested_user_id;

  return requested_user_id;
end;
$$;
revoke all on function public.claim_account_deletion_request(text) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_request(text) to service_role;

create or replace function public.validate_account_deletion(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.job_disputes dispute
    join public.jobs job on job.id = dispute.job_id
    where dispute.status in ('open', 'under_review')
      and (
        dispute.raised_by = p_user_id
        or job.customer_id = p_user_id
        or job.provider_id = p_user_id
      )
  ) then
    raise exception 'Account deletion is paused while an active dispute is being reviewed.'
      using errcode = 'P0001';
  end if;
  return true;
end;
$$;
revoke all on function public.validate_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.validate_account_deletion(uuid) to service_role;

create or replace function public.anonymize_account_data_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.job_disputes dispute
    join public.jobs job on job.id = dispute.job_id
    where dispute.status in ('open', 'under_review')
      and (
        dispute.raised_by = old.id
        or job.customer_id = old.id
        or job.provider_id = old.id
      )
  ) then
    raise exception 'Account deletion is paused while an active dispute is being reviewed.'
      using errcode = 'P0001';
  end if;

  update public.reviews
  set customer_id = null,
      review_text = null,
      comment = null,
      is_visible = false
  where customer_id = old.id;

  update public.reviews
  set provider_id = null,
      review_text = null,
      comment = null,
      is_visible = false
  where provider_id = old.id;

  update public.user_reports
  set reporter_id = null
  where reporter_id = old.id;

  update public.job_disputes
  set raised_by = null
  where raised_by = old.id;

  return old;
end;
$$;
revoke all on function public.anonymize_account_data_before_delete() from public, anon, authenticated;

drop trigger if exists anonymize_account_data_before_delete on auth.users;
create trigger anonymize_account_data_before_delete
  before delete on auth.users
  for each row execute function public.anonymize_account_data_before_delete();

create or replace function public.delete_user_account(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  deleted_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  delete from auth.users
  where id = p_user_id
  returning id into deleted_user_id;

  if deleted_user_id is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;
revoke all on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;
