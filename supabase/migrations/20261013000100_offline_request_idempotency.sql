-- Offline-safe idempotency for customer request submissions.
-- A client keeps one UUID while retrying the same draft. The same key returns the
-- original request ID if Postgres committed but the client never received the reply.

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

drop function if exists public.create_service_request(uuid,text,double precision,double precision,text,text,text,text);

create function public.create_service_request(
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
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_category public.service_categories%rowtype;
  v_request_id uuid;
  v_description text := btrim(coalesce(p_description,''));
  v_area text := nullif(btrim(coalesce(p_area_name,'')),'');
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not exists(select 1 from public.profiles where id=v_user and role='customer' and is_active=true) then
    raise exception 'An active customer account is required' using errcode='42501';
  end if;

  -- Serialize by user before checking the idempotency key, rate limits or duplicates.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  if p_client_request_id is not null then
    select service_request_id into v_request_id
    from public.service_request_idempotency
    where customer_id=v_user and client_request_id=p_client_request_id;
    if v_request_id is not null then
      return v_request_id;
    end if;
  end if;

  if p_category_id is null or not exists(select 1 from public.service_categories where id=p_category_id and is_active=true) then
    raise exception 'Choose an active service category' using errcode='22023';
  end if;
  if length(v_description)<10 or length(v_description)>2000 then
    raise exception 'Describe the request using 10 to 2000 characters' using errcode='22023';
  end if;
  if p_urgency not in ('now','today','this_week') then
    raise exception 'Choose a valid urgency' using errcode='22023';
  end if;
  if (p_latitude is null)<>(p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception 'Coordinates must be a valid pair' using errcode='22023';
  end if;

  if (select count(*) from public.service_requests where customer_id=v_user and created_at>now()-interval '1 hour')>=3 then
    raise exception 'Request limit reached. Please try again later.' using errcode='P0001';
  end if;
  if (select count(*) from public.service_requests where customer_id=v_user and created_at>now()-interval '1 day')>=8 then
    raise exception 'Daily request limit reached. Please try again tomorrow.' using errcode='P0001';
  end if;
  if exists(
    select 1 from public.service_requests sr
    where sr.customer_id=v_user and sr.category_id=p_category_id
      and sr.status in ('open','matching','responses_received')
      and sr.created_at>now()-interval '15 minutes'
      and lower(coalesce(sr.area_name,''))=lower(coalesce(v_area,''))
      and regexp_replace(lower(btrim(sr.description)),'\\s+',' ','g')=regexp_replace(lower(v_description),'\\s+',' ','g')
  ) then
    raise exception 'A similar request was just submitted. Check your requests before trying again.' using errcode='P0001';
  end if;

  select * into v_category from public.service_categories where id=p_category_id and is_active=true;
  insert into public.service_requests(
    customer_id,category_id,title,description,latitude,longitude,address,area_name,county,urgency,status
  )
  values(
    v_user,p_category_id,v_category.name,v_description,p_latitude,p_longitude,
    nullif(btrim(coalesce(p_address,'')),''),
    v_area,nullif(btrim(coalesce(p_county,'')),''),p_urgency,'open'
  )
  returning id into v_request_id;

  if p_client_request_id is not null then
    insert into public.service_request_idempotency(customer_id,client_request_id,service_request_id)
    values(v_user,p_client_request_id,v_request_id);
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid) from public,anon;
grant execute on function public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid) to authenticated;
revoke insert on public.service_requests from public,anon,authenticated;
