-- Phase 16 builds job management on the existing jobs/provider_responses tables.
-- Jobs are created only by a customer selecting a response to their request.
alter table public.service_requests add column if not exists cancellation_reason text;

-- Requests remain editable through normal client RLS, but status changes are reserved for RPCs.
revoke update on public.service_requests from public, anon, authenticated;
grant update (title, description, phone, address, area_name, county, latitude, longitude,
  urgency, preferred_time, budget_min, budget_max, updated_at)
  on public.service_requests to authenticated;

-- Provider responses are submitted/accepted through the ownership-checked workflow RPCs.
revoke all on public.provider_responses from public, anon, authenticated;
grant select on public.provider_responses to authenticated;

-- Customers/providers read their existing jobs via RLS. State and ownership writes use RPCs.
revoke all on public.jobs from public, anon, authenticated;
grant select on public.jobs to authenticated;

-- Providers may edit their profile fields, but aggregate, verification, and
-- matching fields are database-managed. Revoke table-level privileges first:
-- column-level REVOKE alone cannot override an existing table-level grant.
revoke insert, update on public.providers from public, anon, authenticated;
revoke insert (rating_average, total_reviews, total_jobs, completed_jobs, response_rate,
  verification_status, verification_notes)
  on public.providers from public, anon, authenticated;
revoke update (rating_average, total_reviews, total_jobs, completed_jobs, response_rate,
  verification_status, verification_notes)
  on public.providers from public, anon, authenticated;
grant select on public.providers to authenticated;
grant insert (id, business_name, bio, phone, whatsapp_number, profile_image_url, is_available, is_online)
  on public.providers to authenticated;
grant update (business_name, bio, phone, whatsapp_number, profile_image_url, is_available, is_online, updated_at)
  on public.providers to authenticated;

-- Preserve admin verification capability without granting authenticated users
-- direct access to provider verification or aggregate columns.
create or replace function public.admin_update_provider_verification(
  p_provider_id uuid,
  p_verification_status text,
  p_verification_notes text default null
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare changed_count integer;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_verification_status not in ('pending','verified','rejected','suspended') then
    raise exception 'Unknown provider verification status' using errcode='22023';
  end if;
  update public.providers
  set verification_status=p_verification_status, verification_notes=p_verification_notes, updated_at=now()
  where id=p_provider_id;
  get diagnostics changed_count=row_count;
  return changed_count > 0;
end; $$;
revoke all on function public.admin_update_provider_verification(uuid,text,text) from public, anon;
grant execute on function public.admin_update_provider_verification(uuid,text,text) to authenticated;

create or replace function public.respond_to_service_request(
  p_request_id uuid,
  p_message text,
  p_quoted_price numeric default null,
  p_estimated_arrival_minutes integer default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_match public.request_matches%rowtype;
  v_request public.service_requests%rowtype;
  v_response_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active=true)
     or not exists (select 1 from public.providers p where p.id=auth.uid() and p.verification_status='verified' and p.is_available=true) then
    raise exception 'An active verified provider is required' using errcode='42501';
  end if;
  if nullif(btrim(p_message),'') is null or length(p_message)>2000 then raise exception 'A response message of up to 2000 characters is required' using errcode='22023'; end if;
  if p_quoted_price is not null and p_quoted_price < 0 then raise exception 'Quoted price cannot be negative' using errcode='22023'; end if;
  if p_estimated_arrival_minutes is not null and p_estimated_arrival_minutes < 0 then raise exception 'Arrival estimate cannot be negative' using errcode='22023'; end if;
  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found or v_request.status not in ('open','matching','responses_received') then raise exception 'Request is not accepting responses' using errcode='22023'; end if;
  select * into v_match from public.request_matches where request_id=p_request_id and provider_id=auth.uid() for update;
  if not found or v_match.status not in ('pending','notified','viewed') then raise exception 'No active match exists for this provider and request' using errcode='42501'; end if;
  if not exists (
    select 1 from public.provider_services ps
    join public.service_areas sa on sa.provider_id=ps.provider_id
    where ps.provider_id=auth.uid() and ps.category_id=v_request.category_id and ps.is_active=true
      and ((nullif(btrim(v_request.area_name),'') is not null and lower(btrim(sa.area_name))=lower(btrim(v_request.area_name)))
        or (v_request.latitude is not null and v_request.longitude is not null and sa.latitude is not null and sa.longitude is not null
          and 6371*2*asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude-sa.latitude)/2),2)
            + cos(radians(sa.latitude))*cos(radians(v_request.latitude))*power(sin(radians(v_request.longitude-sa.longitude)/2),2)
          ))) <= sa.radius_km))
      and (nullif(btrim(v_request.county),'') is null or nullif(btrim(sa.county),'') is null or lower(btrim(sa.county))=lower(btrim(v_request.county)))
  ) then raise exception 'Provider service or area eligibility has changed' using errcode='42501'; end if;
  insert into public.provider_responses(request_id,provider_id,match_id,message,quoted_price,estimated_arrival_minutes,status)
  values(p_request_id,auth.uid(),v_match.id,btrim(p_message),p_quoted_price,p_estimated_arrival_minutes,'pending')
  returning id into v_response_id;
  update public.request_matches set status='responded', updated_at=now() where id=v_match.id;
  update public.service_requests set status='responses_received', updated_at=now()
    where id=p_request_id and status in ('open','matching');
  return v_response_id;
end; $$;
revoke all on function public.respond_to_service_request(uuid,text,numeric,integer) from public, anon;
grant execute on function public.respond_to_service_request(uuid,text,numeric,integer) to authenticated;

create or replace function public.decline_service_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare changed_count integer;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='provider' and is_active=true) then
    raise exception 'Active provider required' using errcode='42501';
  end if;
  update public.request_matches set status='declined', updated_at=now()
  where request_id=p_request_id and provider_id=auth.uid() and status in ('pending','notified','viewed');
  get diagnostics changed_count=row_count;
  return changed_count>0;
end; $$;
revoke all on function public.decline_service_request(uuid) from public, anon;
grant execute on function public.decline_service_request(uuid) to authenticated;

drop function if exists public.get_provider_leads();
create function public.get_provider_leads()
returns table(request_id uuid,category_name text,area_name text,county text,urgency text,title text,description text,
  match_status text,match_rank integer,created_at timestamptz,response_status text,response_id uuid,
  preferred_time text,budget_min numeric,budget_max numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active=true) then
    raise exception 'Active provider required' using errcode='42501';
  end if;
  return query select sr.id,sc.name,sr.area_name,sr.county,sr.urgency,sr.title,sr.description,rm.status,rm.match_rank,
    sr.created_at,pr.status,pr.id,sr.preferred_time::text,sr.budget_min::numeric,sr.budget_max::numeric
  from public.request_matches rm join public.service_requests sr on sr.id=rm.request_id
  join public.service_categories sc on sc.id=sr.category_id
  left join public.provider_responses pr on pr.request_id=sr.id and pr.provider_id=auth.uid()
  where rm.provider_id=auth.uid() and rm.status in ('pending','notified','viewed','responded')
    and sr.status in ('open','matching','responses_received')
  order by rm.match_rank nulls last,sr.created_at desc;
end; $$;
revoke all on function public.get_provider_leads() from public, anon;
grant execute on function public.get_provider_leads() to authenticated;

create or replace function public.select_provider_response(p_response_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_response public.provider_responses%rowtype;
  v_request public.service_requests%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_response from public.provider_responses where id=p_response_id;
  if not found then raise exception 'Provider response not found' using errcode='P0002'; end if;
  select * into v_request from public.service_requests where id=v_response.request_id for update;
  if not found or v_request.customer_id<>auth.uid() then raise exception 'Not authorized to select this response' using errcode='42501'; end if;
  if v_request.status not in ('open','matching','responses_received') then raise exception 'Request is no longer accepting provider selection' using errcode='22023'; end if;
  if v_response.status<>'pending' then raise exception 'This provider response is no longer available' using errcode='22023'; end if;
  if not exists(select 1 from public.request_matches rm where rm.id=v_response.match_id and rm.request_id=v_response.request_id
      and rm.provider_id=v_response.provider_id and rm.status='responded') then
    raise exception 'Response is not backed by an active provider match' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles pr join public.providers p on p.id=pr.id
      join public.provider_services ps on ps.provider_id=p.id and ps.category_id=v_request.category_id and ps.is_active=true
      join public.service_areas sa on sa.provider_id=p.id
      where pr.id=v_response.provider_id and pr.role='provider' and pr.is_active=true
        and p.verification_status='verified' and p.is_available=true
        and ((nullif(btrim(v_request.area_name),'') is not null and lower(btrim(sa.area_name))=lower(btrim(v_request.area_name)))
          or (v_request.latitude is not null and v_request.longitude is not null and sa.latitude is not null and sa.longitude is not null
            and 6371*2*asin(sqrt(least(1::double precision,
              power(sin(radians(v_request.latitude-sa.latitude)/2),2)
              + cos(radians(sa.latitude))*cos(radians(v_request.latitude))*power(sin(radians(v_request.longitude-sa.longitude)/2),2)
            ))) <= sa.radius_km))
        and (nullif(btrim(v_request.county),'') is null or nullif(btrim(sa.county),'') is null or lower(btrim(sa.county))=lower(btrim(v_request.county)))) then
    raise exception 'Provider no longer meets this request eligibility' using errcode='42501';
  end if;
  insert into public.jobs(request_id,customer_id,provider_id,response_id,status,agreed_price,created_at,updated_at)
  values(v_request.id,v_request.customer_id,v_response.provider_id,v_response.id,'assigned',v_response.quoted_price,now(),now())
  returning id into v_job_id;
  update public.provider_responses set status='accepted', updated_at=now() where id=v_response.id;
  update public.provider_responses set status='rejected', updated_at=now()
    where request_id=v_request.id and id<>v_response.id and status='pending';
  update public.request_matches set status='cancelled', updated_at=now()
    where request_id=v_request.id and provider_id<>v_response.provider_id and status in ('pending','notified','viewed','responded');
  update public.service_requests set status='provider_selected', updated_at=now() where id=v_request.id;
  return v_job_id;
exception when unique_violation then
  raise exception 'A provider has already been selected for this request' using errcode='23505';
end; $$;
revoke all on function public.select_provider_response(uuid) from public, anon;
grant execute on function public.select_provider_response(uuid) to authenticated;

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
  elsif p_action='complete' and j.status='in_progress' then next_status:='completed';
  else raise exception 'Invalid job action for current status' using errcode='22023'; end if;
  update public.jobs set status=next_status, started_at=case when next_status='in_progress' then coalesce(started_at,now()) else started_at end,
    completed_at=case when next_status='completed' then now() else completed_at end, updated_at=now() where id=p_job_id;
  if next_status in ('in_progress','completed') then
    update public.service_requests set status=next_status, updated_at=now() where id=j.request_id;
  end if;
  return next_status;
end; $$;
revoke all on function public.advance_job(uuid,text) from public, anon;
grant execute on function public.advance_job(uuid,text) to authenticated;

create or replace function public.cancel_service_request(p_request_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.service_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'A cancellation reason is required (up to 1000 characters)' using errcode='22023'; end if;
  select * into r from public.service_requests where id=p_request_id for update;
  if not found or (r.customer_id<>auth.uid() and not coalesce(public.is_admin(),false)) then raise exception 'Not authorized to cancel this request' using errcode='42501'; end if;
  if r.status not in ('open','matching','responses_received') then raise exception 'Request cannot be cancelled in its current state' using errcode='22023'; end if;
  update public.service_requests set status='cancelled', cancellation_reason=btrim(p_reason), updated_at=now() where id=p_request_id;
  update public.request_matches set status='cancelled', updated_at=now() where request_id=p_request_id and status in ('pending','notified','viewed','responded');
  update public.provider_responses set status='rejected', updated_at=now() where request_id=p_request_id and status='pending';
  return true;
end; $$;
revoke all on function public.cancel_service_request(uuid,text) from public, anon;
grant execute on function public.cancel_service_request(uuid,text) to authenticated;

create or replace function public.cancel_job(p_job_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.jobs%rowtype; admin_user boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'A cancellation reason is required (up to 1000 characters)' using errcode='22023'; end if;
  select * into j from public.jobs where id=p_job_id for update;
  admin_user:=coalesce(public.is_admin(),false);
  if not found or (j.customer_id<>auth.uid() and j.provider_id<>auth.uid() and not admin_user) then raise exception 'Not authorized to cancel this job' using errcode='42501'; end if;
  if j.status not in ('assigned','accepted','on_the_way','arrived','in_progress') then raise exception 'Job cannot be cancelled in its current state' using errcode='22023'; end if;
  update public.jobs set status='cancelled',cancelled_at=now(),cancellation_reason=btrim(p_reason),updated_at=now() where id=p_job_id;
  update public.service_requests set status='cancelled',cancellation_reason=btrim(p_reason),updated_at=now() where id=j.request_id;
  update public.request_matches set status='cancelled',updated_at=now() where request_id=j.request_id and status in ('pending','notified','viewed','responded');
  return true;
end; $$;
revoke all on function public.cancel_job(uuid,text) from public, anon;
grant execute on function public.cancel_job(uuid,text) to authenticated;

-- Customer-safe view: customer contact is returned only for their selected provider/job.
create or replace function public.get_customer_request_details(p_request_id uuid)
returns table(response_id uuid,provider_id uuid,business_name text,provider_name text,rating_average numeric,total_reviews integer,
  message text,quoted_price numeric,estimated_arrival_minutes integer,response_status text,job_id uuid,job_status text,
  agreed_price numeric,started_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,provider_contact text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.service_requests sr where sr.id=p_request_id and sr.customer_id=auth.uid()) then
    raise exception 'Request not found or not owned by this customer' using errcode='42501';
  end if;
  return query select pr.id,p.id,p.business_name,profile.full_name,p.rating_average::numeric,p.total_reviews::integer,pr.message,pr.quoted_price,
    pr.estimated_arrival_minutes,pr.status,j.id,j.status,j.agreed_price,j.started_at,j.completed_at,j.cancelled_at,
    case when j.id is not null and j.provider_id=p.id and j.status<>'cancelled' then coalesce(p.whatsapp_number,p.phone) else null end
  from public.provider_responses pr join public.providers p on p.id=pr.provider_id
  left join public.profiles profile on profile.id=p.id
  left join public.jobs j on j.response_id=pr.id and j.request_id=p_request_id
  where pr.request_id=p_request_id and pr.status in ('pending','accepted','rejected')
  order by (j.id is not null) desc,pr.created_at desc;
end; $$;
revoke all on function public.get_customer_request_details(uuid) from public, anon;
grant execute on function public.get_customer_request_details(uuid) to authenticated;

create or replace function public.get_provider_jobs()
returns table(job_id uuid,request_id uuid,customer_name text,customer_phone text,category_name text,title text,description text,
  address text,area_name text,county text,latitude double precision,longitude double precision,urgency text,preferred_time text,
  budget_min numeric,budget_max numeric,status text,agreed_price numeric,started_at timestamptz,completed_at timestamptz,
  cancelled_at timestamptz,cancellation_reason text,created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='provider') then raise exception 'Provider account required' using errcode='42501'; end if;
  return query select j.id,sr.id,profile.full_name,sr.phone,sc.name,sr.title,sr.description,sr.address,sr.area_name,sr.county,
    sr.latitude::double precision,sr.longitude::double precision,sr.urgency,sr.preferred_time::text,sr.budget_min::numeric,sr.budget_max::numeric,j.status,j.agreed_price,j.started_at,
    j.completed_at,j.cancelled_at,j.cancellation_reason,j.created_at
  from public.jobs j join public.service_requests sr on sr.id=j.request_id
  left join public.profiles profile on profile.id=j.customer_id
  left join public.service_categories sc on sc.id=sr.category_id
  where j.provider_id=auth.uid() order by j.created_at desc;
end; $$;
revoke all on function public.get_provider_jobs() from public, anon;
grant execute on function public.get_provider_jobs() to authenticated;

create or replace function public.get_admin_jobs(p_status text default null)
returns table(job_id uuid,request_id uuid,customer_id uuid,customer_name text,provider_id uuid,business_name text,
  title text,area_name text,status text,agreed_price numeric,created_at timestamptz,started_at timestamptz,
  completed_at timestamptz,cancelled_at timestamptz,cancellation_reason text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('assigned','accepted','on_the_way','arrived','in_progress','completed','cancelled','disputed') then raise exception 'Unknown job status' using errcode='22023'; end if;
  return query select j.id,j.request_id,j.customer_id,customer.full_name,j.provider_id,p.business_name,sr.title,sr.area_name,
    j.status,j.agreed_price,j.created_at,j.started_at,j.completed_at,j.cancelled_at,j.cancellation_reason
  from public.jobs j join public.service_requests sr on sr.id=j.request_id
  left join public.profiles customer on customer.id=j.customer_id
  left join public.providers p on p.id=j.provider_id
  where p_status is null or j.status=p_status order by j.created_at desc;
end; $$;
revoke all on function public.get_admin_jobs(text) from public, anon;
grant execute on function public.get_admin_jobs(text) to authenticated;

-- Expand Phase 15's existing notification stream for responses and jobs.
alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in ('provider_match','request_status','provider_response','job_assigned','job_status','legacy'));

create or replace function public.notify_provider_response()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n_id uuid;
begin
  insert into public.notifications(recipient_id,event_type,request_id,match_id,event_key,title,body,data)
  select sr.customer_id,'provider_response',new.request_id,new.match_id,'response:'||new.id::text,
    'Provider responded','A provider sent a response to your service request',
    jsonb_build_object('screen','/(customer)/requests','requestId',new.request_id::text)
  from public.service_requests sr where sr.id=new.request_id
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end; $$;
revoke all on function public.notify_provider_response() from public, anon, authenticated;
drop trigger if exists provider_responses_notify_customer on public.provider_responses;
create trigger provider_responses_notify_customer after insert on public.provider_responses
for each row execute function public.notify_provider_response();

create or replace function public.notify_job_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n_id uuid; recipient uuid; title_text text; body_text text; screen_text text;
begin
  if tg_op='INSERT' then
    recipient:=new.provider_id; title_text:='You have been selected'; body_text:='A customer selected you for a service request'; screen_text:='/(provider)/jobs';
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    values(recipient,'job_assigned',new.request_id,'job-assigned:'||new.id::text,title_text,body_text,
      jsonb_build_object('screen',screen_text,'requestId',new.request_id::text,'jobId',new.id::text))
    on conflict(event_key) do nothing returning id into n_id;
  else
    if new.status is not distinct from old.status then return new; end if;
    if auth.uid()=new.customer_id then recipient:=new.provider_id; screen_text:='/(provider)/jobs';
    else recipient:=new.customer_id; screen_text:='/(customer)/requests'; end if;
    title_text:='Job update'; body_text:='Your service job is now '||replace(new.status,'_',' ');
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    values(recipient,'job_status',new.request_id,'job-status:'||new.id::text||':'||new.status,title_text,body_text,
      jsonb_build_object('screen',screen_text,'requestId',new.request_id::text,'jobId',new.id::text))
    on conflict(event_key) do nothing returning id into n_id;
  end if;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end; $$;
revoke all on function public.notify_job_change() from public, anon, authenticated;
drop trigger if exists jobs_notify_assigned on public.jobs;
create trigger jobs_notify_assigned after insert on public.jobs for each row execute function public.notify_job_change();
drop trigger if exists jobs_notify_status on public.jobs;
create trigger jobs_notify_status after update of status on public.jobs for each row execute function public.notify_job_change();

-- Avoid duplicate status notices for job transitions already represented by job_status.
create or replace function public.enqueue_request_status_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n_id uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('in_progress','completed','cancelled') and exists (
    select 1 from public.jobs j where j.request_id=new.id and j.status=new.status
  ) then return new; end if;
  if new.status='responses_received' and exists(select 1 from public.provider_responses pr where pr.request_id=new.id) then return new; end if;
  insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
  values (new.customer_id,'request_status',new.id,'request-status:'||new.id::text||':'||new.status,
    'Request update','Your service request is now '||replace(new.status,'_',' '),
    jsonb_build_object('screen','/(customer)/requests','requestId',new.id::text))
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end; $$;
revoke all on function public.enqueue_request_status_notification() from public, anon, authenticated;

-- New job rows are visible only to their customer/provider using the existing RLS.
do $$ begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; when undefined_object then null; end $$;
