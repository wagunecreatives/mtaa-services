-- Request owners may contact providers who accepted their request. The RPC
-- still checks request ownership, and rejected responses never expose contact.
drop function if exists public.get_customer_request_details(uuid);
create function public.get_customer_request_details(p_request_id uuid)
returns table(
  response_id uuid,provider_id uuid,business_name text,provider_name text,rating_average numeric,total_reviews integer,
  message text,quoted_price numeric,estimated_arrival_minutes integer,response_status text,job_id uuid,job_status text,
  agreed_price numeric,started_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,provider_contact text,
  distance_km numeric,provider_available boolean,verification_status text,phone_verified boolean,
  provider_phone text,provider_whatsapp text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.service_requests sr where sr.id=p_request_id and sr.customer_id=auth.uid()
  ) then
    raise exception 'Request not found or not owned by this customer' using errcode='42501';
  end if;

  return query
  select pr.id,p.id,p.business_name,profile.full_name,p.rating_average::numeric,p.total_reviews::integer,
    pr.message,pr.quoted_price,pr.estimated_arrival_minutes,pr.status,j.id,j.status,j.agreed_price,
    j.started_at,j.completed_at,j.cancelled_at,
    case when j.id is not null and j.provider_id=p.id and j.status<>'cancelled' then coalesce(p.whatsapp_number,p.phone) else null end,
    rm.distance_km,p.is_available,p.verification_status,p.phone_verified,
    case when pr.status in ('pending','accepted') then p.phone else null end,
    case when pr.status in ('pending','accepted') then p.whatsapp_number else null end
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
