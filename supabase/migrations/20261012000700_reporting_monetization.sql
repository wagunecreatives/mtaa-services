-- Phase 31 reporting and Phase 32 provider plans / featured listings.

alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'provider_match','new_request','request_status','provider_response','provider_accepted','job_assigned','job_status',
  'job_completion_confirmation','job_completed','review_reminder','review_received','new_message','job_reminder',
  'subscription_expiry','featured_listing_expiry','report_update','legacy'
));

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  report_type text not null check (report_type in ('fraud','bad_service','fake_provider','harassment','incorrect_information','spam')),
  description text not null check (length(btrim(description)) between 5 and 3000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  admin_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_reports_status_created_idx on public.user_reports(status,created_at desc);
alter table public.user_reports enable row level security;
revoke all on public.user_reports from public,anon,authenticated;
grant select on public.user_reports to authenticated;
drop policy if exists "Admins can read user reports" on public.user_reports;
create policy "Admins can read user reports" on public.user_reports for select to authenticated using (coalesce(public.is_admin(),false));

create or replace function public.submit_user_report(
  p_report_type text,p_description text,p_reported_user_id uuid default null,p_job_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare report_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_report_type not in ('fraud','bad_service','fake_provider','harassment','incorrect_information','spam') then
    raise exception 'Select a valid report reason' using errcode='22023';
  end if;
  if nullif(btrim(p_description),'') is null or length(p_description)>3000 then
    raise exception 'Describe the issue in 5 to 3000 characters' using errcode='22023';
  end if;
  if p_reported_user_id=auth.uid() then raise exception 'You cannot report your own account' using errcode='22023'; end if;
  if p_reported_user_id is not null and not exists(select 1 from public.profiles where id=p_reported_user_id) then
    raise exception 'Reported account not found' using errcode='P0002';
  end if;
  if p_job_id is not null and not exists(select 1 from public.jobs where id=p_job_id and auth.uid() in (customer_id,provider_id)) then
    raise exception 'You can only attach a job you participated in' using errcode='42501';
  end if;
  if p_job_id is not null and p_reported_user_id is not null and not exists(
    select 1 from public.jobs where id=p_job_id and auth.uid() in (customer_id,provider_id) and p_reported_user_id in (customer_id,provider_id)
  ) then raise exception 'The reported account must be a participant in the attached job' using errcode='42501'; end if;
  insert into public.user_reports(reporter_id,reported_user_id,job_id,report_type,description)
  values(auth.uid(),p_reported_user_id,p_job_id,p_report_type,btrim(p_description)) returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.submit_user_report(text,text,uuid,uuid) from public,anon;
grant execute on function public.submit_user_report(text,text,uuid,uuid) to authenticated;

create or replace function public.admin_list_user_reports(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('open','in_progress','resolved','dismissed') then raise exception 'Unknown report status' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
    'reporter_name',reporter.full_name,'reporter_phone',reporter.phone,'reported_name',target.full_name,
    'job_status',j.status,'category',category.name,'area_name',request.area_name,'provider_name',provider.business_name
  ) order by r.created_at desc)
  from public.user_reports r left join public.profiles reporter on reporter.id=r.reporter_id
  left join public.profiles target on target.id=r.reported_user_id left join public.jobs j on j.id=r.job_id
  left join public.service_requests request on request.id=j.request_id left join public.service_categories category on category.id=request.category_id
  left join public.providers provider on provider.id=j.provider_id
  where p_status is null or r.status=p_status),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_user_reports(text) from public,anon;
grant execute on function public.admin_list_user_reports(text) to authenticated;

create or replace function public.admin_update_user_report(p_report_id uuid,p_status text,p_notes text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.user_reports%rowtype; notice_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status not in ('in_progress','resolved','dismissed') then raise exception 'Unknown report status' using errcode='22023'; end if;
  if nullif(btrim(p_notes),'') is null or length(p_notes)>2000 then raise exception 'An investigation note is required (up to 2000 characters)' using errcode='22023'; end if;
  select * into r from public.user_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  update public.user_reports set status=p_status,admin_notes=btrim(p_notes),
    resolved_by=case when p_status in ('resolved','dismissed') then auth.uid() else null end,
    resolved_at=case when p_status in ('resolved','dismissed') then now() else null end where id=p_report_id;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
    values(auth.uid(),'user_report_'||p_status,'user_report',r.id,btrim(p_notes),jsonb_build_object('type',r.report_type,'reporter_id',r.reporter_id));
  insert into public.notifications(recipient_id,event_type,event_key,title,body,data)
    values(r.reporter_id,'report_update','user-report-status:'||r.id::text||':'||p_status,'Report update',
      'Your report is now '||replace(p_status,'_',' '),jsonb_build_object('screen','/notifications','reportId',r.id::text))
    on conflict(event_key) do nothing returning id into notice_id;
  if notice_id is not null then insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing; end if;
  return true;
end;
$$;
revoke all on function public.admin_update_user_report(uuid,text,text) from public,anon;
grant execute on function public.admin_update_user_report(uuid,text,text) to authenticated;

create table if not exists public.provider_plan_catalog (
  plan_key text primary key check (plan_key in ('free','pro','business','premium')),
  display_name text not null,
  price_kes numeric(10,2) not null check (price_kes>=0),
  billing_interval text not null check (billing_interval in ('trial','week','unspecified')),
  trial_days integer not null default 0 check (trial_days>=0),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.provider_plan_catalog(plan_key,display_name,price_kes,billing_interval,trial_days,features) values
  ('free','FREE',0,'trial',7,'["Basic profile","Limited leads"]'::jsonb),
  ('pro','PRO',100,'week',0,'["More leads","WhatsApp","Reviews","Verified badge"]'::jsonb),
  ('business','BUSINESS',599,'unspecified',0,'["Priority placement","Analytics","More leads","Featured profile"]'::jsonb),
  ('premium','PREMIUM',999,'unspecified',0,'["Homepage placement","Promotion","Priority leads","CRM features"]'::jsonb)
on conflict(plan_key) do update set display_name=excluded.display_name,price_kes=excluded.price_kes,
  billing_interval=excluded.billing_interval,trial_days=excluded.trial_days,features=excluded.features,updated_at=now();
alter table public.provider_plan_catalog enable row level security;
revoke all on public.provider_plan_catalog from public,anon,authenticated;
grant select on public.provider_plan_catalog to authenticated;
drop policy if exists "Providers view active plans" on public.provider_plan_catalog;
create policy "Providers view active plans" on public.provider_plan_catalog for select to authenticated
  using (is_active and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active));

create table if not exists public.provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  plan_key text not null references public.provider_plan_catalog(plan_key),
  status text not null check (status in ('trial','awaiting_payment','active','expired','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists provider_subscriptions_provider_created_idx on public.provider_subscriptions(provider_id,created_at desc);
alter table public.provider_subscriptions enable row level security;
revoke all on public.provider_subscriptions from public,anon,authenticated;
grant select on public.provider_subscriptions to authenticated;
drop policy if exists "Providers view own subscriptions" on public.provider_subscriptions;
create policy "Providers view own subscriptions" on public.provider_subscriptions for select to authenticated using (provider_id=auth.uid());
create unique index if not exists provider_subscriptions_one_trial_idx on public.provider_subscriptions(provider_id) where plan_key='free';
create unique index if not exists provider_subscriptions_one_current_idx on public.provider_subscriptions(provider_id) where status in ('trial','active');

create table if not exists public.featured_listings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  area_name text not null,
  duration_days integer not null check (duration_days between 1 and 365),
  status text not null check (status in ('awaiting_payment','active','expired','suspended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists featured_listings_discovery_idx on public.featured_listings(category_id,lower(area_name),ends_at) where status='active';
alter table public.featured_listings enable row level security;
revoke all on public.featured_listings from public,anon,authenticated;
grant select on public.featured_listings to authenticated;
drop policy if exists "Providers view own featured listings" on public.featured_listings;
create policy "Providers view own featured listings" on public.featured_listings for select to authenticated using (provider_id=auth.uid());

create table if not exists public.monetization_payments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  subscription_id uuid references public.provider_subscriptions(id) on delete set null,
  featured_listing_id uuid references public.featured_listings(id) on delete set null,
  amount_kes numeric(10,2) not null check (amount_kes>0),
  payment_reference text,
  status text not null default 'awaiting_reference' check (status in ('awaiting_reference','submitted','verified','rejected')),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((subscription_id is not null)<>(featured_listing_id is not null))
);
create unique index if not exists monetization_payment_reference_unique on public.monetization_payments(lower(payment_reference)) where payment_reference is not null;
create index if not exists monetization_payments_status_idx on public.monetization_payments(status,created_at desc);
alter table public.monetization_payments enable row level security;
revoke all on public.monetization_payments from public,anon,authenticated;
grant select on public.monetization_payments to authenticated;
drop policy if exists "Providers view own monetization payments" on public.monetization_payments;
create policy "Providers view own monetization payments" on public.monetization_payments for select to authenticated using (provider_id=auth.uid());

create or replace function public.start_provider_free_trial()
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare provider_uuid uuid; subscription_uuid uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles profile join public.providers provider on provider.id=profile.id
    where profile.id=auth.uid() and profile.role='provider' and profile.is_active and provider.verification_status='verified' and provider.phone_verified) then
    raise exception 'Active, verified provider account required' using errcode='42501';
  end if;
  if exists(select 1 from public.provider_subscriptions where provider_id=auth.uid() and plan_key='free') then
    raise exception 'The free trial has already been used' using errcode='22023';
  end if;
  insert into public.provider_subscriptions(provider_id,plan_key,status,starts_at,ends_at)
  values(auth.uid(),'free','trial',now(),now()+interval '7 days') returning id into subscription_uuid;
  return subscription_uuid;
end;
$$;
revoke all on function public.start_provider_free_trial() from public,anon;
grant execute on function public.start_provider_free_trial() to authenticated;

create or replace function public.request_provider_subscription(p_plan_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.provider_plan_catalog%rowtype; subscription_uuid uuid; payment_uuid uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles profile join public.providers provider on provider.id=profile.id
    where profile.id=auth.uid() and profile.role='provider' and profile.is_active and provider.verification_status='verified' and provider.phone_verified) then
    raise exception 'Active, verified provider account required' using errcode='42501';
  end if;
  select * into plan from public.provider_plan_catalog where plan_key=p_plan_key and is_active for share;
  if not found or plan.price_kes<=0 then raise exception 'Select an available paid plan' using errcode='22023'; end if;
  if exists(select 1 from public.monetization_payments where provider_id=auth.uid() and status in ('awaiting_reference','submitted')) then raise exception 'You already have a payment awaiting review' using errcode='22023'; end if;
  insert into public.provider_subscriptions(provider_id,plan_key,status) values(auth.uid(),p_plan_key,'awaiting_payment') returning id into subscription_uuid;
  insert into public.monetization_payments(provider_id,subscription_id,amount_kes) values(auth.uid(),subscription_uuid,plan.price_kes) returning id into payment_uuid;
  return payment_uuid;
end;
$$;
revoke all on function public.request_provider_subscription(text) from public,anon;
grant execute on function public.request_provider_subscription(text) to authenticated;

create or replace function public.request_featured_listing(p_category_id uuid,p_area_name text,p_duration_days integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare listing_uuid uuid; payment_uuid uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles profile join public.providers provider on provider.id=profile.id
    where profile.id=auth.uid() and profile.role='provider' and profile.is_active and provider.verification_status='verified' and provider.phone_verified) then
    raise exception 'Active, verified provider account required' using errcode='42501';
  end if;
  if p_duration_days not between 1 and 365 or nullif(btrim(p_area_name),'') is null then raise exception 'Choose an area and a duration between 1 and 365 days' using errcode='22023'; end if;
  if not exists(select 1 from public.service_categories where id=p_category_id and is_active)
    or not exists(select 1 from public.provider_services where provider_id=auth.uid() and category_id=p_category_id and is_active) then
    raise exception 'Choose a category you actively offer' using errcode='22023';
  end if;
  if not exists(select 1 from public.service_areas where provider_id=auth.uid() and lower(area_name)=lower(btrim(p_area_name))) then
    raise exception 'Choose an area listed in your provider service areas' using errcode='22023';
  end if;
  if exists(select 1 from public.monetization_payments where provider_id=auth.uid() and status in ('awaiting_reference','submitted')) then raise exception 'You already have a payment awaiting review' using errcode='22023'; end if;
  insert into public.featured_listings(provider_id,category_id,area_name,duration_days,status)
  values(auth.uid(),p_category_id,btrim(p_area_name),p_duration_days,'awaiting_payment') returning id into listing_uuid;
  insert into public.monetization_payments(provider_id,featured_listing_id,amount_kes)
  values(auth.uid(),listing_uuid,100*p_duration_days) returning id into payment_uuid;
  return payment_uuid;
end;
$$;
revoke all on function public.request_featured_listing(uuid,text,integer) from public,anon;
grant execute on function public.request_featured_listing(uuid,text,integer) to authenticated;

create or replace function public.submit_monetization_payment_reference(p_payment_id uuid,p_reference text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if nullif(btrim(p_reference),'') is null or length(p_reference)>120 then raise exception 'Enter a valid payment transaction reference' using errcode='22023'; end if;
  update public.monetization_payments set payment_reference=btrim(p_reference),status='submitted'
  where id=p_payment_id and provider_id=auth.uid() and status='awaiting_reference';
  if not found then raise exception 'Payment record not found or already submitted' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.submit_monetization_payment_reference(uuid,text) from public,anon;
grant execute on function public.submit_monetization_payment_reference(uuid,text) to authenticated;

create or replace function public.cancel_monetization_payment_request(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.monetization_payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into payment from public.monetization_payments where id=p_payment_id and provider_id=auth.uid() for update;
  if not found or payment.status<>'awaiting_reference' then raise exception 'Only an order without a submitted reference can be cancelled' using errcode='42501'; end if;
  update public.monetization_payments set status='rejected' where id=payment.id;
  if payment.subscription_id is not null then update public.provider_subscriptions set status='cancelled' where id=payment.subscription_id and status='awaiting_payment'; end if;
  if payment.featured_listing_id is not null then update public.featured_listings set status='suspended' where id=payment.featured_listing_id and status='awaiting_payment'; end if;
  return true;
end;
$$;
revoke all on function public.cancel_monetization_payment_request(uuid) from public,anon;
grant execute on function public.cancel_monetization_payment_request(uuid) to authenticated;

create or replace function public.admin_list_monetization_payments(p_status text default 'submitted')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',payment.id,'provider_id',payment.provider_id,'business_name',provider.business_name,'owner_name',profile.full_name,
    'amount_kes',payment.amount_kes,'payment_reference',payment.payment_reference,'payment_status',payment.status,
    'subscription_id',sub.id,'plan_key',sub.plan_key,'plan_interval',plan.billing_interval,
    'featured_listing_id',listing.id,'category',category.name,'area_name',listing.area_name,'duration_days',listing.duration_days,
    'created_at',payment.created_at
  ) order by payment.created_at)
  from public.monetization_payments payment join public.providers provider on provider.id=payment.provider_id
  join public.profiles profile on profile.id=payment.provider_id
  left join public.provider_subscriptions sub on sub.id=payment.subscription_id left join public.provider_plan_catalog plan on plan.plan_key=sub.plan_key
  left join public.featured_listings listing on listing.id=payment.featured_listing_id left join public.service_categories category on category.id=listing.category_id
  where p_status is null or payment.status=p_status),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_monetization_payments(text) from public,anon;
grant execute on function public.admin_list_monetization_payments(text) to authenticated;

create or replace function public.admin_verify_monetization_payment(
  p_payment_id uuid,p_received_amount numeric,p_approved boolean,p_notes text,p_term_days integer default null
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.monetization_payments%rowtype; plan public.provider_plan_catalog%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if nullif(btrim(p_notes),'') is null then raise exception 'Verification notes are required' using errcode='22023'; end if;
  select * into payment from public.monetization_payments where id=p_payment_id for update;
  if not found or payment.status<>'submitted' then raise exception 'Submitted payment not found' using errcode='P0002'; end if;
  if p_approved and (payment.payment_reference is null or p_received_amount is distinct from payment.amount_kes) then
    raise exception 'Confirm the reference and exact received amount before activation' using errcode='22023';
  end if;
  update public.monetization_payments set status=case when p_approved then 'verified' else 'rejected' end,
    verified_by=auth.uid(),verified_at=now() where id=payment.id;
  if payment.subscription_id is not null then
    select plan_catalog.* into plan from public.provider_subscriptions subscription join public.provider_plan_catalog plan_catalog on plan_catalog.plan_key=subscription.plan_key where subscription.id=payment.subscription_id;
    if p_approved then
      if plan.billing_interval='unspecified' and (p_term_days is null or p_term_days not between 1 and 365) then raise exception 'Set a subscription duration between 1 and 365 days' using errcode='22023'; end if;
      update public.provider_subscriptions set status='cancelled' where provider_id=payment.provider_id and status in ('active','trial') and id<>payment.subscription_id;
      update public.provider_subscriptions set status='active',starts_at=now(),ends_at=now()+make_interval(days=>coalesce(p_term_days,7)) where id=payment.subscription_id;
    else update public.provider_subscriptions set status='cancelled' where id=payment.subscription_id; end if;
  elsif payment.featured_listing_id is not null then
    if p_approved then update public.featured_listings set status='active',starts_at=now(),ends_at=now()+make_interval(days=>duration_days) where id=payment.featured_listing_id;
    else update public.featured_listings set status='suspended' where id=payment.featured_listing_id; end if;
  end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
    values(auth.uid(),case when p_approved then 'monetization_payment_verified' else 'monetization_payment_rejected' end,
      'monetization_payment',payment.id,btrim(p_notes),jsonb_build_object('provider_id',payment.provider_id,'amount_kes',payment.amount_kes));
  return true;
end;
$$;
revoke all on function public.admin_verify_monetization_payment(uuid,numeric,boolean,text,integer) from public,anon;
grant execute on function public.admin_verify_monetization_payment(uuid,numeric,boolean,text,integer) to authenticated;

create or replace function public.admin_dashboard_today()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare start_at timestamptz;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  start_at:=date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  return jsonb_build_object(
    'users',(select count(*) from public.profiles where created_at>=start_at),
    'providers',(select count(*) from public.profiles where role='provider' and created_at>=start_at),
    'requests',(select count(*) from public.service_requests where created_at>=start_at),
    'jobs',(select count(*) from public.jobs where created_at>=start_at),
    'revenue_available',true,
    'revenue_kes',(select coalesce(sum(amount_kes),0) from public.monetization_payments where status='verified' and verified_at>=start_at)
  );
end;
$$;
revoke all on function public.admin_dashboard_today() from public,anon;
grant execute on function public.admin_dashboard_today() to authenticated;

-- Invoke this SECURITY DEFINER worker function hourly from a trusted scheduler
-- (Supabase Cron/Edge Function). It creates idempotent outbox notifications.
create or replace function public.process_due_platform_notifications()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer:=0; current_job record; current_subscription record; current_listing record; notice_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.provider_subscriptions set status='expired' where status in ('active','trial') and ends_at<=now();
  update public.featured_listings set status='expired' where status='active' and ends_at<=now();
  for current_job in select j.id,j.request_id,j.customer_id,j.provider_id,j.status from public.jobs j
    where j.status in ('assigned','accepted','on_the_way','arrived','in_progress','awaiting_confirmation') and j.updated_at<=now()-interval '24 hours'
  loop
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    values(current_job.customer_id,'job_reminder',current_job.request_id,'job-reminder:'||current_job.id::text||':customer:'||current_date::text,
      'Job reminder','Your service job is still in progress. Check in with your provider if you need an update.',
      jsonb_build_object('screen','/(customer)/requests','requestId',current_job.request_id::text,'jobId',current_job.id::text))
    on conflict(event_key) do nothing returning id into notice_id;
    if notice_id is not null then insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing; affected:=affected+1; end if;
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    values(current_job.provider_id,'job_reminder',current_job.request_id,'job-reminder:'||current_job.id::text||':provider:'||current_date::text,
      'Job reminder','You have an active service job awaiting an update.',
      jsonb_build_object('screen','/(provider)/jobs','requestId',current_job.request_id::text,'jobId',current_job.id::text))
    on conflict(event_key) do nothing returning id into notice_id;
    if notice_id is not null then insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing; affected:=affected+1; end if;
  end loop;
  for current_subscription in select subscription.id,subscription.provider_id,subscription.ends_at from public.provider_subscriptions subscription
    where subscription.status in ('active','trial') and subscription.ends_at>now() and subscription.ends_at<=now()+interval '24 hours'
  loop
    insert into public.notifications(recipient_id,event_type,event_key,title,body,data)
    values(current_subscription.provider_id,'subscription_expiry','subscription-expiry:'||current_subscription.id::text,
      'Plan expires soon','Your provider plan expires within 24 hours.',jsonb_build_object('screen','/(provider)/monetization'))
    on conflict(event_key) do nothing returning id into notice_id;
    if notice_id is not null then insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing; affected:=affected+1; end if;
  end loop;
  for current_listing in select listing.id,listing.provider_id,listing.ends_at from public.featured_listings listing
    where listing.status='active' and listing.ends_at>now() and listing.ends_at<=now()+interval '24 hours'
  loop
    insert into public.notifications(recipient_id,event_type,event_key,title,body,data)
    values(current_listing.provider_id,'featured_listing_expiry','featured-expiry:'||current_listing.id::text,
      'Featured listing expires soon','Your featured placement expires within 24 hours.',jsonb_build_object('screen','/(provider)/monetization'))
    on conflict(event_key) do nothing returning id into notice_id;
    if notice_id is not null then insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing; affected:=affected+1; end if;
  end loop;
  return affected;
end;
$$;
revoke all on function public.process_due_platform_notifications() from public,anon,authenticated;
grant execute on function public.process_due_platform_notifications() to service_role;

create or replace function public.get_active_featured_providers(p_category_id uuid default null,p_area_name text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'provider_id',provider.id,'business_name',provider.business_name,'bio',provider.bio,'profile_image_url',provider.profile_image_url,
    'rating_average',provider.rating_average,'total_reviews',provider.total_reviews,'category',category.name,'category_id',category.id,
    'area_name',listing.area_name,'featured_until',listing.ends_at
  ) order by provider.rating_average desc,listing.created_at desc)
  from public.featured_listings listing join public.providers provider on provider.id=listing.provider_id
  join public.profiles profile on profile.id=provider.id join public.service_categories category on category.id=listing.category_id
  where listing.status='active' and listing.starts_at<=now() and listing.ends_at>now() and profile.is_active
    and provider.verification_status='verified' and (p_category_id is null or listing.category_id=p_category_id)
    and (p_area_name is null or lower(listing.area_name)=lower(btrim(p_area_name)))),'[]'::jsonb);
end;
$$;
revoke all on function public.get_active_featured_providers(uuid,text) from public,anon;
grant execute on function public.get_active_featured_providers(uuid,text) to authenticated;
