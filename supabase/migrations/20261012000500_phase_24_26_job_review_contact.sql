-- Phase 24-26: customer/provider dispute reporting, review attributes,
-- and job participant contact actions. Apply after the Phase 18 migrations.

alter table public.reviews
  add column if not exists provider_on_time boolean not null default false,
  add column if not exists provider_professional boolean not null default false,
  add column if not exists provider_affordable boolean not null default false,
  add column if not exists provider_helpful boolean not null default false;

drop function if exists public.submit_job_review(uuid, integer, text);
create function public.submit_job_review(
  p_job_id uuid,
  p_rating integer,
  p_review_text text,
  p_on_time boolean,
  p_professional boolean,
  p_affordable boolean,
  p_helpful boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs%rowtype;
  review_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode='22023';
  end if;
  if p_review_text is not null and length(p_review_text)>2000 then
    raise exception 'Review text must be at most 2000 characters' using errcode='22023';
  end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customer_id<>auth.uid() then
    raise exception 'Job not found or not owned by this customer' using errcode='42501';
  end if;
  if j.status<>'completed' then raise exception 'Only completed jobs can be reviewed' using errcode='22023'; end if;
  insert into public.reviews(
    job_id,customer_id,provider_id,rating,review_text,comment,
    provider_on_time,provider_professional,provider_affordable,provider_helpful
  ) values (
    j.id,j.customer_id,j.provider_id,p_rating,nullif(btrim(p_review_text),''),nullif(btrim(p_review_text),''),
    coalesce(p_on_time,false),coalesce(p_professional,false),coalesce(p_affordable,false),coalesce(p_helpful,false)
  ) returning id into review_id;
  return review_id;
exception when unique_violation then
  raise exception 'This job already has a review' using errcode='23505';
end;
$$;
revoke all on function public.submit_job_review(uuid,integer,text,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.submit_job_review(uuid,integer,text,boolean,boolean,boolean,boolean) to authenticated;

create table if not exists public.job_disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  raised_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 5 and 2000),
  status text not null default 'open' check (status in ('open','under_review','resolved','dismissed')),
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists job_disputes_status_created_idx on public.job_disputes(status,created_at desc);
alter table public.job_disputes enable row level security;
revoke all on public.job_disputes from public, anon, authenticated;
grant select on public.job_disputes to authenticated;
drop policy if exists "Admins can view job disputes" on public.job_disputes;
create policy "Admins can view job disputes" on public.job_disputes
  for select to authenticated using (coalesce(public.is_admin(),false));

create or replace function public.report_job_dispute(p_job_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs%rowtype;
  dispute_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Please provide a dispute reason (up to 2000 characters)' using errcode='22023';
  end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or (j.customer_id<>auth.uid() and j.provider_id<>auth.uid()) then
    raise exception 'Job not found or you are not a participant' using errcode='42501';
  end if;
  if j.status not in ('assigned','accepted','on_the_way','arrived','in_progress','awaiting_confirmation') then
    raise exception 'This job cannot be disputed in its current state' using errcode='22023';
  end if;
  insert into public.job_disputes(job_id,raised_by,reason) values(j.id,auth.uid(),btrim(p_reason)) returning id into dispute_id;
  update public.jobs set status='disputed',updated_at=now() where id=j.id;
  return dispute_id;
end;
$$;
revoke all on function public.report_job_dispute(uuid,text) from public, anon;
grant execute on function public.report_job_dispute(uuid,text) to authenticated;

create or replace function public.admin_list_job_disputes(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('open','under_review','resolved','dismissed') then
    raise exception 'Unknown dispute status' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',d.id,'job_id',d.job_id,'raised_by',d.raised_by,'reason',d.reason,'status',d.status,'created_at',d.created_at,
      'customer_name',customer.full_name,'provider_name',provider.business_name,'job_status',j.status,
      'category',category.name,'area_name',request.area_name
    ) order by d.created_at desc)
    from public.job_disputes d
    join public.jobs j on j.id=d.job_id
    join public.service_requests request on request.id=j.request_id
    left join public.profiles customer on customer.id=j.customer_id
    left join public.providers provider on provider.id=j.provider_id
    left join public.service_categories category on category.id=request.category_id
    where p_status is null or d.status=p_status
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_job_disputes(text) from public, anon;
grant execute on function public.admin_list_job_disputes(text) to authenticated;

create or replace function public.admin_update_job_dispute(p_dispute_id uuid,p_status text,p_notes text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare dispute public.job_disputes%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status not in ('under_review','resolved','dismissed') then raise exception 'Unknown dispute status' using errcode='22023'; end if;
  if nullif(btrim(p_notes),'') is null or length(p_notes)>2000 then raise exception 'A handling note is required (up to 2000 characters)' using errcode='22023'; end if;
  select * into dispute from public.job_disputes where id=p_dispute_id for update;
  if not found then raise exception 'Job dispute not found' using errcode='P0002'; end if;
  if dispute.status in ('resolved','dismissed') then raise exception 'This dispute has already been closed' using errcode='22023'; end if;
  update public.job_disputes set status=p_status,resolution_notes=btrim(p_notes),
    resolved_at=case when p_status in ('resolved','dismissed') then now() else null end,
    resolved_by=case when p_status in ('resolved','dismissed') then auth.uid() else null end
  where id=p_dispute_id;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'job_dispute_'||p_status,'job_dispute',p_dispute_id,btrim(p_notes),jsonb_build_object('job_id',dispute.job_id));
  return true;
end;
$$;
revoke all on function public.admin_update_job_dispute(uuid,text,text) from public, anon;
grant execute on function public.admin_update_job_dispute(uuid,text,text) to authenticated;
