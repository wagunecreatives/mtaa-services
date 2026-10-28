create or replace function public.provider_is_email_verified_active(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.providers provider on provider.id = profile.id
    join auth.users account on account.id = profile.id
    where profile.id = p_provider_id
      and profile.role = 'provider'
      and profile.account_type = 'provider'
      and profile.is_active
      and profile.onboarding_completed
      and account.email_confirmed_at is not null
      and provider.verification_status = 'verified'
  );
$$;
revoke all on function public.provider_is_email_verified_active(uuid) from public, anon, authenticated;

create or replace function public.submit_provider_application(
  p_business_name text,
  p_owner_name text,
  p_business_description text,
  p_phone text,
  p_whatsapp text,
  p_profile_photo_url text,
  p_business_logo_url text,
  p_service_category_ids uuid[],
  p_areas text[],
  p_county text,
  p_working_hours jsonb,
  p_is_available boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  v_application_id uuid;
  provider_status text;
  existing_phone text;
  existing_phone_verified boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from auth.users
    where id = current_user_id and email_confirmed_at is not null
  ) then
    raise exception 'Confirm your email before setting up provider services' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id
      and role = 'provider'
      and account_type = 'provider'
      and is_active
  ) then
    raise exception 'An active provider account is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_phone), '') is null
     or nullif(btrim(p_business_name), '') is null
     or nullif(btrim(p_owner_name), '') is null
     or coalesce(cardinality(p_service_category_ids), 0) = 0
     or not exists (
       select 1 from unnest(coalesce(p_areas, array[]::text[])) requested(area_name)
       where nullif(btrim(requested.area_name), '') is not null
     ) then
    raise exception 'Phone, business details, at least one service, and at least one area are required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_service_category_ids) requested(id)
    left join public.service_categories category
      on category.id = requested.id and category.is_active
    where category.id is null
  ) then
    raise exception 'One or more selected service categories are unavailable' using errcode = '22023';
  end if;

  select verification_status, phone, phone_verified
  into provider_status, existing_phone, existing_phone_verified
  from public.providers
  where id = current_user_id
  for update;
  existing_phone_verified :=
    coalesce(existing_phone_verified, false)
    and existing_phone is not distinct from btrim(p_phone);

  select id into v_application_id
  from public.provider_applications
  where user_id = current_user_id
  order by created_at desc
  limit 1
  for update;

  if v_application_id is null then
    insert into public.provider_applications (
      user_id, business_name, owner_name, business_description, phone, whatsapp,
      profile_photo_url, business_logo_url, service_county, working_hours,
      is_available, verification_status, phone_verified, reviewed_by, reviewed_at,
      rejection_reason, updated_at
    ) values (
      current_user_id, btrim(p_business_name), btrim(p_owner_name),
      nullif(btrim(p_business_description), ''), btrim(p_phone),
      nullif(btrim(p_whatsapp), ''), p_profile_photo_url, p_business_logo_url,
      nullif(btrim(p_county), ''), coalesce(p_working_hours, '{}'::jsonb),
      coalesce(p_is_available, true), 'approved', existing_phone_verified, null, null, null, now()
    ) returning id into v_application_id;
  else
    update public.provider_applications
    set business_name = btrim(p_business_name),
        owner_name = btrim(p_owner_name),
        business_description = nullif(btrim(p_business_description), ''),
        phone = btrim(p_phone),
        whatsapp = nullif(btrim(p_whatsapp), ''),
        profile_photo_url = p_profile_photo_url,
        business_logo_url = p_business_logo_url,
        service_county = nullif(btrim(p_county), ''),
        working_hours = coalesce(p_working_hours, '{}'::jsonb),
        is_available = coalesce(p_is_available, true),
        verification_status = 'approved',
        phone_verified = existing_phone_verified,
        reviewed_by = null,
        reviewed_at = null,
        rejection_reason = null,
        updated_at = now()
    where id = v_application_id;
    delete from public.provider_application_services
    where provider_application_services.application_id = v_application_id;
    delete from public.provider_application_areas
    where provider_application_areas.application_id = v_application_id;
  end if;

  insert into public.providers (
    id, business_name, bio, phone, whatsapp_number, profile_image_url,
    owner_name, business_logo_url, working_hours, phone_verified,
    verification_status, is_available, is_online, updated_at
  ) values (
    current_user_id, btrim(p_business_name),
    nullif(btrim(p_business_description), ''), btrim(p_phone),
    nullif(btrim(p_whatsapp), ''), p_profile_photo_url,
    btrim(p_owner_name), p_business_logo_url,
    coalesce(p_working_hours, '{}'::jsonb), existing_phone_verified,
    case when provider_status in ('suspended', 'rejected') then provider_status else 'verified' end,
    coalesce(p_is_available, true), false, now()
  )
  on conflict (id) do update set
    business_name = excluded.business_name,
    bio = excluded.bio,
    phone = excluded.phone,
    whatsapp_number = excluded.whatsapp_number,
    profile_image_url = excluded.profile_image_url,
    owner_name = excluded.owner_name,
    business_logo_url = excluded.business_logo_url,
    working_hours = excluded.working_hours,
    phone_verified = providers.phone_verified
      and (providers.phone is not distinct from excluded.phone),
    verification_status = case
      when providers.verification_status in ('suspended', 'rejected') then providers.verification_status
      else 'verified'
    end,
    is_available = excluded.is_available,
    updated_at = now();

  update public.profiles as profile
  set role = 'provider',
      account_type = 'provider',
      phone = btrim(p_phone),
      phone_verified = profile.phone_verified
        and (profile.phone is not distinct from btrim(p_phone)),
      phone_verification_required = false,
      onboarding_completed = true,
      updated_at = now()
  where id = current_user_id;

  insert into public.provider_application_services (application_id, service_category_id)
  select v_application_id, requested.id
  from (select distinct unnest(p_service_category_ids) id) requested;

  insert into public.provider_services (provider_id, category_id, is_active)
  select current_user_id, requested.id, true
  from (select distinct unnest(p_service_category_ids) id) requested
  where not exists (
    select 1 from public.provider_services existing
    where existing.provider_id = current_user_id
      and existing.category_id = requested.id
  );

  insert into public.provider_application_areas (application_id, area_name)
  select v_application_id, btrim(requested.area_name)
  from (select distinct unnest(p_areas) area_name) requested
  where nullif(btrim(requested.area_name), '') is not null;

  insert into public.service_areas (provider_id, county, area_name, radius_km, is_primary)
  select current_user_id, nullif(btrim(p_county), ''), btrim(requested.area_name), 10,
         row_number() over (order by requested.area_name) = 1
  from (select distinct unnest(p_areas) area_name) requested
  where nullif(btrim(requested.area_name), '') is not null
    and not exists (
      select 1 from public.service_areas existing
      where existing.provider_id = current_user_id
        and lower(existing.area_name) = lower(btrim(requested.area_name))
        and lower(coalesce(existing.county, '')) = lower(coalesce(nullif(btrim(p_county), ''), ''))
    );

  return v_application_id;
end;
$$;
revoke all on function public.submit_provider_application(text, text, text, text, text, text, text, uuid[], text[], text, jsonb, boolean) from public, anon;
grant execute on function public.submit_provider_application(text, text, text, text, text, text, text, uuid[], text[], text, jsonb, boolean) to authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
  v_existing integer;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into v_request
  from public.service_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_request.customer_id <> auth.uid()
     and not coalesce(public.is_admin(), false) then
    raise exception 'Not authorized to match this request' using errcode = '42501';
  end if;
  if v_request.status not in ('open', 'matching') then
    raise exception 'Request is not eligible for matching' using errcode = '22023';
  end if;

  select count(*)::integer into v_existing
  from public.request_matches
  where request_id = p_request_id;
  if v_existing > 0 then
    return v_existing;
  end if;

  with eligible as (
    select
      provider.id as provider_id,
      min(case
        when v_request.latitude is not null and v_request.longitude is not null
             and area.latitude is not null and area.longitude is not null then
          6371 * 2 * asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude - area.latitude) / 2), 2)
            + cos(radians(area.latitude)) * cos(radians(v_request.latitude))
            * power(sin(radians(v_request.longitude - area.longitude) / 2), 2)
          )))
      end)::numeric as distance_km,
      provider.is_online, provider.is_available, provider.rating_average,
      provider.response_rate, provider.completed_jobs
    from public.providers provider
    join public.provider_services service
      on service.provider_id = provider.id
     and service.category_id = v_request.category_id
     and service.is_active
    join public.service_areas area on area.provider_id = provider.id
    where public.provider_is_email_verified_active(provider.id)
      and provider.is_available
      and (
        (nullif(btrim(v_request.area_name), '') is not null
          and lower(btrim(area.area_name)) = lower(btrim(v_request.area_name)))
        or (
          v_request.latitude is not null and v_request.longitude is not null
          and area.latitude is not null and area.longitude is not null
          and 6371 * 2 * asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude - area.latitude) / 2), 2)
            + cos(radians(area.latitude)) * cos(radians(v_request.latitude))
            * power(sin(radians(v_request.longitude - area.longitude) / 2), 2)
          ))) <= area.radius_km
        )
      )
      and (
        nullif(btrim(v_request.county), '') is null
        or nullif(btrim(area.county), '') is null
        or lower(btrim(area.county)) = lower(btrim(v_request.county))
      )
    group by provider.id, provider.is_online, provider.is_available,
      provider.rating_average, provider.response_rate, provider.completed_jobs
  ), scored as (
    select provider_id, distance_km,
      (
        least(greatest(coalesce(rating_average, 0), 0), 5) * 6
        + least(greatest(coalesce(response_rate, 0), 0), 100) * 0.15
        + least(greatest(coalesce(completed_jobs, 0), 0), 100) * 0.1
        + case
            when is_online and v_request.urgency = 'now' then 30
            when is_online and v_request.urgency = 'today' then 20
            when is_online then 8
            else 0
          end
        + case
            when distance_km is null then 15
            else greatest(0, 20 - distance_km * 4)
          end
      )::numeric as score
    from eligible
  ), ranked as (
    select provider_id, distance_km, score,
      row_number() over (
        order by score desc, distance_km asc nulls last, provider_id
      ) as match_rank
    from scored
  ), inserted as (
    insert into public.request_matches (
      request_id, provider_id, status, match_rank, distance_km, match_score
    )
    select p_request_id, provider_id, 'pending', match_rank, distance_km, score
    from ranked
    where match_rank <= 5
    on conflict (request_id, provider_id) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;

  if v_inserted > 0 then
    update public.service_requests
    set status = 'matching', updated_at = now()
    where id = p_request_id and status = 'open';
  end if;
  return v_inserted;
end;
$$;
revoke all on function public.match_service_request(uuid) from public, anon;
grant execute on function public.match_service_request(uuid) to authenticated;

drop function if exists public.get_provider_leads();
create function public.get_provider_leads()
returns table(
  request_id uuid, category_name text, area_name text, county text, urgency text,
  title text, description text, match_status text, match_rank integer,
  created_at timestamptz, response_status text, response_id uuid,
  preferred_time text, budget_min numeric, budget_max numeric,
  distance_km numeric, provider_rating numeric, provider_available boolean,
  verification_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider with completed onboarding required' using errcode = '42501';
  end if;
  return query
  select sr.id, category.name, sr.area_name, sr.county,
    sr.urgency, sr.title, sr.description, rm.status,
    rm.match_rank, sr.created_at, response.status, response.id,
    sr.preferred_time::text, sr.budget_min::numeric,
    sr.budget_max::numeric, rm.distance_km, provider.rating_average,
    provider.is_available, provider.verification_status
  from public.request_matches rm
  join public.service_requests sr on sr.id = rm.request_id
  join public.service_categories category on category.id = sr.category_id
  join public.providers provider on provider.id = rm.provider_id
  left join public.provider_responses response
    on response.request_id = sr.id and response.provider_id = auth.uid()
  where rm.provider_id = auth.uid()
    and public.provider_is_email_verified_active(provider.id)
    and provider.is_available
    and rm.status in ('pending', 'notified', 'viewed', 'responded')
    and sr.status in ('open', 'matching', 'responses_received')
  order by rm.match_rank nulls last, sr.created_at desc;
end;
$$;
revoke all on function public.get_provider_leads() from public, anon;
grant execute on function public.get_provider_leads() to authenticated;

create or replace function public.respond_to_service_request(
  p_request_id uuid,
  p_message text,
  p_quoted_price numeric default null,
  p_estimated_arrival_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_request public.request_matches%rowtype;
  requested_service public.service_requests%rowtype;
  response_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.provider_is_email_verified_active(auth.uid())
     or not exists (
       select 1 from public.providers
       where id = auth.uid() and is_available
     ) then
    raise exception 'An active, email-verified provider with completed onboarding is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_message), '') is null or length(p_message) > 2000 then
    raise exception 'A response message of up to 2000 characters is required' using errcode = '22023';
  end if;
  if p_quoted_price is not null and p_quoted_price < 0 then
    raise exception 'Quoted price cannot be negative' using errcode = '22023';
  end if;
  if p_estimated_arrival_minutes is not null and p_estimated_arrival_minutes < 0 then
    raise exception 'Arrival estimate cannot be negative' using errcode = '22023';
  end if;

  select * into requested_service
  from public.service_requests
  where id = p_request_id
  for update;
  if not found or requested_service.status not in ('open', 'matching', 'responses_received') then
    raise exception 'Request is not accepting responses' using errcode = '22023';
  end if;
  select * into matched_request
  from public.request_matches
  where request_id = p_request_id and provider_id = auth.uid()
  for update;
  if not found or matched_request.status not in ('pending', 'notified', 'viewed') then
    raise exception 'No active match exists for this provider and request' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.provider_services service
    join public.service_areas area on area.provider_id = service.provider_id
    where service.provider_id = auth.uid()
      and service.category_id = requested_service.category_id
      and service.is_active
      and (
        (nullif(btrim(requested_service.area_name), '') is not null
          and lower(btrim(area.area_name)) = lower(btrim(requested_service.area_name)))
        or (
          requested_service.latitude is not null
          and requested_service.longitude is not null
          and area.latitude is not null
          and area.longitude is not null
          and 6371 * 2 * asin(sqrt(least(1::double precision,
            power(sin(radians(requested_service.latitude - area.latitude) / 2), 2)
            + cos(radians(area.latitude)) * cos(radians(requested_service.latitude))
            * power(sin(radians(requested_service.longitude - area.longitude) / 2), 2)
          ))) <= area.radius_km
        )
      )
      and (
        nullif(btrim(requested_service.county), '') is null
        or nullif(btrim(area.county), '') is null
        or lower(btrim(area.county)) = lower(btrim(requested_service.county))
      )
  ) then
    raise exception 'Provider service or area eligibility has changed' using errcode = '42501';
  end if;

  insert into public.provider_responses (
    request_id, provider_id, match_id, message, quoted_price,
    estimated_arrival_minutes, status
  ) values (
    p_request_id, auth.uid(), matched_request.id, btrim(p_message),
    p_quoted_price, p_estimated_arrival_minutes, 'pending'
  ) returning id into response_id;

  update public.request_matches
  set status = 'responded', updated_at = now()
  where id = matched_request.id;
  update public.service_requests
  set status = 'responses_received', updated_at = now()
  where id = p_request_id and status in ('open', 'matching');
  return response_id;
end;
$$;
revoke all on function public.respond_to_service_request(uuid, text, numeric, integer) from public, anon;
grant execute on function public.respond_to_service_request(uuid, text, numeric, integer) to authenticated;

create or replace function public.select_provider_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_response public.provider_responses%rowtype;
  requested_service public.service_requests%rowtype;
  created_job_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into selected_response
  from public.provider_responses
  where id = p_response_id;
  if not found then
    raise exception 'Provider response not found' using errcode = 'P0002';
  end if;
  select * into requested_service
  from public.service_requests
  where id = selected_response.request_id
  for update;
  if not found or requested_service.customer_id <> auth.uid() then
    raise exception 'Not authorized to select this response' using errcode = '42501';
  end if;
  if requested_service.status not in ('open', 'matching', 'responses_received') then
    raise exception 'Request is no longer accepting provider selection' using errcode = '22023';
  end if;
  if selected_response.status <> 'pending' then
    raise exception 'This provider response is no longer available' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.request_matches rm
    where rm.id = selected_response.match_id
      and rm.request_id = selected_response.request_id
      and rm.provider_id = selected_response.provider_id
      and rm.status = 'responded'
  ) then
    raise exception 'Response is not backed by an active provider match' using errcode = '42501';
  end if;
  if not public.provider_is_email_verified_active(selected_response.provider_id)
     or not exists (
       select 1 from public.providers
       where id = selected_response.provider_id and is_available
     )
     or not exists (
       select 1
       from public.provider_services service
       join public.service_areas area on area.provider_id = service.provider_id
       where service.provider_id = selected_response.provider_id
         and service.category_id = requested_service.category_id
         and service.is_active
         and (
           (nullif(btrim(requested_service.area_name), '') is not null
             and lower(btrim(area.area_name)) = lower(btrim(requested_service.area_name)))
           or (
             requested_service.latitude is not null
             and requested_service.longitude is not null
             and area.latitude is not null
             and area.longitude is not null
             and 6371 * 2 * asin(sqrt(least(1::double precision,
               power(sin(radians(requested_service.latitude - area.latitude) / 2), 2)
               + cos(radians(area.latitude)) * cos(radians(requested_service.latitude))
               * power(sin(radians(requested_service.longitude - area.longitude) / 2), 2)
             ))) <= area.radius_km
           )
         )
         and (
           nullif(btrim(requested_service.county), '') is null
           or nullif(btrim(area.county), '') is null
           or lower(btrim(area.county)) = lower(btrim(requested_service.county))
         )
     ) then
    raise exception 'Provider no longer meets this request eligibility' using errcode = '42501';
  end if;

  insert into public.jobs (
    request_id, customer_id, provider_id, response_id, status, agreed_price,
    created_at, updated_at
  ) values (
    requested_service.id, requested_service.customer_id, selected_response.provider_id,
    selected_response.id, 'assigned', selected_response.quoted_price, now(), now()
  ) returning id into created_job_id;

  update public.provider_responses
  set status = 'accepted', updated_at = now()
  where id = selected_response.id;
  update public.provider_responses
  set status = 'rejected', updated_at = now()
  where request_id = requested_service.id
    and id <> selected_response.id
    and status = 'pending';
  update public.request_matches
  set status = 'cancelled', updated_at = now()
  where request_id = requested_service.id
    and provider_id <> selected_response.provider_id
    and status in ('pending', 'notified', 'viewed', 'responded');
  update public.service_requests
  set status = 'provider_selected', updated_at = now()
  where id = requested_service.id;
  return created_job_id;
exception
  when unique_violation then
    raise exception 'A provider has already been selected for this request' using errcode = '23505';
end;
$$;
revoke all on function public.select_provider_response(uuid) from public, anon;
grant execute on function public.select_provider_response(uuid) to authenticated;

drop function if exists public.get_customer_request_details(uuid);
create function public.get_customer_request_details(p_request_id uuid)
returns table(
  response_id uuid,
  provider_id uuid,
  business_name text,
  provider_name text,
  rating_average numeric,
  total_reviews integer,
  message text,
  quoted_price numeric,
  estimated_arrival_minutes integer,
  response_status text,
  job_id uuid,
  job_status text,
  agreed_price numeric,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  provider_contact text,
  distance_km numeric,
  provider_available boolean,
  verification_status text,
  phone_verified boolean,
  provider_phone text,
  provider_whatsapp text,
  email_verified boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.service_requests request
    where request.id = p_request_id and request.customer_id = auth.uid()
  ) then
    raise exception 'Request not found or not owned by this customer' using errcode = '42501';
  end if;
  return query
  select response.id, provider.id, provider.business_name, profile.full_name,
    provider.rating_average::numeric, provider.total_reviews::integer,
    response.message, response.quoted_price, response.estimated_arrival_minutes,
    response.status, job.id, job.status, job.agreed_price,
    job.started_at, job.completed_at, job.cancelled_at,
    case
      when job.id is not null and job.provider_id = provider.id and job.status <> 'cancelled'
        then coalesce(provider.whatsapp_number, provider.phone)
      else null
    end,
    match.distance_km, provider.is_available, provider.verification_status,
    provider.phone_verified,
    case when response.status in ('pending', 'accepted') then provider.phone else null end,
    case when response.status in ('pending', 'accepted') then provider.whatsapp_number else null end,
    account.email_confirmed_at is not null
  from public.provider_responses response
  join public.providers provider on provider.id = response.provider_id
  join auth.users account on account.id = provider.id
  left join public.profiles profile on profile.id = provider.id
  left join public.request_matches match on match.id = response.match_id
  left join public.jobs job
    on job.response_id = response.id and job.request_id = p_request_id
  where response.request_id = p_request_id
    and response.status in ('pending', 'accepted', 'rejected')
  order by (job.id is not null) desc, response.created_at desc;
end;
$$;
revoke all on function public.get_customer_request_details(uuid) from public, anon;
grant execute on function public.get_customer_request_details(uuid) to authenticated;

create or replace function public.get_active_featured_providers(
  p_category_id uuid default null,
  p_area_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider_id', provider.id,
      'business_name', provider.business_name,
      'bio', provider.bio,
      'profile_image_url', provider.profile_image_url,
      'rating_average', provider.rating_average,
      'total_reviews', provider.total_reviews,
      'category', category.name,
      'category_id', category.id,
      'area_name', listing.area_name,
      'featured_until', listing.ends_at,
      'is_test', listing.is_test,
      'email_verified', account.email_confirmed_at is not null
    ) order by provider.rating_average desc nulls last, listing.created_at desc)
    from public.featured_listings listing
    join public.providers provider on provider.id = listing.provider_id
    join public.profiles profile on profile.id = provider.id
    join auth.users account on account.id = provider.id
    join public.service_categories category on category.id = listing.category_id
    where listing.status = 'active'
      and listing.starts_at <= now()
      and listing.ends_at > now()
      and public.provider_is_email_verified_active(provider.id)
      and (p_category_id is null or listing.category_id = p_category_id)
      and (p_area_name is null or lower(listing.area_name) = lower(btrim(p_area_name)))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_active_featured_providers(uuid, text) from public, anon;
grant execute on function public.get_active_featured_providers(uuid, text) to authenticated;

create or replace function public.get_provider_featured_listing_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider account required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', category.id, 'name', category.name)
                       order by category.sort_order, category.name)
      from public.provider_services service
      join public.service_categories category on category.id = service.category_id
      where service.provider_id = auth.uid()
        and service.is_active
        and category.is_active
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('area_name', area.area_name, 'county', area.county)
                       order by area.is_primary desc, area.county, area.area_name)
      from public.service_areas area
      where area.provider_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_provider_featured_listing_options() from public, anon;
grant execute on function public.get_provider_featured_listing_options() to authenticated;

create or replace function public.create_test_featured_listing(
  p_category_id uuid,
  p_area_name text,
  p_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_uuid uuid;
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider account required' using errcode = '42501';
  end if;
  if p_duration_days is null
     or p_duration_days not between 1 and 365
     or nullif(btrim(p_area_name), '') is null then
    raise exception 'Choose an area and a duration between 1 and 365 days' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.service_categories category
    join public.provider_services service on service.category_id = category.id
    where category.id = p_category_id
      and category.is_active
      and service.provider_id = auth.uid()
      and service.is_active
  ) then
    raise exception 'Choose a category you actively offer' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_areas area
    where area.provider_id = auth.uid()
      and lower(area.area_name) = lower(btrim(p_area_name))
  ) then
    raise exception 'Choose an area listed in your provider service areas' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.featured_listings listing
    where listing.provider_id = auth.uid()
      and listing.category_id = p_category_id
      and lower(listing.area_name) = lower(btrim(p_area_name))
      and listing.status = 'active'
      and listing.ends_at > now()
  ) then
    raise exception 'You already have an active featured listing for this service and area' using errcode = '22023';
  end if;

  insert into public.featured_listings (
    provider_id, category_id, area_name, duration_days, status,
    starts_at, ends_at, is_test
  ) values (
    auth.uid(), p_category_id, btrim(p_area_name), p_duration_days,
    'active', now(), now() + make_interval(days => p_duration_days), true
  ) returning id into listing_uuid;
  return listing_uuid;
end;
$$;
revoke all on function public.create_test_featured_listing(uuid, text, integer) from public, anon;
grant execute on function public.create_test_featured_listing(uuid, text, integer) to authenticated;

create or replace function public.start_provider_free_trial()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  subscription_uuid uuid;
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider account required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.provider_subscriptions
    where provider_id = auth.uid() and plan_key = 'free'
  ) then
    raise exception 'The free trial has already been used' using errcode = '22023';
  end if;
  insert into public.provider_subscriptions (provider_id, plan_key, status, starts_at, ends_at)
  values (auth.uid(), 'free', 'trial', now(), now() + interval '7 days')
  returning id into subscription_uuid;
  return subscription_uuid;
end;
$$;
revoke all on function public.start_provider_free_trial() from public, anon;
grant execute on function public.start_provider_free_trial() to authenticated;

create or replace function public.request_provider_subscription(p_plan_key text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_plan public.provider_plan_catalog%rowtype;
  subscription_uuid uuid;
  payment_uuid uuid;
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider account required' using errcode = '42501';
  end if;
  select * into selected_plan
  from public.provider_plan_catalog
  where plan_key = p_plan_key and is_active
  for share;
  if not found or selected_plan.price_kes <= 0 then
    raise exception 'Select an available paid plan' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.monetization_payments
    where provider_id = auth.uid() and status in ('awaiting_reference', 'submitted')
  ) then
    raise exception 'You already have a payment awaiting review' using errcode = '22023';
  end if;
  insert into public.provider_subscriptions (provider_id, plan_key, status)
  values (auth.uid(), p_plan_key, 'awaiting_payment')
  returning id into subscription_uuid;
  insert into public.monetization_payments (provider_id, subscription_id, amount_kes)
  values (auth.uid(), subscription_uuid, selected_plan.price_kes)
  returning id into payment_uuid;
  return payment_uuid;
end;
$$;
revoke all on function public.request_provider_subscription(text) from public, anon;
grant execute on function public.request_provider_subscription(text) to authenticated;

create or replace function public.request_featured_listing(
  p_category_id uuid,
  p_area_name text,
  p_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_uuid uuid;
  payment_uuid uuid;
begin
  if auth.uid() is null
     or not public.provider_is_email_verified_active(auth.uid()) then
    raise exception 'Active, email-verified provider account required' using errcode = '42501';
  end if;
  if p_duration_days not between 1 and 365
     or nullif(btrim(p_area_name), '') is null then
    raise exception 'Choose an area and a duration between 1 and 365 days' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_categories
    where id = p_category_id and is_active
  ) or not exists (
    select 1 from public.provider_services
    where provider_id = auth.uid()
      and category_id = p_category_id
      and is_active
  ) then
    raise exception 'Choose a category you actively offer' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_areas
    where provider_id = auth.uid()
      and lower(area_name) = lower(btrim(p_area_name))
  ) then
    raise exception 'Choose an area listed in your provider service areas' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.monetization_payments
    where provider_id = auth.uid()
      and status in ('awaiting_reference', 'submitted')
  ) then
    raise exception 'You already have a payment awaiting review' using errcode = '22023';
  end if;
  insert into public.featured_listings (
    provider_id, category_id, area_name, duration_days, status
  ) values (
    auth.uid(), p_category_id, btrim(p_area_name), p_duration_days, 'awaiting_payment'
  ) returning id into listing_uuid;
  insert into public.monetization_payments (provider_id, featured_listing_id, amount_kes)
  values (auth.uid(), listing_uuid, 100 * p_duration_days)
  returning id into payment_uuid;
  return payment_uuid;
end;
$$;
revoke all on function public.request_featured_listing(uuid, text, integer) from public, anon;
grant execute on function public.request_featured_listing(uuid, text, integer) to authenticated;

drop function if exists public.get_provider_public_profile(uuid);
create function public.get_provider_public_profile(p_provider_id uuid)
returns table (
  provider_id uuid,
  business_name text,
  bio text,
  profile_image_url text,
  rating_average numeric,
  total_reviews integer,
  verification_status text,
  email_verified boolean
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select provider.id, provider.business_name, provider.bio,
         provider.profile_image_url, provider.rating_average,
         provider.total_reviews, provider.verification_status,
         account.email_confirmed_at is not null
  from public.providers provider
  join public.profiles profile on profile.id = provider.id
  join auth.users account on account.id = provider.id
  where provider.id = p_provider_id
    and public.provider_is_email_verified_active(provider.id)
    and auth.uid() is not null;
$$;
revoke all on function public.get_provider_public_profile(uuid) from public, anon;
grant execute on function public.get_provider_public_profile(uuid) to authenticated;
