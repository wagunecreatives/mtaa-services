-- Lightweight provider verification: collect a reachable phone and profile,
-- then require an admin to confirm the phone and approve the application.
alter table public.provider_applications
  add column if not exists phone_verified boolean not null default false;

alter table public.providers
  add column if not exists owner_name text,
  add column if not exists business_logo_url text,
  add column if not exists working_hours jsonb,
  add column if not exists phone_verified boolean not null default false;

alter table public.request_matches
  add column if not exists distance_km numeric,
  add column if not exists match_score numeric;

create index if not exists idx_request_matches_request_distance
  on public.request_matches (request_id, distance_km);

-- Replace the broken Phase 18 application list: the deployed application table
-- uses verification_status and service_category_id.
create or replace function public.admin_list_provider_applications(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(
      to_jsonb(a) || jsonb_build_object(
        'applicant', jsonb_build_object('full_name', p.full_name, 'email', u.email, 'phone', p.phone),
        'services', (
          select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('service_name', c.name)), '[]'::jsonb)
          from public.provider_application_services s
          left join public.service_categories c on c.id=s.service_category_id
          where s.application_id=a.id
        ),
        'areas', (
          select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
          from public.provider_application_areas s where s.application_id=a.id
        )
      ) order by a.created_at desc
    )
    from public.provider_applications a
    left join public.profiles p on p.id=a.user_id
    left join auth.users u on u.id=p.id
    where p_status is null or a.verification_status=p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_providers(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'business_name',p.business_name,'verification_status',p.verification_status,
      'phone_verified',p.phone_verified,'rating_average',p.rating_average,'total_reviews',p.total_reviews,
      'total_jobs',p.total_jobs,'completed_jobs',p.completed_jobs,'response_rate',p.response_rate,
      'is_available',p.is_available,'profile',jsonb_build_object(
        'full_name',pr.full_name,'email',u.email,'phone',pr.phone,'is_active',pr.is_active),
      'recent_jobs',(select coalesce(jsonb_agg(jsonb_build_object(
        'job_id',j.id,'status',j.status,'created_at',j.created_at,'category',sc.name,'area_name',sr.area_name
      ) order by j.created_at desc),'[]'::jsonb)
        from public.jobs j join public.service_requests sr on sr.id=j.request_id
        join public.service_categories sc on sc.id=sr.category_id where j.provider_id=p.id)
    ) order by p.updated_at desc)
    from public.providers p
    join public.profiles pr on pr.id=p.id
    left join auth.users u on u.id=pr.id
    where p_search is null or concat_ws(' ',p.business_name,pr.full_name,u.email,pr.phone) ilike '%'||p_search||'%'
  ),'[]'::jsonb);
end;
$$;

-- Drop the obsolete three-argument routine so clients cannot accidentally call
-- the old implementation that assumes nonexistent columns.
drop function if exists public.admin_review_provider_application(uuid, text, text);
create function public.admin_review_provider_application(
  p_application_id uuid,
  p_decision text,
  p_notes text,
  p_phone_verified boolean default false
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.provider_applications%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;
  if nullif(btrim(p_notes), '') is null then
    raise exception 'Review notes are required' using errcode='22023';
  end if;

  select * into a from public.provider_applications where id=p_application_id for update;
  if not found then raise exception 'Provider application not found' using errcode='P0002'; end if;
  if a.verification_status not in ('pending','under_review') then
    raise exception 'Application has already been decided' using errcode='22023';
  end if;
  if p_decision='approved' and not coalesce(p_phone_verified, false) then
    raise exception 'Confirm the applicant phone before approval' using errcode='22023';
  end if;

  if p_decision='approved' then
    insert into public.providers (
      id, business_name, bio, phone, whatsapp_number, profile_image_url,
      owner_name, business_logo_url, working_hours, phone_verified,
      verification_status, is_available, is_online, updated_at
    ) values (
      a.user_id, a.business_name, a.business_description, a.phone, a.whatsapp,
      a.profile_photo_url, a.owner_name, a.business_logo_url, a.working_hours,
      true, 'verified', coalesce(a.is_available, true), false, now()
    )
    on conflict (id) do update set
      business_name=excluded.business_name, bio=excluded.bio, phone=excluded.phone,
      whatsapp_number=excluded.whatsapp_number, profile_image_url=excluded.profile_image_url,
      owner_name=excluded.owner_name, business_logo_url=excluded.business_logo_url,
      working_hours=excluded.working_hours, phone_verified=true,
      verification_status='verified', is_available=excluded.is_available, updated_at=now();

    update public.profiles set role='provider', account_type='provider', updated_at=now()
    where id=a.user_id;

    insert into public.provider_services(provider_id, category_id, is_active)
    select a.user_id, s.service_category_id, true
    from public.provider_application_services s
    join public.service_categories c on c.id=s.service_category_id and c.is_active
    where s.application_id=a.id
      and not exists (
        select 1 from public.provider_services ps
        where ps.provider_id=a.user_id and ps.category_id=s.service_category_id
      );

    insert into public.service_areas(provider_id, county, area_name, radius_km, is_primary)
    select a.user_id, a.service_county, s.area_name, 10,
      row_number() over (order by s.area_name)=1
    from public.provider_application_areas s
    where s.application_id=a.id
      and not exists (
        select 1 from public.service_areas existing
        where existing.provider_id=a.user_id
          and lower(existing.area_name)=lower(s.area_name)
          and lower(coalesce(existing.county,''))=lower(coalesce(a.service_county,''))
      );
  end if;

  update public.provider_applications
  set verification_status=case when p_decision='approved' then 'approved' else 'rejected' end,
      rejection_reason=case when p_decision='rejected' then btrim(p_notes) else null end,
      phone_verified=coalesce(p_phone_verified, false), reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
  where id=a.id;

  insert into public.admin_actions(admin_id, action, target_type, target_id, description, metadata)
  values (auth.uid(), 'provider_application_'||p_decision, 'provider_application', a.id,
    btrim(p_notes), jsonb_build_object('user_id',a.user_id,'phone_verified',coalesce(p_phone_verified,false)));
  return true;
end;
$$;
revoke all on function public.admin_review_provider_application(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_review_provider_application(uuid,text,text,boolean) to authenticated;

-- A provider can only reach Verified after an administrator confirms the phone.
drop function if exists public.admin_set_provider_status(uuid, text, text);
create function public.admin_set_provider_status(
  p_provider_id uuid,
  p_status text,
  p_reason text,
  p_phone_verified boolean default null
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_phone_verified boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_status not in ('pending','verified','rejected','suspended') then
    raise exception 'Unknown provider status' using errcode='22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  select phone_verified into existing_phone_verified
  from public.providers where id=p_provider_id for update;
  if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
  if p_status='verified' and not coalesce(p_phone_verified, existing_phone_verified, false) then
    raise exception 'Confirm the provider phone before verification' using errcode='22023';
  end if;

  update public.providers
  set verification_status=p_status,
      phone_verified=coalesce(p_phone_verified, phone_verified),
      verification_notes=btrim(p_reason), updated_at=now()
  where id=p_provider_id;
  insert into public.admin_actions(admin_id, action, target_type, target_id, description, metadata)
  values (auth.uid(), 'provider_status_changed', 'provider', p_provider_id, btrim(p_reason),
    jsonb_build_object('verification_status',p_status,'phone_verified',coalesce(p_phone_verified,existing_phone_verified,false)));
  return true;
end;
$$;
revoke all on function public.admin_set_provider_status(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_set_provider_status(uuid,text,text,boolean) to authenticated;

-- Rank only eligible, active, phone-confirmed providers and notify the top five.
create or replace function public.match_service_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.service_requests%rowtype;
  v_existing integer;
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  if v_request.customer_id<>auth.uid() and not coalesce(public.is_admin(),false) then
    raise exception 'Not authorized to match this request' using errcode='42501';
  end if;
  if v_request.status not in ('open','matching') then
    raise exception 'Request is not eligible for matching' using errcode='22023';
  end if;

  select count(*)::integer into v_existing from public.request_matches where request_id=p_request_id;
  if v_existing>0 then return v_existing; end if;

  with eligible as (
    select p.id as provider_id,
      min(case when v_request.latitude is not null and v_request.longitude is not null
                    and sa.latitude is not null and sa.longitude is not null then
        6371 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(v_request.latitude-sa.latitude)/2),2)
          + cos(radians(sa.latitude))*cos(radians(v_request.latitude))
          * power(sin(radians(v_request.longitude-sa.longitude)/2),2)
        ))) end)::numeric as distance_km,
      p.is_online, p.is_available, p.rating_average, p.response_rate, p.completed_jobs
    from public.providers p
    join public.profiles prof on prof.id=p.id
    join public.provider_services ps on ps.provider_id=p.id and ps.category_id=v_request.category_id and ps.is_active=true
    join public.service_areas sa on sa.provider_id=p.id
    where p.verification_status='verified' and p.phone_verified=true and p.is_available=true
      and prof.is_active=true and prof.role='provider'
      and (
        (nullif(btrim(v_request.area_name),'') is not null and lower(btrim(sa.area_name))=lower(btrim(v_request.area_name)))
        or (v_request.latitude is not null and v_request.longitude is not null
          and sa.latitude is not null and sa.longitude is not null
          and 6371*2*asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude-sa.latitude)/2),2)
            + cos(radians(sa.latitude))*cos(radians(v_request.latitude))
            * power(sin(radians(v_request.longitude-sa.longitude)/2),2)
          ))) <= sa.radius_km)
      )
      and (nullif(btrim(v_request.county),'') is null or nullif(btrim(sa.county),'') is null
        or lower(btrim(sa.county))=lower(btrim(v_request.county)))
    group by p.id,p.is_online,p.is_available,p.rating_average,p.response_rate,p.completed_jobs
  ), scored as (
    select provider_id, distance_km,
      (least(greatest(coalesce(rating_average,0),0),5)*6
       + least(greatest(coalesce(response_rate,0),0),100)*0.15
       + least(greatest(coalesce(completed_jobs,0),0),100)*0.1
       + case when is_online and v_request.urgency='now' then 30
              when is_online and v_request.urgency='today' then 20
              when is_online then 8 else 0 end
       + case when distance_km is null then 15 else greatest(0,20-distance_km*4) end
      )::numeric as score
    from eligible
  ), ranked as (
    select provider_id,distance_km,score,
      row_number() over (order by score desc,distance_km asc nulls last,provider_id) as match_rank
    from scored
  ), inserted as (
    insert into public.request_matches(request_id,provider_id,status,match_rank,distance_km,match_score)
    select p_request_id,provider_id,'pending',match_rank,distance_km,score
    from ranked where match_rank<=5
    on conflict (request_id,provider_id) do nothing
    returning 1
  ) select count(*)::integer into v_inserted from inserted;

  if v_inserted>0 then
    update public.service_requests set status='matching',updated_at=now()
    where id=p_request_id and status='open';
  end if;
  return v_inserted;
end;
$$;
revoke all on function public.match_service_request(uuid) from public, anon;
grant execute on function public.match_service_request(uuid) to authenticated;

create or replace function public.admin_list_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',sr.id,'customer_id',sr.customer_id,'category_id',sr.category_id,'title',sr.title,
      'description',sr.description,'urgency',sr.urgency,'status',sr.status,'area_name',sr.area_name,
      'county',sr.county,'created_at',sr.created_at,'category',sc.name,
      'customer',jsonb_build_object('id',p.id,'full_name',p.full_name),
      'match_count',(select count(*) from public.request_matches m where m.request_id=sr.id),
      'response_count',(select count(*) from public.provider_responses r where r.request_id=sr.id),
      'matches',(select coalesce(jsonb_agg(jsonb_build_object(
        'provider_id',m.provider_id,'business_name',prv.business_name,'match_status',m.status,
        'response_status',resp.status,'match_rank',m.match_rank,'distance_km',m.distance_km,
        'rating_average',prv.rating_average,'is_available',prv.is_available,
        'verification_status',prv.verification_status
      ) order by m.match_rank nulls last),'[]'::jsonb)
        from public.request_matches m
        left join public.providers prv on prv.id=m.provider_id
        left join public.provider_responses resp on resp.match_id=m.id
        where m.request_id=sr.id)
    ) order by sr.created_at desc)
    from public.service_requests sr
    join public.service_categories sc on sc.id=sr.category_id
    left join public.profiles p on p.id=sr.customer_id
    where p_status is null or sr.status=p_status
  ),'[]'::jsonb);
end;
$$;

drop function if exists public.get_customer_request_details(uuid);
create function public.get_customer_request_details(p_request_id uuid)
returns table(response_id uuid,provider_id uuid,business_name text,provider_name text,rating_average numeric,total_reviews integer,
  message text,quoted_price numeric,estimated_arrival_minutes integer,response_status text,job_id uuid,job_status text,
  agreed_price numeric,started_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,provider_contact text,
  distance_km numeric,provider_available boolean,verification_status text,phone_verified boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.service_requests sr where sr.id=p_request_id and sr.customer_id=auth.uid()) then
    raise exception 'Request not found or not owned by this customer' using errcode='42501';
  end if;
  return query
  select pr.id,p.id,p.business_name,profile.full_name,p.rating_average::numeric,p.total_reviews::integer,
    pr.message,pr.quoted_price,pr.estimated_arrival_minutes,pr.status,j.id,j.status,j.agreed_price,
    j.started_at,j.completed_at,j.cancelled_at,
    case when j.id is not null and j.provider_id=p.id and j.status<>'cancelled' then coalesce(p.whatsapp_number,p.phone) else null end,
    rm.distance_km,p.is_available,p.verification_status,p.phone_verified
  from public.provider_responses pr
  join public.providers p on p.id=pr.provider_id
  left join public.profiles profile on profile.id=p.id
  left join public.request_matches rm on rm.id=pr.match_id
  left join public.jobs j on j.response_id=pr.id and j.request_id=p_request_id
  where pr.request_id=p_request_id and pr.status in ('pending','accepted','rejected')
  order by (j.id is not null) desc,pr.created_at desc;
end;
$$;
revoke all on function public.get_customer_request_details(uuid) from public,anon;
grant execute on function public.get_customer_request_details(uuid) to authenticated;

drop function if exists public.get_provider_leads();
create function public.get_provider_leads()
returns table(request_id uuid,category_name text,area_name text,county text,urgency text,title text,description text,
  match_status text,match_rank integer,created_at timestamptz,response_status text,response_id uuid,
  preferred_time text,budget_min numeric,budget_max numeric,distance_km numeric,provider_rating numeric,
  provider_available boolean,verification_status text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active=true) then
    raise exception 'Active provider required' using errcode='42501';
  end if;
  return query
  select sr.id,sc.name,sr.area_name,sr.county,sr.urgency,sr.title,sr.description,rm.status,rm.match_rank,
    sr.created_at,pr.status,pr.id,sr.preferred_time::text,sr.budget_min::numeric,sr.budget_max::numeric,
    rm.distance_km,p.rating_average,p.is_available,p.verification_status
  from public.request_matches rm
  join public.service_requests sr on sr.id=rm.request_id
  join public.service_categories sc on sc.id=sr.category_id
  join public.providers p on p.id=rm.provider_id
  left join public.provider_responses pr on pr.request_id=sr.id and pr.provider_id=auth.uid()
  where rm.provider_id=auth.uid() and p.verification_status='verified' and p.phone_verified=true
    and p.is_available=true and rm.status in ('pending','notified','viewed','responded')
    and sr.status in ('open','matching','responses_received')
  order by rm.match_rank nulls last,sr.created_at desc;
end;
$$;
revoke all on function public.get_provider_leads() from public, anon;
grant execute on function public.get_provider_leads() to authenticated;

create or replace function public.respond_to_service_request(
  p_request_id uuid,p_message text,p_quoted_price numeric default null,p_estimated_arrival_minutes integer default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_match public.request_matches%rowtype;
  v_request public.service_requests%rowtype;
  v_response_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active=true)
    or not exists(select 1 from public.providers p where p.id=auth.uid() and p.verification_status='verified'
      and p.phone_verified=true and p.is_available=true) then
    raise exception 'An active phone-verified provider is required' using errcode='42501';
  end if;
  if nullif(btrim(p_message),'') is null or length(p_message)>2000 then
    raise exception 'A response message of up to 2000 characters is required' using errcode='22023';
  end if;
  if p_quoted_price is not null and p_quoted_price<0 then raise exception 'Quoted price cannot be negative' using errcode='22023'; end if;
  if p_estimated_arrival_minutes is not null and p_estimated_arrival_minutes<0 then raise exception 'Arrival estimate cannot be negative' using errcode='22023'; end if;

  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found or v_request.status not in ('open','matching','responses_received') then
    raise exception 'Request is not accepting responses' using errcode='22023';
  end if;
  select * into v_match from public.request_matches where request_id=p_request_id and provider_id=auth.uid() for update;
  if not found or v_match.status not in ('pending','notified','viewed') then
    raise exception 'No active match exists for this provider and request' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.provider_services ps join public.service_areas sa on sa.provider_id=ps.provider_id
    where ps.provider_id=auth.uid() and ps.category_id=v_request.category_id and ps.is_active=true
      and ((nullif(btrim(v_request.area_name),'') is not null and lower(btrim(sa.area_name))=lower(btrim(v_request.area_name)))
        or (v_request.latitude is not null and v_request.longitude is not null and sa.latitude is not null and sa.longitude is not null
          and 6371*2*asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude-sa.latitude)/2),2)
            + cos(radians(sa.latitude))*cos(radians(v_request.latitude))*power(sin(radians(v_request.longitude-sa.longitude)/2),2)
          )))<=sa.radius_km))
      and (nullif(btrim(v_request.county),'') is null or nullif(btrim(sa.county),'') is null
        or lower(btrim(sa.county))=lower(btrim(v_request.county)))
  ) then raise exception 'Provider service or area eligibility has changed' using errcode='42501'; end if;

  insert into public.provider_responses(request_id,provider_id,match_id,message,quoted_price,estimated_arrival_minutes,status)
  values(p_request_id,auth.uid(),v_match.id,btrim(p_message),p_quoted_price,p_estimated_arrival_minutes,'pending')
  returning id into v_response_id;
  update public.request_matches set status='responded',updated_at=now() where id=v_match.id;
  update public.service_requests set status='responses_received',updated_at=now()
  where id=p_request_id and status in ('open','matching');
  return v_response_id;
end;
$$;
revoke all on function public.respond_to_service_request(uuid,text,numeric,integer) from public,anon;
grant execute on function public.respond_to_service_request(uuid,text,numeric,integer) to authenticated;

create or replace function public.select_provider_response(p_response_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_response public.provider_responses%rowtype;
  v_request public.service_requests%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_response from public.provider_responses where id=p_response_id;
  if not found then raise exception 'Provider response not found' using errcode='P0002'; end if;
  select * into v_request from public.service_requests where id=v_response.request_id for update;
  if not found or v_request.customer_id<>auth.uid() then
    raise exception 'Not authorized to select this response' using errcode='42501';
  end if;
  if v_request.status not in ('open','matching','responses_received') then
    raise exception 'Request is no longer accepting provider selection' using errcode='22023';
  end if;
  if v_response.status<>'pending' then raise exception 'This provider response is no longer available' using errcode='22023'; end if;
  if not exists(select 1 from public.request_matches rm where rm.id=v_response.match_id and rm.request_id=v_response.request_id
    and rm.provider_id=v_response.provider_id and rm.status='responded') then
    raise exception 'Response is not backed by an active provider match' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.profiles pr join public.providers p on p.id=pr.id
    join public.provider_services ps on ps.provider_id=p.id and ps.category_id=v_request.category_id and ps.is_active=true
    join public.service_areas sa on sa.provider_id=p.id
    where pr.id=v_response.provider_id and pr.role='provider' and pr.is_active=true
      and p.verification_status='verified' and p.phone_verified=true and p.is_available=true
      and ((nullif(btrim(v_request.area_name),'') is not null and lower(btrim(sa.area_name))=lower(btrim(v_request.area_name)))
        or (v_request.latitude is not null and v_request.longitude is not null and sa.latitude is not null and sa.longitude is not null
          and 6371*2*asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude-sa.latitude)/2),2)
            + cos(radians(sa.latitude))*cos(radians(v_request.latitude))*power(sin(radians(v_request.longitude-sa.longitude)/2),2)
          )))<=sa.radius_km))
      and (nullif(btrim(v_request.county),'') is null or nullif(btrim(sa.county),'') is null
        or lower(btrim(sa.county))=lower(btrim(v_request.county)))
  ) then raise exception 'Provider no longer meets this request eligibility' using errcode='42501'; end if;

  insert into public.jobs(request_id,customer_id,provider_id,response_id,status,agreed_price,created_at,updated_at)
  values(v_request.id,v_request.customer_id,v_response.provider_id,v_response.id,'assigned',v_response.quoted_price,now(),now())
  returning id into v_job_id;
  update public.provider_responses set status='accepted',updated_at=now() where id=v_response.id;
  update public.provider_responses set status='rejected',updated_at=now()
    where request_id=v_request.id and id<>v_response.id and status='pending';
  update public.request_matches set status='cancelled',updated_at=now()
    where request_id=v_request.id and provider_id<>v_response.provider_id and status in ('pending','notified','viewed','responded');
  update public.service_requests set status='provider_selected',updated_at=now() where id=v_request.id;
  return v_job_id;
exception when unique_violation then
  raise exception 'A provider has already been selected for this request' using errcode='23505';
end;
$$;
revoke all on function public.select_provider_response(uuid) from public,anon;
grant execute on function public.select_provider_response(uuid) to authenticated;
