alter table public.provider_applications
  add column if not exists owner_name text,
  add column if not exists profile_photo_url text,
  add column if not exists business_logo_url text,
  add column if not exists service_county text,
  add column if not exists working_hours jsonb,
  add column if not exists is_available boolean not null default true;

insert into storage.buckets (id, name, public)
values ('provider-assets', 'provider-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Providers upload their own onboarding assets" on storage.objects;
create policy "Providers upload their own onboarding assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'provider-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Providers update their own onboarding assets" on storage.objects;
create policy "Providers update their own onboarding assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'provider-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'provider-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

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
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_application_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_business_name), '') is null
     or nullif(trim(p_owner_name), '') is null
     or nullif(trim(p_phone), '') is null
     or coalesce(cardinality(p_service_category_ids), 0) = 0
     or coalesce(cardinality(p_areas), 0) = 0 then
    raise exception 'Business details, at least one service, and at least one area are required';
  end if;

  if exists (
    select 1 from public.provider_applications a
    where a.user_id = v_user_id and a.verification_status in ('pending', 'under_review')
  ) then
    raise exception 'You already have an application awaiting review';
  end if;

  if exists (
    select requested.id
    from unnest(p_service_category_ids) as requested(id)
    left join public.service_categories c on c.id = requested.id and c.is_active
    where c.id is null
  ) then
    raise exception 'One or more selected service categories are unavailable';
  end if;

  insert into public.provider_applications (
    user_id, business_name, owner_name, business_description, phone, whatsapp,
    profile_photo_url, business_logo_url, service_county, working_hours, is_available, verification_status
  ) values (
    v_user_id, trim(p_business_name), trim(p_owner_name), nullif(trim(p_business_description), ''), trim(p_phone), nullif(trim(p_whatsapp), ''),
    p_profile_photo_url, p_business_logo_url, nullif(trim(p_county), ''), coalesce(p_working_hours, '{}'::jsonb), coalesce(p_is_available, true), 'pending'
  ) returning id into v_application_id;

  insert into public.provider_application_services (application_id, service_category_id)
  select v_application_id, distinct_ids.id
  from (select distinct unnest(p_service_category_ids) as id) distinct_ids;

  insert into public.provider_application_areas (application_id, area_name)
  select v_application_id, trim(distinct_areas.name)
  from (select distinct unnest(p_areas) as name) distinct_areas
  where nullif(trim(distinct_areas.name), '') is not null;

  return v_application_id;
end;
$$;

revoke all on function public.submit_provider_application(text, text, text, text, text, text, text, uuid[], text[], text, jsonb, boolean) from public, anon;
grant execute on function public.submit_provider_application(text, text, text, text, text, text, text, uuid[], text[], text, jsonb, boolean) to authenticated;
