-- Phase 33: allow verified providers to create unpaid test featured listings.
alter table public.featured_listings
  add column if not exists is_test boolean not null default false;

create or replace function public.get_provider_featured_listing_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'provider' and is_active
  ) then
    raise exception 'Active provider account required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', category.id, 'name', category.name) order by category.sort_order, category.name)
      from public.provider_services service
      join public.service_categories category on category.id = service.category_id
      where service.provider_id = auth.uid() and service.is_active and category.is_active
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('area_name', area.area_name, 'county', area.county) order by area.is_primary desc, area.county, area.area_name)
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
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    join public.providers provider on provider.id = profile.id
    where profile.id = auth.uid()
      and profile.role = 'provider'
      and profile.is_active
      and provider.verification_status = 'verified'
      and provider.phone_verified
  ) then
    raise exception 'Active, verified provider account required' using errcode = '42501';
  end if;
  if p_duration_days is null or p_duration_days not between 1 and 365
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

  insert into public.featured_listings(
    provider_id, category_id, area_name, duration_days, status, starts_at, ends_at, is_test
  )
  values (
    auth.uid(), p_category_id, btrim(p_area_name), p_duration_days,
    'active', now(), now() + make_interval(days => p_duration_days), true
  )
  returning id into listing_uuid;

  return listing_uuid;
end;
$$;
revoke all on function public.create_test_featured_listing(uuid, text, integer) from public, anon;
grant execute on function public.create_test_featured_listing(uuid, text, integer) to authenticated;

create or replace function public.get_active_featured_providers(
  p_category_id uuid default null,
  p_area_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
      'is_test', listing.is_test
    ) order by provider.rating_average desc nulls last, listing.created_at desc)
    from public.featured_listings listing
    join public.providers provider on provider.id = listing.provider_id
    join public.profiles profile on profile.id = provider.id
    join public.service_categories category on category.id = listing.category_id
    where listing.status = 'active'
      and listing.starts_at <= now()
      and listing.ends_at > now()
      and profile.is_active
      and provider.verification_status = 'verified'
      and (p_category_id is null or listing.category_id = p_category_id)
      and (p_area_name is null or lower(listing.area_name) = lower(btrim(p_area_name)))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_active_featured_providers(uuid, text) from public, anon;
grant execute on function public.get_active_featured_providers(uuid, text) to authenticated;

create or replace function public.admin_list_featured_listings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', listing.id,
      'provider_id', listing.provider_id,
      'business_name', provider.business_name,
      'category_id', listing.category_id,
      'category', category.name,
      'area_name', listing.area_name,
      'duration_days', listing.duration_days,
      'status', listing.status,
      'start_date', listing.starts_at,
      'end_date', listing.ends_at,
      'is_test', listing.is_test,
      'payment_status', payment.status,
      'payment_amount_kes', payment.amount_kes,
      'payment_reference', payment.payment_reference
    ) order by listing.created_at desc)
    from public.featured_listings listing
    join public.providers provider on provider.id = listing.provider_id
    join public.service_categories category on category.id = listing.category_id
    left join public.monetization_payments payment on payment.featured_listing_id = listing.id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_featured_listings() from public, anon;
grant execute on function public.admin_list_featured_listings() to authenticated;
