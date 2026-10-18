-- Offline-safe idempotency for customer request submissions.
-- A client keeps one UUID while retrying the same draft. The same key returns the
-- original request ID if Postgres committed but the client never received the reply.
--
-- App urgency values (now/today/this_week) are translated to the database's
-- constrained values (emergency/urgent/normal) before insertion.
-- The matching function below uses those database values for its scoring.

create table if not exists public.service_request_idempotency (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, client_request_id),
  unique (service_request_id)
);

alter table public.service_request_idempotency enable row level security;
revoke all on public.service_request_idempotency from public, anon, authenticated;

create or replace function public.create_service_request(
  p_category_id uuid,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_address text,
  p_area_name text,
  p_county text,
  p_urgency text,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_category public.service_categories%rowtype;
  v_request_id uuid;
  v_description text := btrim(coalesce(p_description, ''));
  v_area text := nullif(btrim(coalesce(p_area_name, '')), '');
  v_db_urgency text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user and role = 'customer' and is_active = true
  ) then
    raise exception 'An active customer account is required' using errcode = '42501';
  end if;

  -- Serialize submissions per customer before checking the idempotency key,
  -- rate limits or near-duplicate submissions.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if p_client_request_id is not null then
    select service_request_id into v_request_id
    from public.service_request_idempotency
    where customer_id = v_user
      and client_request_id = p_client_request_id;

    if v_request_id is not null then
      return v_request_id;
    end if;
  end if;

  if p_category_id is null or not exists (
    select 1 from public.service_categories
    where id = p_category_id and is_active = true
  ) then
    raise exception 'Choose an active service category' using errcode = '22023';
  end if;

  if length(v_description) < 10 or length(v_description) > 2000 then
    raise exception 'Describe the request using 10 to 2000 characters' using errcode = '22023';
  end if;

  if p_urgency is null or p_urgency not in ('now', 'today', 'this_week') then
    raise exception 'Choose a valid urgency' using errcode = '22023';
  end if;

  v_db_urgency := case p_urgency
    when 'now' then 'emergency'
    when 'today' then 'urgent'
    when 'this_week' then 'normal'
  end;

  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception 'Coordinates must be a valid pair' using errcode = '22023';
  end if;

  if (
    select count(*) from public.service_requests
    where customer_id = v_user and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Request limit reached. Please try again later.' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.service_requests
    where customer_id = v_user and created_at > now() - interval '1 day'
  ) >= 8 then
    raise exception 'Daily request limit reached. Please try again tomorrow.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.service_requests sr
    where sr.customer_id = v_user
      and sr.category_id = p_category_id
      and sr.status in ('open', 'matching', 'responses_received')
      and sr.created_at > now() - interval '15 minutes'
      and lower(coalesce(sr.area_name, '')) = lower(coalesce(v_area, ''))
      and regexp_replace(lower(btrim(sr.description)), '\s+', ' ', 'g')
          = regexp_replace(lower(v_description), '\s+', ' ', 'g')
  ) then
    raise exception 'A similar request was just submitted. Check your requests before trying again.'
      using errcode = 'P0001';
  end if;

  select * into v_category
  from public.service_categories
  where id = p_category_id and is_active = true;

  insert into public.service_requests (
    customer_id, category_id, title, description,
    latitude, longitude, address, area_name, county, urgency, status
  )
  values (
    v_user, p_category_id, v_category.name, v_description,
    p_latitude, p_longitude,
    nullif(btrim(coalesce(p_address, '')), ''),
    v_area, nullif(btrim(coalesce(p_county, '')), ''),
    v_db_urgency, 'open'
  )
  returning id into v_request_id;

  -- This mapping is in the same transaction as the request insert and its
  -- matching trigger. A retry can only observe the key if the whole transaction
  -- committed, and will then return the same request UUID.
  if p_client_request_id is not null then
    insert into public.service_request_idempotency (
      customer_id, client_request_id, service_request_id
    )
    values (v_user, p_client_request_id, v_request_id);
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.create_service_request(
  uuid, text, double precision, double precision, text, text, text, text, uuid
) from public, anon;
grant execute on function public.create_service_request(
  uuid, text, double precision, double precision, text, text, text, text, uuid
) to authenticated;

-- Keep the existing automatic matching trigger, but make its priority scoring
-- agree with the values permitted by service_requests_urgency_check.
create or replace function public.match_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
      p.id as provider_id,
      min(case
        when v_request.latitude is not null and v_request.longitude is not null
             and sa.latitude is not null and sa.longitude is not null then
          6371 * 2 * asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude - sa.latitude) / 2), 2)
            + cos(radians(sa.latitude)) * cos(radians(v_request.latitude))
            * power(sin(radians(v_request.longitude - sa.longitude) / 2), 2)
          )))
      end)::numeric as distance_km,
      p.is_online, p.is_available, p.rating_average, p.response_rate, p.completed_jobs
    from public.providers p
    join public.profiles prof on prof.id = p.id
    join public.provider_services ps
      on ps.provider_id = p.id
     and ps.category_id = v_request.category_id
     and ps.is_active = true
    join public.service_areas sa on sa.provider_id = p.id
    where p.verification_status = 'verified'
      and p.phone_verified = true
      and p.is_available = true
      and prof.is_active = true
      and prof.role = 'provider'
      and (
        (nullif(btrim(v_request.area_name), '') is not null
          and lower(btrim(sa.area_name)) = lower(btrim(v_request.area_name)))
        or (
          v_request.latitude is not null and v_request.longitude is not null
          and sa.latitude is not null and sa.longitude is not null
          and 6371 * 2 * asin(sqrt(least(1::double precision,
            power(sin(radians(v_request.latitude - sa.latitude) / 2), 2)
            + cos(radians(sa.latitude)) * cos(radians(v_request.latitude))
            * power(sin(radians(v_request.longitude - sa.longitude) / 2), 2)
          ))) <= sa.radius_km
        )
      )
      and (
        nullif(btrim(v_request.county), '') is null
        or nullif(btrim(sa.county), '') is null
        or lower(btrim(sa.county)) = lower(btrim(v_request.county))
      )
    group by p.id, p.is_online, p.is_available, p.rating_average, p.response_rate, p.completed_jobs
  ), scored as (
    select provider_id, distance_km,
      (
        least(greatest(coalesce(rating_average, 0), 0), 5) * 6
        + least(greatest(coalesce(response_rate, 0), 0), 100) * 0.15
        + least(greatest(coalesce(completed_jobs, 0), 0), 100) * 0.1
        + case
            when is_online and v_request.urgency = 'emergency' then 30
            when is_online and v_request.urgency = 'urgent' then 20
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
$function$;
