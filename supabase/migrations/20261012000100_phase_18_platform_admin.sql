-- Phase 18: secure platform operations and reporting.
-- Administrative reads and writes are exposed through SECURITY DEFINER RPCs;
-- the mobile client never receives a service-role credential.

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin' and p.is_active = true
  );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- A customer/provider cannot undo an administrative suspension by editing their
-- own profile. The security-definer management RPCs remain able to change it.
create or replace function public.prevent_self_active_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and auth.uid() = old.id
     and new.is_active is distinct from old.is_active
     and not coalesce(public.is_admin(), false) then
    raise exception 'Account status changes require platform administration' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_prevent_self_active_change on public.profiles;
create trigger profiles_prevent_self_active_change before update of is_active on public.profiles
for each row execute function public.prevent_self_active_change();
revoke all on function public.prevent_self_active_change() from public, anon, authenticated;

-- Supported coverage is platform configuration, distinct from provider coverage.
create table if not exists public.platform_service_areas (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  area_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county, area_name)
);
alter table public.platform_service_areas enable row level security;
revoke all on public.platform_service_areas from public, anon, authenticated;
grant select on public.platform_service_areas to authenticated;
drop policy if exists platform_service_areas_read_active on public.platform_service_areas;
create policy platform_service_areas_read_active on public.platform_service_areas
for select to authenticated using (is_active or coalesce(public.is_admin(), false));

create or replace function public.admin_dashboard_metrics()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'customers', (select count(*) from public.profiles where role = 'customer'),
    'providers', (select count(*) from public.profiles where role = 'provider'),
    'verified_providers', (select count(*) from public.providers where verification_status = 'verified'),
    'open_requests', (select count(*) from public.service_requests where status in ('open','matching','responses_received')),
    'active_jobs', (select count(*) from public.jobs where status in ('assigned','accepted','on_the_way','arrived','in_progress','awaiting_confirmation')),
    'completed_jobs', (select count(*) from public.jobs where status = 'completed'),
    'cancellation_rate', coalesce((select round(100.0 * count(*) filter (where status='cancelled') / nullif(count(*),0), 1) from public.jobs), 0),
    'average_provider_rating', coalesce((select round(avg(rating_average)::numeric, 2) from public.providers where total_reviews > 0), 0),
    'jobs_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category_name, 'jobs', job_count) order by job_count desc)
      from (select sc.name category_name, count(j.id) job_count from public.jobs j join public.service_requests sr on sr.id=j.request_id
        join public.service_categories sc on sc.id=sr.category_id group by sc.name) q), '[]'::jsonb),
    'jobs_by_area', coalesce((select jsonb_agg(jsonb_build_object('area', area_name, 'jobs', job_count) order by job_count desc)
      from (select coalesce(nullif(sr.area_name,''),'Unspecified') area_name, count(j.id) job_count
        from public.jobs j join public.service_requests sr on sr.id=j.request_id group by 1) q), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_providers(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'business_name',p.business_name,
    'verification_status',p.verification_status,'rating_average',p.rating_average,'total_reviews',p.total_reviews,
    'total_jobs',p.total_jobs,'completed_jobs',p.completed_jobs,'response_rate',p.response_rate,
    'is_available',p.is_available,'profile',jsonb_build_object('full_name',pr.full_name,'email',u.email,'phone',pr.phone,'is_active',pr.is_active),
    'recent_jobs',(select coalesce(jsonb_agg(jsonb_build_object('job_id',j.id,'status',j.status,'created_at',j.created_at,'category',sc.name,'area_name',sr.area_name) order by j.created_at desc),'[]'::jsonb)
      from public.jobs j join public.service_requests sr on sr.id=j.request_id join public.service_categories sc on sc.id=sr.category_id where j.provider_id=p.id))
    order by p.updated_at desc)
    from public.providers p join public.profiles pr on pr.id=p.id left join auth.users u on u.id=pr.id
    where p_search is null or concat_ws(' ',p.business_name,pr.full_name,u.email,pr.phone) ilike '%'||p_search||'%'), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_provider_applications(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('applicant',jsonb_build_object('full_name',p.full_name,'email',u.email,'phone',p.phone),
    'services',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.provider_application_services s where coalesce(to_jsonb(s)->>'application_id',to_jsonb(s)->>'provider_application_id')=a.id::text),
    'areas',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.provider_application_areas s where coalesce(to_jsonb(s)->>'application_id',to_jsonb(s)->>'provider_application_id')=a.id::text)) order by a.created_at desc)
    from public.provider_applications a left join public.profiles p on p.id=a.user_id left join auth.users u on u.id=p.id
    where p_status is null or a.status=p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_search_customers(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',u.email,'phone',p.phone,'is_active',p.is_active,'created_at',p.created_at,
    'request_count',(select count(*) from public.service_requests sr where sr.customer_id=p.id),
    'job_count',(select count(*) from public.jobs j where j.customer_id=p.id),
    'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',sr.id,'title',sr.title,'status',sr.status,'area_name',sr.area_name,'created_at',sr.created_at) order by sr.created_at desc),'[]'::jsonb) from public.service_requests sr where sr.customer_id=p.id),
    'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'status',j.status,'created_at',j.created_at,'area_name',sr.area_name,'category',sc.name,'provider',prv.business_name) order by j.created_at desc),'[]'::jsonb)
      from public.jobs j join public.service_requests sr on sr.id=j.request_id join public.service_categories sc on sc.id=sr.category_id left join public.providers prv on prv.id=j.provider_id where j.customer_id=p.id)) order by p.created_at desc)
    from public.profiles p left join auth.users u on u.id=p.id where p.role='customer' and (p_search is null or concat_ws(' ',p.full_name,u.email,p.phone) ilike '%'||p_search||'%')), '[]'::jsonb);
end;
$$;

create or replace function public.admin_review_provider_application(p_application_id uuid,p_decision text,p_notes text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.provider_applications%rowtype; app_json jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='22023'; end if;
  select * into a from public.provider_applications where id=p_application_id for update;
  if not found then raise exception 'Provider application not found' using errcode='P0002'; end if;
  if a.status not in ('pending','under_review') then raise exception 'Application has already been decided' using errcode='22023'; end if;
  app_json:=to_jsonb(a);
  if p_decision='approved' then
    insert into public.providers(id,business_name,bio,phone,whatsapp_number,profile_image_url,verification_status,is_available,is_online,updated_at)
    values(a.user_id,coalesce(app_json->>'business_name',''),app_json->>'bio',app_json->>'phone',app_json->>'whatsapp_number',
      app_json->>'profile_image_url','verified',true,false,now())
    on conflict(id) do update set business_name=excluded.business_name,bio=excluded.bio,phone=excluded.phone,
      whatsapp_number=excluded.whatsapp_number,profile_image_url=excluded.profile_image_url,verification_status='verified',updated_at=now();
    update public.profiles set role='provider',account_type='provider',updated_at=now() where id=a.user_id;
    insert into public.provider_services(provider_id,category_id,is_active)
      select a.user_id,(child.row_data->>'category_id')::uuid,true
      from (select to_jsonb(s) row_data from public.provider_application_services s) child
      where coalesce(child.row_data->>'application_id',child.row_data->>'provider_application_id')=a.id::text
        and child.row_data->>'category_id' is not null
        and not exists(select 1 from public.provider_services ps where ps.provider_id=a.user_id and ps.category_id=(child.row_data->>'category_id')::uuid);
    insert into public.service_areas(provider_id,county,area_name,latitude,longitude,radius_km,is_primary)
      select a.user_id,child.row_data->>'county',coalesce(child.row_data->>'area_name',child.row_data->>'area'),
        nullif(child.row_data->>'latitude','')::double precision,nullif(child.row_data->>'longitude','')::double precision,
        nullif(child.row_data->>'radius_km','')::double precision,coalesce(nullif(child.row_data->>'is_primary','')::boolean,false)
      from (select to_jsonb(s) row_data from public.provider_application_areas s) child
      where coalesce(child.row_data->>'application_id',child.row_data->>'provider_application_id')=a.id::text
        and coalesce(child.row_data->>'area_name',child.row_data->>'area') is not null
        and not exists(select 1 from public.service_areas sa where sa.provider_id=a.user_id
          and sa.area_name=coalesce(child.row_data->>'area_name',child.row_data->>'area')
          and sa.county is not distinct from child.row_data->>'county');
  end if;
  update public.provider_applications set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_notes where id=a.id;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'provider_application_'||p_decision,'provider_application',a.id,coalesce(p_notes,p_decision),jsonb_build_object('user_id',a.user_id));
  return true;
end;
$$;

create or replace function public.admin_list_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',sr.id,'customer_id',sr.customer_id,'category_id',sr.category_id,
    'title',sr.title,'description',sr.description,'urgency',sr.urgency,'status',sr.status,'area_name',sr.area_name,'county',sr.county,'created_at',sr.created_at,
    'category',sc.name,'customer',jsonb_build_object('id',p.id,'full_name',p.full_name),
    'match_count',(select count(*) from public.request_matches m where m.request_id=sr.id),
    'response_count',(select count(*) from public.provider_responses r where r.request_id=sr.id),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('provider_id',m.provider_id,'business_name',prv.business_name,'match_status',m.status,'response_status',resp.status) order by m.match_rank nulls last),'[]'::jsonb)
      from public.request_matches m left join public.providers prv on prv.id=m.provider_id left join public.provider_responses resp on resp.match_id=m.id where m.request_id=sr.id)) order by sr.created_at desc)
    from public.service_requests sr join public.service_categories sc on sc.id=sr.category_id left join public.profiles p on p.id=sr.customer_id
    where p_status is null or sr.status=p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_reports(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.reports r where p_status is null or r.status=p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_reviews()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('customer_name',p.full_name,'provider_name',pr.business_name,'job_status',j.status) order by r.created_at desc)
    from public.reviews r join public.jobs j on j.id=r.job_id left join public.profiles p on p.id=r.customer_id
    left join public.providers pr on pr.id=r.provider_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_report(p_report_id uuid, p_status text, p_notes text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if nullif(btrim(p_status),'') is null then raise exception 'Report status is required' using errcode='22023'; end if;
  update public.reports set status=btrim(p_status),admin_notes=p_notes,resolved_by=case when p_status in ('resolved','dismissed','closed') then auth.uid() else null end,
    resolved_at=case when p_status in ('resolved','dismissed','closed') then now() else null end where id=p_report_id;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'report_status_changed','report',p_report_id,coalesce(p_notes,p_status),jsonb_build_object('status',p_status));
  return true;
end;
$$;

create or replace function public.admin_filter_jobs(p_status text default null,p_category text default null,
  p_area text default null,p_provider text default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('job_id',j.id,'request_id',j.request_id,'customer_id',j.customer_id,
    'customer_name',cu.full_name,'provider_id',j.provider_id,'business_name',p.business_name,'title',sr.title,'category',sc.name,
    'area_name',sr.area_name,'county',sr.county,'status',j.status,'agreed_price',j.agreed_price,'created_at',j.created_at,
    'started_at',j.started_at,'completed_at',j.completed_at,'cancelled_at',j.cancelled_at,'cancellation_reason',j.cancellation_reason,
    'response',jsonb_build_object('status',resp.status,'message',resp.message,'quoted_price',resp.quoted_price,'estimated_arrival_minutes',resp.estimated_arrival_minutes),
    'review',jsonb_build_object('rating',rv.rating,'review_text',rv.review_text,'is_visible',rv.is_visible)) order by j.created_at desc)
    from public.jobs j join public.service_requests sr on sr.id=j.request_id join public.service_categories sc on sc.id=sr.category_id
    left join public.profiles cu on cu.id=j.customer_id left join public.providers p on p.id=j.provider_id
    left join public.provider_responses resp on resp.id=j.response_id left join public.reviews rv on rv.job_id=j.id
    where (p_status is null or j.status=p_status) and (p_category is null or sr.category_id::text=p_category or sc.name ilike '%'||p_category||'%')
      and (p_area is null or sr.area_name ilike '%'||p_area||'%') and (p_provider is null or j.provider_id::text=p_provider or p.business_name ilike '%'||p_provider||'%')
      and (p_from is null or j.created_at>=p_from) and (p_to is null or j.created_at<p_to)), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_categories()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.service_categories c), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_platform_areas()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.county,a.sort_order,a.area_name) from public.platform_service_areas a), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_audit(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('admin_name',p.full_name) order by a.created_at desc)
    from (select * from public.admin_actions order by created_at desc limit greatest(1,least(coalesce(p_limit,100),250))) a
    left join public.profiles p on p.id=a.admin_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_customer_active(p_customer_id uuid, p_active boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason))=0 then raise exception 'A reason is required' using errcode='22023'; end if;
  update public.profiles set is_active=p_active where id=p_customer_id and role='customer';
  if not found then raise exception 'Customer not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),case when p_active then 'customer_activated' else 'customer_deactivated' end,'profile',p_customer_id,btrim(p_reason),jsonb_build_object('is_active',p_active));
  return true;
end;
$$;

create or replace function public.admin_set_provider_status(p_provider_id uuid, p_status text, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status not in ('pending','verified','rejected','suspended') then raise exception 'Unknown provider status' using errcode='22023'; end if;
  if p_reason is null or length(btrim(p_reason))=0 then raise exception 'A reason is required' using errcode='22023'; end if;
  update public.providers set verification_status=p_status,verification_notes=btrim(p_reason),updated_at=now() where id=p_provider_id;
  if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'provider_status_changed','provider',p_provider_id,btrim(p_reason),jsonb_build_object('verification_status',p_status));
  return true;
end;
$$;

create or replace function public.admin_set_review_visibility(p_job_id uuid, p_visible boolean, p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare review_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason))=0 then raise exception 'A moderation reason is required' using errcode='22023'; end if;
  update public.reviews set is_visible=p_visible where job_id=p_job_id returning id into review_id;
  if review_id is null then raise exception 'Review not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'review_visibility_changed','review',review_id,btrim(p_reason),jsonb_build_object('is_visible',p_visible));
  return true;
end;
$$;

create or replace function public.admin_save_category(p_category_id uuid, p_name text, p_slug text,
  p_description text, p_icon text, p_active boolean, p_sort_order integer)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if nullif(btrim(p_name),'') is null or nullif(btrim(p_slug),'') is null then raise exception 'Category name and slug are required' using errcode='22023'; end if;
  if p_category_id is null then
    insert into public.service_categories(name,slug,description,icon,is_active,sort_order)
    values(btrim(p_name),btrim(p_slug),p_description,p_icon,coalesce(p_active,true),coalesce(p_sort_order,0)) returning id into saved_id;
  else
    update public.service_categories set name=btrim(p_name),slug=btrim(p_slug),description=p_description,icon=p_icon,
      is_active=p_active,sort_order=coalesce(p_sort_order,0) where id=p_category_id returning id into saved_id;
    if saved_id is null then raise exception 'Category not found' using errcode='P0002'; end if;
  end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),case when p_category_id is null then 'category_created' else 'category_updated' end,'service_category',saved_id,
    'Service category changed',jsonb_build_object('name',p_name,'is_active',p_active,'sort_order',p_sort_order));
  return saved_id;
end;
$$;

create or replace function public.admin_save_platform_area(p_county text, p_area_name text, p_active boolean, p_sort_order integer)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_super_admin(), false) then raise exception 'Super-admin access required' using errcode='42501'; end if;
  if nullif(btrim(p_county),'') is null or nullif(btrim(p_area_name),'') is null then raise exception 'County and area are required' using errcode='22023'; end if;
  insert into public.platform_service_areas(county,area_name,is_active,sort_order,updated_at)
  values(btrim(p_county),btrim(p_area_name),coalesce(p_active,true),coalesce(p_sort_order,0),now())
  on conflict(county,area_name) do update set is_active=excluded.is_active,sort_order=excluded.sort_order,updated_at=now()
  returning id into saved_id;
  insert into public.admin_actions(admin_id,action,target_type,target_id,description,metadata)
  values(auth.uid(),'platform_area_changed','platform_service_area',saved_id,'Platform service area changed',
    jsonb_build_object('county',p_county,'area_name',p_area_name,'is_active',p_active));
  return saved_id;
end;
$$;

-- Every callable admin RPC verifies the authenticated database identity itself.
revoke all on function public.admin_dashboard_metrics() from public,anon;
revoke all on function public.admin_list_providers(text) from public,anon;
revoke all on function public.admin_list_provider_applications(text) from public,anon;
revoke all on function public.admin_search_customers(text) from public,anon;
revoke all on function public.admin_review_provider_application(uuid,text,text) from public,anon;
revoke all on function public.admin_list_requests(text) from public,anon;
revoke all on function public.admin_list_reports(text) from public,anon;
revoke all on function public.admin_list_reviews() from public,anon;
revoke all on function public.admin_update_report(uuid,text,text) from public,anon;
revoke all on function public.admin_filter_jobs(text,text,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.admin_list_categories() from public,anon;
revoke all on function public.admin_list_platform_areas() from public,anon;
revoke all on function public.admin_list_audit(integer) from public,anon;
revoke all on function public.admin_set_customer_active(uuid,boolean,text) from public,anon;
revoke all on function public.admin_set_provider_status(uuid,text,text) from public,anon;
revoke all on function public.admin_set_review_visibility(uuid,boolean,text) from public,anon;
revoke all on function public.admin_save_category(uuid,text,text,text,text,boolean,integer) from public,anon;
revoke all on function public.admin_save_platform_area(text,text,boolean,integer) from public,anon;
grant execute on function public.admin_dashboard_metrics(), public.admin_list_providers(text),
  public.admin_list_provider_applications(text), public.admin_search_customers(text), public.admin_list_requests(text),
  public.admin_review_provider_application(uuid,text,text),
  public.admin_list_reports(text), public.admin_list_reviews(), public.admin_update_report(uuid,text,text),
  public.admin_filter_jobs(text,text,text,text,timestamptz,timestamptz), public.admin_list_categories(), public.admin_list_platform_areas(), public.admin_list_audit(integer),
  public.admin_set_customer_active(uuid,boolean,text), public.admin_set_provider_status(uuid,text,text),
  public.admin_set_review_visibility(uuid,boolean,text), public.admin_save_category(uuid,text,text,text,text,boolean,integer),
  public.admin_save_platform_area(text,text,boolean,integer) to authenticated;

-- The audit table is writeable only inside the SECURITY DEFINER operations above.
revoke all on public.admin_actions from public,anon,authenticated;
grant select on public.admin_actions to authenticated;

-- Disable the legacy approval/status entry points: the replacement RPCs above
-- apply the current schema mapping and write an audit record transactionally.
revoke all on function public.approve_provider_application(uuid) from public,anon,authenticated;
revoke all on function public.reject_provider_application(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_update_provider_verification(uuid,text,text) from public,anon,authenticated;
