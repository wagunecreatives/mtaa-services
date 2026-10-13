-- Platform funnel analytics and customer request abuse controls.
-- Request limits are enforced in Postgres so direct REST clients cannot bypass them.

-- Keep provider profile uploads public for profile rendering, but accept only small raster images.
update storage.buckets set file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp']
where id='provider-assets';
drop policy if exists "Providers upload their own onboarding assets" on storage.objects;
create policy "Providers upload their own onboarding assets"
on storage.objects for insert to authenticated
with check (bucket_id='provider-assets' and (storage.foldername(name))[1]=(select auth.uid())::text
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp'));
drop policy if exists "Providers update their own onboarding assets" on storage.objects;
create policy "Providers update their own onboarding assets"
on storage.objects for update to authenticated
using (bucket_id='provider-assets' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='provider-assets' and (storage.foldername(name))[1]=(select auth.uid())::text
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp'));

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;
grant select on public.user_blocks to authenticated;
drop policy if exists "Users view their own blocks" on public.user_blocks;
create policy "Users view their own blocks" on public.user_blocks
  for select to authenticated using (blocker_id=auth.uid());

create or replace function public.block_user(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'Choose another account to block' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Account not found' using errcode='P0002'; end if;
  if not exists (
    select 1 from public.jobs j where (j.customer_id=auth.uid() and j.provider_id=p_user_id) or (j.provider_id=auth.uid() and j.customer_id=p_user_id)
    union all
    select 1 from public.service_requests sr join public.request_matches rm on rm.request_id=sr.id
      where (sr.customer_id=auth.uid() and rm.provider_id=p_user_id) or (sr.customer_id=p_user_id and rm.provider_id=auth.uid())
  ) then raise exception 'You can block accounts you have interacted with' using errcode='42501'; end if;
  insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.block_user(uuid) from public,anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  delete from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_user_id;
  return found;
end;
$$;
revoke all on function public.unblock_user(uuid) from public,anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Enforce blocks at the database boundary, including rows created by older app builds.
create or replace function public.enforce_marketplace_user_blocks()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare customer_user uuid; provider_user uuid;
begin
  if tg_table_name='request_matches' then
    select customer_id into customer_user from public.service_requests where id=new.request_id;
    provider_user:=new.provider_id;
  elsif tg_table_name='provider_responses' then
    customer_user:=null;
    select sr.customer_id into customer_user from public.service_requests sr where sr.id=new.request_id;
    provider_user:=new.provider_id;
  else
    customer_user:=new.customer_id;
    provider_user:=new.provider_id;
  end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=customer_user and b.blocked_id=provider_user)
    or (b.blocker_id=provider_user and b.blocked_id=customer_user)) then
    if tg_table_name='request_matches' then return null; end if;
    raise exception 'This interaction is unavailable because one account has blocked the other' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_marketplace_user_blocks() from public,anon,authenticated;
drop trigger if exists request_matches_block_guard on public.request_matches;
create trigger request_matches_block_guard before insert on public.request_matches
for each row execute function public.enforce_marketplace_user_blocks();
drop trigger if exists provider_responses_block_guard on public.provider_responses;
create trigger provider_responses_block_guard before insert on public.provider_responses
for each row execute function public.enforce_marketplace_user_blocks();
drop trigger if exists jobs_block_guard on public.jobs;
create trigger jobs_block_guard before insert on public.jobs
for each row execute function public.enforce_marketplace_user_blocks();

-- Slow report/review floods and prevent repeated copy-paste reviews from one account.
create or replace function public.guard_user_generated_content()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='user_reports' then
    perform pg_advisory_xact_lock(hashtextextended(new.reporter_id::text,1));
    if (select count(*) from public.user_reports where reporter_id=new.reporter_id and created_at>now()-interval '1 day')>=5 then
      raise exception 'Daily report limit reached' using errcode='P0001';
    end if;
    if exists(select 1 from public.user_reports where reporter_id=new.reporter_id and reported_user_id=new.reported_user_id
      and report_type=new.report_type and created_at>now()-interval '30 days'
      and job_id is not distinct from new.job_id) then raise exception 'You already submitted this report' using errcode='23505'; end if;
  elsif tg_table_name='reviews' then
    perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text,2));
    if (select count(*) from public.reviews where customer_id=new.customer_id and created_at>now()-interval '1 day')>=3 then
      raise exception 'Daily review limit reached' using errcode='P0001';
    end if;
    if nullif(btrim(coalesce(new.review_text,new.comment,'')),'') is not null and exists(
      select 1 from public.reviews where customer_id=new.customer_id and provider_id=new.provider_id
        and lower(regexp_replace(btrim(coalesce(review_text,comment,'')),'\s+',' ','g'))=
            lower(regexp_replace(btrim(coalesce(new.review_text,new.comment,'')),'\s+',' ','g'))
    ) then raise exception 'Repeated review text is not allowed' using errcode='22023'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_user_generated_content() from public,anon,authenticated;
drop trigger if exists user_reports_abuse_guard on public.user_reports;
create trigger user_reports_abuse_guard before insert on public.user_reports
for each row execute function public.guard_user_generated_content();
drop trigger if exists reviews_abuse_guard on public.reviews;
create trigger reviews_abuse_guard before insert on public.reviews
for each row execute function public.guard_user_generated_content();

create or replace function public.create_service_request(
  p_category_id uuid,p_description text,p_latitude double precision,p_longitude double precision,
  p_address text,p_area_name text,p_county text,p_urgency text
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_category public.service_categories%rowtype; v_request_id uuid;
  v_description text:=btrim(coalesce(p_description,'')); v_area text:=nullif(btrim(coalesce(p_area_name,'')),'');
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles where id=v_user and role='customer' and is_active=true) then
    raise exception 'An active customer account is required' using errcode='42501';
  end if;
  if p_category_id is null or not exists(select 1 from public.service_categories where id=p_category_id and is_active=true) then
    raise exception 'Choose an active service category' using errcode='22023';
  end if;
  if length(v_description)<10 or length(v_description)>2000 then raise exception 'Describe the request using 10 to 2000 characters' using errcode='22023'; end if;
  if p_urgency not in ('now','today','this_week') then raise exception 'Choose a valid urgency' using errcode='22023'; end if;
  if (p_latitude is null)<>(p_longitude is null) or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordinates must be a valid pair' using errcode='22023';
  end if;

  -- Serialize this account's submissions so concurrent calls cannot bypass limits.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  if (select count(*) from public.service_requests where customer_id=v_user and created_at>now()-interval '1 hour')>=3 then
    raise exception 'Request limit reached. Please try again later.' using errcode='P0001';
  end if;
  if (select count(*) from public.service_requests where customer_id=v_user and created_at>now()-interval '1 day')>=8 then
    raise exception 'Daily request limit reached. Please try again tomorrow.' using errcode='P0001';
  end if;
  if exists(select 1 from public.service_requests sr where sr.customer_id=v_user and sr.category_id=p_category_id
    and sr.status in ('open','matching','responses_received') and sr.created_at>now()-interval '15 minutes'
    and lower(coalesce(sr.area_name,''))=lower(coalesce(v_area,''))
    and regexp_replace(lower(btrim(sr.description)),'\s+',' ','g')=regexp_replace(lower(v_description),'\s+',' ','g')) then
    raise exception 'A similar request was just submitted. Check your requests before trying again.' using errcode='P0001';
  end if;

  select * into v_category from public.service_categories where id=p_category_id and is_active=true;
  insert into public.service_requests(customer_id,category_id,title,description,latitude,longitude,address,area_name,county,urgency,status)
  values(v_user,p_category_id,v_category.name,v_description,p_latitude,p_longitude,nullif(btrim(coalesce(p_address,'')),''),v_area,
    nullif(btrim(coalesce(p_county,'')),''),p_urgency,'open') returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_service_request(uuid,text,double precision,double precision,text,text,text,text) from public,anon;
grant execute on function public.create_service_request(uuid,text,double precision,double precision,text,text,text,text) to authenticated;
revoke insert on public.service_requests from public,anon,authenticated;

create or replace function public.admin_platform_analytics(p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_from timestamptz:=coalesce(p_from,now()-interval '30 days'); v_to timestamptz:=coalesce(p_to,now()); result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if v_from>=v_to or v_to-v_from>interval '2 years' then raise exception 'Choose a valid date range up to two years' using errcode='22023'; end if;
  select jsonb_build_object(
    'from',v_from,'to',v_to,
    'new_users',(select count(*) from public.profiles p where p.created_at>=v_from and p.created_at<v_to),
    'new_providers',(select count(*) from public.profiles p where p.role='provider' and p.created_at>=v_from and p.created_at<v_to),
    'requests',(select count(*) from public.service_requests r where r.created_at>=v_from and r.created_at<v_to),
    'requests_with_response',(select count(*) from public.service_requests r where r.created_at>=v_from and r.created_at<v_to and exists(select 1 from public.provider_responses pr where pr.request_id=r.id)),
    'successful_connections',(select count(*) from public.service_requests r where r.created_at>=v_from and r.created_at<v_to and exists(select 1 from public.jobs j where j.request_id=r.id)),
    'completed_jobs',(select count(*) from public.jobs j join public.service_requests r on r.id=j.request_id where r.created_at>=v_from and r.created_at<v_to and j.status='completed'),
    'response_rate_pct',coalesce((select round(100.0*count(*) filter(where exists(select 1 from public.provider_responses pr where pr.request_id=r.id))/nullif(count(*),0),1) from public.service_requests r where r.created_at>=v_from and r.created_at<v_to),0),
    'acceptance_rate_pct',coalesce((select round(100.0*count(*) filter(where exists(select 1 from public.jobs j where j.request_id=r.id))/nullif(count(*) filter(where exists(select 1 from public.provider_responses pr where pr.request_id=r.id)),0),1) from public.service_requests r where r.created_at>=v_from and r.created_at<v_to),0),
    'completion_rate_pct',coalesce((select round(100.0*count(*) filter(where j.status='completed')/nullif(count(*),0),1) from public.jobs j join public.service_requests r on r.id=j.request_id where r.created_at>=v_from and r.created_at<v_to),0),
    'avg_response_minutes',(select round(avg(extract(epoch from (first_response.created_at-r.created_at))/60)::numeric,1) from public.service_requests r cross join lateral (select min(pr.created_at) created_at from public.provider_responses pr where pr.request_id=r.id) first_response where r.created_at>=v_from and r.created_at<v_to and first_response.created_at is not null),
    'reviews',(select count(*) from public.reviews rv where rv.created_at>=v_from and rv.created_at<v_to),
    'revenue_kes',(select coalesce(sum(mp.amount_kes),0) from public.monetization_payments mp where mp.status='verified' and mp.verified_at>=v_from and mp.verified_at<v_to),
    'subscriptions_created',(select count(*) from public.provider_subscriptions s where s.created_at>=v_from and s.created_at<v_to),
    'active_subscriptions',(select count(*) from public.provider_subscriptions where status in ('active','trial') and ends_at>now()),
    'featured_listings_created',(select count(*) from public.featured_listings f where f.created_at>=v_from and f.created_at<v_to),
    'active_featured_listings',(select count(*) from public.featured_listings where status='active' and ends_at>now()),
    'requests_by_category',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'requests',requests) order by requests desc),'[]'::jsonb) from (select coalesce(c.name,'Unknown') category,count(*) requests from public.service_requests r left join public.service_categories c on c.id=r.category_id where r.created_at>=v_from and r.created_at<v_to group by c.name) q),
    'requests_by_location',(select coalesce(jsonb_agg(jsonb_build_object('area',area,'county',county,'requests',requests) order by requests desc),'[]'::jsonb) from (select coalesce(nullif(r.area_name,''),'Unspecified') area,coalesce(nullif(r.county,''),'Unspecified') county,count(*) requests from public.service_requests r where r.created_at>=v_from and r.created_at<v_to group by 1,2) q)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_platform_analytics(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_platform_analytics(timestamptz,timestamptz) to authenticated;

