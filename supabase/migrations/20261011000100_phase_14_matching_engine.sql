-- Phase 14: create ranked request matches inside the database.
-- Matching runs after a request insert, so clients never write to request_matches.

alter table public.request_matches
  add column if not exists match_rank integer;

create index if not exists idx_request_matches_request_rank
  on public.request_matches (request_id, match_rank)
  where match_rank is not null;

create or replace function public.match_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
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

  with eligible as (
    select
      ps.provider_id,
      (
        case when p.is_online then 20 else 0 end
        + least(greatest(coalesce(p.rating_average, 0), 0), 5) * 5
        + least(greatest(coalesce(p.response_rate, 0), 0), 100) * 0.15
        + least(greatest(coalesce(p.completed_jobs, 0), 0), 100) * 0.1
      )::numeric as score
    from public.provider_services ps
    join public.providers p on p.id = ps.provider_id
    join public.profiles prof on prof.id = p.id
    join public.service_areas sa on sa.provider_id = ps.provider_id
    where ps.category_id = v_request.category_id
      and ps.is_active = true
      and p.verification_status = 'verified'
      and p.is_available = true
      and prof.is_active = true
      and prof.role = 'provider'
      and (
        (
          nullif(btrim(v_request.area_name), '') is not null
          and lower(btrim(sa.area_name)) = lower(btrim(v_request.area_name))
        )
        or
        (
          v_request.latitude is not null
          and v_request.longitude is not null
          and sa.latitude is not null
          and sa.longitude is not null
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
    group by ps.provider_id, p.is_online, p.rating_average, p.response_rate, p.completed_jobs
  ), ranked as (
    select provider_id,
      row_number() over (order by score desc, provider_id) as match_rank
    from eligible
  ), inserted as (
    insert into public.request_matches (request_id, provider_id, status, match_rank)
    select p_request_id, provider_id, 'pending', match_rank
    from ranked
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

create or replace function public.trigger_match_service_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.match_service_request(new.id);
  return new;
end;
$$;

revoke all on function public.trigger_match_service_request() from public, anon, authenticated;

drop trigger if exists service_requests_match_after_insert on public.service_requests;
create trigger service_requests_match_after_insert
  after insert on public.service_requests
  for each row execute function public.trigger_match_service_request();

