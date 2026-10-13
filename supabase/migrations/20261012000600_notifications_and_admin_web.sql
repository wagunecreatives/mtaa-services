-- Notification coverage and secure operations for the separate admin web app.

alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check check (event_type in (
  'provider_match','new_request','request_status','provider_response','provider_accepted','job_assigned','job_status',
  'job_completion_confirmation','job_completed','review_reminder','review_received','new_message','job_reminder',
  'subscription_expiry','featured_listing_expiry','legacy'
));

-- A matched lead is the provider-facing new-request notification.
create or replace function public.enqueue_provider_match_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.service_requests%rowtype; category_name text; n_id uuid;
begin
  select * into r from public.service_requests where id=new.request_id;
  if not found then return new; end if;
  select sc.name into category_name from public.service_categories sc where sc.id=r.category_id;
  insert into public.notifications(recipient_id,event_type,request_id,match_id,event_key,title,body,data)
  values(new.provider_id,'new_request',new.request_id,new.id,'match:'||new.id::text,
    '🔧 New request near '||coalesce(nullif(r.area_name,''),'your area'),
    coalesce(category_name,'Service')||' request near '||coalesce(nullif(r.area_name,''),'your service area')||' is available.',
    jsonb_build_object('screen','/(provider)/leads','requestId',new.request_id::text))
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end;
$$;
revoke all on function public.enqueue_provider_match_notification() from public,anon,authenticated;

create or replace function public.notify_job_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n_id uuid; recipient uuid; event_name text; title_text text; body_text text; screen_text text;
begin
  begin
    if tg_op='INSERT' then
      recipient:=new.provider_id; event_name:='job_assigned'; title_text:='You have been selected';
      body_text:='A customer selected you for a service request'; screen_text:='/(provider)/jobs';
    else
      if new.status is not distinct from old.status then return new; end if;
      if auth.uid()=new.customer_id then recipient:=new.provider_id; screen_text:='/(provider)/jobs';
      else recipient:=new.customer_id; screen_text:='/(customer)/requests'; end if;
      if new.status='accepted' then
        event_name:='provider_accepted'; title_text:='Provider accepted'; body_text:='Your provider accepted the job.';
      elsif new.status='awaiting_confirmation' then
        event_name:='job_completion_confirmation'; title_text:='Confirm job completion'; body_text:='Your provider marked the job ready. Please confirm the work is complete.';
      elsif new.status='completed' then
        event_name:='job_completed'; title_text:='Job completed'; body_text:='The customer confirmed the job is complete.';
      else
        event_name:='job_status'; title_text:='Job update'; body_text:='Your service job is now '||replace(new.status,'_',' ');
      end if;
    end if;
    insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
    values(recipient,event_name,new.request_id,'job-status:'||new.id::text||':'||case when tg_op='INSERT' then 'assigned' else new.status end,
      title_text,body_text,jsonb_build_object('screen',screen_text,'requestId',new.request_id::text,'jobId',new.id::text))
    on conflict(event_key) do nothing returning id into n_id;
    if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
    if tg_op='UPDATE' and new.status='completed' then
      insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
      values(new.customer_id,'review_reminder',new.request_id,'review-reminder:'||new.id::text,
        'Rate your provider','Your job is complete. Share a quick review of your experience.',
        jsonb_build_object('screen','/(customer)/requests','requestId',new.request_id::text,'jobId',new.id::text))
      on conflict(event_key) do nothing returning id into n_id;
      if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
    end if;
  exception when others then
    raise warning 'Job notification enqueue failed for job %: %',new.id,sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.notify_job_change() from public,anon,authenticated;

-- Include editable business fields and provider identity in admin search results.
create or replace function public.admin_list_providers(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'business_name',p.business_name,'owner_name',p.owner_name,'bio',p.bio,'phone',p.phone,'whatsapp_number',p.whatsapp_number,
    'verification_status',p.verification_status,'phone_verified',p.phone_verified,'rating_average',p.rating_average,'total_reviews',p.total_reviews,
    'total_jobs',p.total_jobs,'completed_jobs',p.completed_jobs,'response_rate',p.response_rate,'is_available',p.is_available,
    'profile',jsonb_build_object('full_name',pr.full_name,'email',u.email,'phone',pr.phone,'is_active',pr.is_active),
    'recent_jobs',(select coalesce(jsonb_agg(jsonb_build_object('job_id',j.id,'status',j.status,'created_at',j.created_at,'category',sc.name,'area_name',sr.area_name) order by j.created_at desc),'[]'::jsonb)
      from public.jobs j join public.service_requests sr on sr.id=j.request_id join public.service_categories sc on sc.id=sr.category_id where j.provider_id=p.id)
  ) order by p.updated_at desc)
  from public.providers p join public.profiles pr on pr.id=p.id left join auth.users u on u.id=p.id
  where p_search is null or concat_ws(' ',p.business_name,p.owner_name,p.bio,pr.full_name,u.email,p.phone,p.whatsapp_number) ilike '%'||p_search||'%'),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_providers(text) from public,anon;
grant execute on function public.admin_list_providers(text) to authenticated;

-- Job conversation storage is participant-only. Inserting a message creates a
-- private in-app notice and a push outbox item for the other participant.
create table if not exists public.service_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists service_messages_job_created_idx on public.service_messages(job_id,created_at);
alter table public.service_messages enable row level security;
revoke all on public.service_messages from public,anon,authenticated;
grant select,insert on public.service_messages to authenticated;
drop policy if exists "Job participants can view messages" on public.service_messages;
create policy "Job participants can view messages" on public.service_messages for select to authenticated
  using (exists(select 1 from public.jobs j where j.id=job_id and auth.uid() in (j.customer_id,j.provider_id)));
drop policy if exists "Participants can send job messages" on public.service_messages;
create policy "Participants can send job messages" on public.service_messages for insert to authenticated
  with check (sender_id=auth.uid() and exists(select 1 from public.jobs j where j.id=job_id and auth.uid() in (j.customer_id,j.provider_id)));

create or replace function public.notify_new_service_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; request_uuid uuid; n_id uuid; target_screen text;
begin
  select case when j.customer_id=new.sender_id then j.provider_id else j.customer_id end,j.request_id
    into recipient,request_uuid from public.jobs j where j.id=new.job_id;
  if recipient is null then return new; end if;
  select case when p.role='provider' then '/(provider)/jobs' else '/(customer)/requests' end into target_screen
    from public.profiles p where p.id=recipient;
  insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
  values(recipient,'new_message',request_uuid,'new-message:'||new.id::text,'New message','You received a message about your service job.',
    jsonb_build_object('screen',target_screen,'requestId',request_uuid::text,'jobId',new.job_id::text))
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end;
$$;
revoke all on function public.notify_new_service_message() from public,anon,authenticated;
drop trigger if exists service_messages_notify on public.service_messages;
create trigger service_messages_notify after insert on public.service_messages for each row execute function public.notify_new_service_message();

-- Service-role-only event hook for scheduled subscription/listing expiry and
-- job reminder workers. It persists history and queues push delivery atomically.
create or replace function public.enqueue_platform_notification(
  p_recipient_id uuid,p_event_type text,p_event_key text,p_title text,p_body text,p_data jsonb default '{}'::jsonb,p_request_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare notice_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_event_type not in ('job_reminder','subscription_expiry','featured_listing_expiry') then
    raise exception 'Unsupported scheduled notification event' using errcode='22023';
  end if;
  if p_event_key is null or p_title is null or p_body is null then raise exception 'Notification key, title and body are required' using errcode='22023'; end if;
  insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
  values(p_recipient_id,p_event_type,p_request_id,p_event_key,p_title,p_body,coalesce(p_data,'{}'::jsonb))
  on conflict(event_key) do update set event_key=excluded.event_key returning id into notice_id;
  insert into public.notification_outbox(notification_id) values(notice_id) on conflict do nothing;
  return notice_id;
end;
$$;
revoke all on function public.enqueue_platform_notification(uuid,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_platform_notification(uuid,text,text,text,text,jsonb,uuid) to service_role;

-- The app tracks no payments, so the admin dashboard reports activity for
-- today's Nairobi calendar date and explicitly marks revenue unavailable.
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
    'revenue_available',false,'revenue_kes',null
  );
end;
$$;
revoke all on function public.admin_dashboard_today() from public,anon;
grant execute on function public.admin_dashboard_today() to authenticated;

create or replace function public.admin_edit_provider(
  p_provider_id uuid,p_business_name text,p_owner_name text,p_bio text,p_phone text,p_whatsapp text
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare old_phone text;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if nullif(btrim(p_business_name),'') is null or nullif(btrim(p_owner_name),'') is null or nullif(btrim(p_phone),'') is null then
    raise exception 'Business name, owner and phone are required' using errcode='22023';
  end if;
  select phone into old_phone from public.providers where id=p_provider_id for update;
  if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
  update public.providers set business_name=btrim(p_business_name),owner_name=btrim(p_owner_name),bio=nullif(btrim(p_bio),''),
    phone=btrim(p_phone),whatsapp_number=nullif(btrim(p_whatsapp),''),
    phone_verified=case when old_phone is distinct from btrim(p_phone) then false else phone_verified end,
    verification_status=case when old_phone is distinct from btrim(p_phone) then 'pending' else verification_status end,updated_at=now()
  where id=p_provider_id;
  update public.profiles set full_name=btrim(p_owner_name),phone=btrim(p_phone),updated_at=now() where id=p_provider_id;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'provider_profile_edited','provider',p_provider_id,'Provider business information edited',
    jsonb_build_object('phone_changed',old_phone is distinct from btrim(p_phone)));
  return true;
end;
$$;
revoke all on function public.admin_edit_provider(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.admin_edit_provider(uuid,text,text,text,text,text) to authenticated;
