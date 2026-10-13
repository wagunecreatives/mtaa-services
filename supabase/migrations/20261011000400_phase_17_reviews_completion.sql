-- Phase 17: customer-confirmed completion and one customer review per job.
-- This extends the Phase 16 lifecycle without changing its earlier migrations.

do $$
begin
  if to_regclass('public.jobs') is null
     or to_regclass('public.providers') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.service_requests') is null then
    raise exception 'Phase 17 requires the Phase 16 jobs, providers, profiles, and service_requests tables';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.jobs'::regclass and conname='jobs_request_id_key' and contype='u'
  ) then
    raise exception 'Phase 17 requires jobs_request_id_key';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='customer_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='provider_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='request_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='providers' and column_name='rating_average')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='providers' and column_name='total_reviews') then
    raise exception 'Phase 17 found a schema incompatible with the applied Phase 16 migration';
  end if;
end $$;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in ('assigned','accepted','on_the_way','arrived','in_progress',
             'awaiting_confirmation','completed','cancelled','disputed')
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  customer_id uuid not null,
  provider_id uuid not null,
  rating integer not null,
  review_text text,
  comment text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_job_id_key unique (job_id),
  constraint reviews_job_id_fkey foreign key (job_id) references public.jobs(id) on delete cascade,
  constraint reviews_customer_id_fkey foreign key (customer_id) references public.profiles(id) on delete restrict,
  constraint reviews_provider_id_fkey foreign key (provider_id) references public.providers(id) on delete restrict,
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_participant_check check (customer_id <> provider_id)
);

-- The live Phase 16 database already has a legacy reviews table using `comment`
-- and `is_visible`. Preserve it and its rows while adding the Phase 17 API field.
alter table public.reviews add column if not exists review_text text;
alter table public.reviews add column if not exists comment text;
alter table public.reviews add column if not exists is_visible boolean not null default true;
update public.reviews set review_text=comment where review_text is null and comment is not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_participant_check') then
    alter table public.reviews add constraint reviews_participant_check check (customer_id<>provider_id) not valid;
  end if;
end $$;

create index if not exists reviews_provider_created_at_idx on public.reviews(provider_id, created_at desc);
create index if not exists reviews_customer_created_at_idx on public.reviews(customer_id, created_at desc);
alter table public.reviews enable row level security;
revoke all on public.reviews from public, anon, authenticated;
grant select on public.reviews to authenticated;

drop policy if exists "Review participants and admins can view reviews" on public.reviews;
drop policy if exists "Users can view visible reviews" on public.reviews;
drop policy if exists "Customers can create reviews for their jobs" on public.reviews;
create policy "Review participants and admins can view reviews" on public.reviews
  for select to authenticated
  using (
    coalesce(public.is_admin(),false)
    or exists (select 1 from public.jobs j where j.id=reviews.job_id and j.customer_id=auth.uid())
    or (reviews.is_visible=true and exists (select 1 from public.jobs j where j.id=reviews.job_id and j.provider_id=auth.uid()))
  );

-- Phase 16 already withholds aggregate columns from authenticated clients.
-- Repeat the column-level revokes as a guard for this feature's protected fields.
revoke insert (rating_average,total_reviews) on public.providers from public, anon, authenticated;
revoke update (rating_average,total_reviews) on public.providers from public, anon, authenticated;

create or replace function public.refresh_provider_review_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_provider uuid;
  review_count integer;
  average_rating numeric;
begin
  select p.id into locked_provider from public.providers p where p.id=new.provider_id for update;
  if locked_provider is null then raise exception 'Review provider does not exist' using errcode='23503'; end if;
  select count(*)::integer, round(avg(r.rating)::numeric,2)
    into review_count, average_rating
    from public.reviews r where r.provider_id=new.provider_id;
  update public.providers
    set total_reviews=review_count, rating_average=coalesce(average_rating,0), updated_at=now()
    where id=new.provider_id;
  return new;
end;
$$;
revoke all on function public.refresh_provider_review_aggregate() from public, anon, authenticated;

drop trigger if exists reviews_refresh_provider_aggregate on public.reviews;
create trigger reviews_refresh_provider_aggregate
  after insert on public.reviews
  for each row execute function public.refresh_provider_review_aggregate();

-- The pre-existing reviews rows are the source of truth for current aggregates.
update public.providers p
set total_reviews=(select count(*)::integer from public.reviews r where r.provider_id=p.id),
    rating_average=coalesce((select round(avg(r.rating)::numeric,2) from public.reviews r where r.provider_id=p.id),0),
    updated_at=now();

create or replace function public.submit_job_review(
  p_job_id uuid,
  p_rating integer,
  p_review_text text default null
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
  if j.provider_id=auth.uid() then raise exception 'Customers cannot review themselves' using errcode='42501'; end if;
  insert into public.reviews(job_id,customer_id,provider_id,rating,review_text,comment)
  values(j.id,j.customer_id,j.provider_id,p_rating,nullif(btrim(p_review_text),''),nullif(btrim(p_review_text),''))
  returning id into review_id;
  return review_id;
exception when unique_violation then
  raise exception 'This job already has a review' using errcode='23505';
end;
$$;
revoke all on function public.submit_job_review(uuid,integer,text) from public, anon;
grant execute on function public.submit_job_review(uuid,integer,text) to authenticated;

create or replace function public.confirm_job_completion(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs%rowtype;
  affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customer_id<>auth.uid() then
    raise exception 'Job not found or not owned by this customer' using errcode='42501';
  end if;
  if j.status<>'awaiting_confirmation' then
    raise exception 'Job is not awaiting customer confirmation' using errcode='22023';
  end if;
  update public.jobs set status='completed',completed_at=now(),updated_at=now() where id=j.id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Job completion could not be confirmed' using errcode='40001'; end if;
  update public.service_requests set status='completed',updated_at=now()
    where id=j.request_id;
  return true;
end;
$$;
revoke all on function public.confirm_job_completion(uuid) from public, anon;
grant execute on function public.confirm_job_completion(uuid) to authenticated;

-- Replace only the provider's completion transition. All Phase 16 actions remain.
create or replace function public.advance_job(p_job_id uuid, p_action text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.jobs%rowtype; next_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.provider_id<>auth.uid() then raise exception 'Job not found or not assigned to this provider' using errcode='42501'; end if;
  if p_action='accept' and j.status='assigned' then next_status:='accepted';
  elsif p_action='on_the_way' and j.status='accepted' then next_status:='on_the_way';
  elsif p_action='arrived' and j.status='on_the_way' then next_status:='arrived';
  elsif p_action='start' and j.status in ('accepted','arrived') then next_status:='in_progress';
  elsif p_action='complete' and j.status='in_progress' then next_status:='awaiting_confirmation';
  else raise exception 'Invalid job action for current status' using errcode='22023'; end if;
  update public.jobs set status=next_status,
    started_at=case when next_status='in_progress' then coalesce(started_at,now()) else started_at end,
    updated_at=now() where id=p_job_id;
  if next_status='in_progress' then
    update public.service_requests set status='in_progress',updated_at=now() where id=j.request_id;
  end if;
  return next_status;
end;
$$;
revoke all on function public.advance_job(uuid,text) from public, anon;
grant execute on function public.advance_job(uuid,text) to authenticated;

create or replace function public.get_job_review_state(p_job_id uuid)
returns table(job_status text,review_id uuid,rating integer,review_text text,review_created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.jobs j where j.id=p_job_id
      and (j.customer_id=auth.uid() or j.provider_id=auth.uid() or coalesce(public.is_admin(),false))) then
    raise exception 'Job not found or not accessible' using errcode='42501';
  end if;
  return query select j.status,r.id,r.rating,r.review_text,r.created_at
    from public.jobs j left join public.reviews r on r.job_id=j.id where j.id=p_job_id;
end;
$$;
revoke all on function public.get_job_review_state(uuid) from public,anon;
grant execute on function public.get_job_review_state(uuid) to authenticated;

-- Keep the existing admin jobs RPC shape while accepting the new lifecycle state.
create or replace function public.get_admin_jobs(p_status text default null)
returns table(job_id uuid,request_id uuid,customer_id uuid,customer_name text,provider_id uuid,business_name text,
  title text,area_name text,status text,agreed_price numeric,created_at timestamptz,started_at timestamptz,
  completed_at timestamptz,cancelled_at timestamptz,cancellation_reason text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('assigned','accepted','on_the_way','arrived','in_progress','awaiting_confirmation','completed','cancelled','disputed') then
    raise exception 'Unknown job status' using errcode='22023';
  end if;
  return query select j.id,j.request_id,j.customer_id,customer.full_name,j.provider_id,p.business_name,sr.title,sr.area_name,
    j.status,j.agreed_price,j.created_at,j.started_at,j.completed_at,j.cancelled_at,j.cancellation_reason
  from public.jobs j join public.service_requests sr on sr.id=j.request_id
  left join public.profiles customer on customer.id=j.customer_id
  left join public.providers p on p.id=j.provider_id
  where p_status is null or j.status=p_status order by j.created_at desc;
end;
$$;
revoke all on function public.get_admin_jobs(text) from public,anon;
grant execute on function public.get_admin_jobs(text) to authenticated;

create or replace function public.get_provider_job_reviews()
returns table(job_id uuid,rating integer,review_text text,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider') then
    raise exception 'Provider account required' using errcode='42501';
  end if;
  return query select r.job_id,r.rating,r.review_text,r.created_at
    from public.reviews r where r.provider_id=auth.uid() order by r.created_at desc;
end;
$$;
revoke all on function public.get_provider_job_reviews() from public,anon;
grant execute on function public.get_provider_job_reviews() to authenticated;

create or replace function public.get_admin_job_reviews()
returns table(job_id uuid,rating integer,review_text text,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  return query select r.job_id,r.rating,r.review_text,r.created_at from public.reviews r order by r.created_at desc;
end;
$$;
revoke all on function public.get_admin_job_reviews() from public,anon;
grant execute on function public.get_admin_job_reviews() to authenticated;

-- A notification failure is isolated in a PL/pgSQL subtransaction, so it cannot
-- roll back the underlying completion or review operation.
alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in ('provider_match','request_status','provider_response','job_assigned','job_status',
    'job_completion_confirmation','job_completed','review_received','legacy')) not valid;
alter table public.notifications validate constraint notifications_event_type_check;

create or replace function public.notify_job_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n_id uuid; recipient uuid; event_name text; title_text text; body_text text; screen_text text;
begin
  begin
    if tg_op='INSERT' then
      recipient:=new.provider_id; event_name:='job_assigned'; title_text:='You have been selected';
      body_text:='A customer selected you for a service request'; screen_text:='/(provider)/jobs';
      insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
      values(recipient,event_name,new.request_id,'job-assigned:'||new.id::text,title_text,body_text,
        jsonb_build_object('screen',screen_text,'requestId',new.request_id::text,'jobId',new.id::text))
      on conflict(event_key) do nothing returning id into n_id;
    else
      if new.status is not distinct from old.status then return new; end if;
      if auth.uid()=new.customer_id then recipient:=new.provider_id; screen_text:='/(provider)/jobs';
      else recipient:=new.customer_id; screen_text:='/(customer)/requests'; end if;
      if new.status='awaiting_confirmation' then
        event_name:='job_completion_confirmation'; title_text:='Confirm job completion';
        body_text:='Your provider marked the job ready. Please confirm the work is complete.';
      elsif new.status='completed' then
        event_name:='job_completed'; title_text:='Job completion confirmed';
        body_text:='The customer confirmed that this job is complete.';
      else
        event_name:='job_status'; title_text:='Job update';
        body_text:='Your service job is now '||replace(new.status,'_',' ');
      end if;
      insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
      values(recipient,event_name,new.request_id,'job-status:'||new.id::text||':'||new.status,title_text,body_text,
        jsonb_build_object('screen',screen_text,'requestId',new.request_id::text,'jobId',new.id::text))
      on conflict(event_key) do nothing returning id into n_id;
    end if;
    if n_id is not null then
      insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing;
    end if;
  exception when others then
    raise warning 'Job notification enqueue failed for job %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.notify_job_change() from public,anon,authenticated;

create or replace function public.notify_review_received()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n_id uuid;
begin
  begin
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    select new.provider_id,'review_received',j.request_id,'review-received:'||new.id::text,
      'You received a review','A customer left feedback for a completed job',
      jsonb_build_object('screen','/(provider)/jobs','jobId',new.job_id::text,'requestId',j.request_id::text)
    from public.jobs j where j.id=new.job_id
    on conflict(event_key) do nothing returning id into n_id;
    if n_id is not null then
      insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing;
    end if;
  exception when others then
    raise warning 'Review notification enqueue failed for review %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.notify_review_received() from public,anon,authenticated;
drop trigger if exists reviews_notify_provider on public.reviews;
create trigger reviews_notify_provider after insert on public.reviews
  for each row execute function public.notify_review_received();

do $$ begin
  alter publication supabase_realtime add table public.reviews;
exception when duplicate_object then null; when undefined_object then null; end $$;
