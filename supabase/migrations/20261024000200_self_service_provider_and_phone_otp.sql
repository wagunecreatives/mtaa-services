alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verification_required boolean not null default false;

create or replace function public.apply_signup_account_type()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare signup_type text;
begin
  signup_type := case
    when new.raw_user_meta_data ->> 'account_type' = 'provider' then 'provider'
    else 'customer'
  end;

  insert into public.profiles (
    id, full_name, role, account_type, phone_verified,
    phone_verification_required, onboarding_completed
  ) values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    signup_type,
    signup_type,
    false,
    true,
    signup_type = 'customer'
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    role = case when profiles.role in ('admin', 'super_admin') then profiles.role else excluded.role end,
    account_type = case when profiles.role in ('admin', 'super_admin') then profiles.account_type else excluded.account_type end,
    phone_verified = case when profiles.role in ('admin', 'super_admin') then profiles.phone_verified else false end,
    phone_verification_required = case when profiles.role in ('admin', 'super_admin') then profiles.phone_verification_required else true end,
    onboarding_completed = case when excluded.role = 'provider' then false else profiles.onboarding_completed end,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.apply_signup_account_type() from public, anon, authenticated;
drop trigger if exists zzzz_apply_signup_account_type on auth.users;
create trigger zzzz_apply_signup_account_type
  after insert on auth.users
  for each row execute function public.apply_signup_account_type();

update public.profiles profile
set role = 'provider',
    account_type = 'provider',
    onboarding_completed = false,
    updated_at = now()
from auth.users account
where account.id = profile.id
  and profile.role = 'customer'
  and account.raw_user_meta_data ->> 'account_type' = 'provider';

create or replace function public.complete_phone_verification()
returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare verified_phone text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select phone into verified_phone
  from auth.users
  where id = auth.uid() and phone_confirmed_at is not null;
  if verified_phone is null then
    raise exception 'Verify your phone with the SMS code before continuing' using errcode = '42501';
  end if;

  update public.profiles
  set phone = verified_phone,
      phone_verified = true,
      phone_verification_required = false,
      updated_at = now()
  where id = auth.uid();
  if not found then
    raise exception 'Account profile not found' using errcode = 'P0002';
  end if;

  update public.providers
  set phone = verified_phone,
      phone_verified = true,
      updated_at = now()
  where id = auth.uid();

  return true;
end;
$$;

revoke all on function public.complete_phone_verification() from public, anon;
grant execute on function public.complete_phone_verification() to authenticated;

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
returns uuid language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  current_user_id uuid := auth.uid();
  verified_phone text;
  v_application_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select phone into verified_phone
  from auth.users
  where id = current_user_id and phone_confirmed_at is not null;
  if verified_phone is null or not exists (
    select 1 from public.profiles
    where id = current_user_id and role = 'provider' and phone_verified = true
  ) then
    raise exception 'Verify your account phone before setting up provider services' using errcode = '42501';
  end if;
  if nullif(btrim(p_business_name), '') is null
     or nullif(btrim(p_owner_name), '') is null
     or coalesce(cardinality(p_service_category_ids), 0) = 0
     or not exists (
       select 1 from unnest(p_areas) as requested(area_name)
       where nullif(btrim(requested.area_name), '') is not null
     ) then
    raise exception 'Business details, at least one service, and at least one area are required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_service_category_ids) requested(id)
    left join public.service_categories category on category.id = requested.id and category.is_active
    where category.id is null
  ) then
    raise exception 'One or more selected service categories are unavailable' using errcode = '22023';
  end if;

  select id into v_application_id
  from public.provider_applications
  where user_id = current_user_id and verification_status in ('pending', 'under_review')
  order by created_at desc
  limit 1
  for update;

  if v_application_id is null then
    insert into public.provider_applications (
      user_id, business_name, owner_name, business_description, phone, whatsapp,
      profile_photo_url, business_logo_url, service_county, working_hours,
      is_available, verification_status, phone_verified, reviewed_at, updated_at
    ) values (
      current_user_id, btrim(p_business_name), btrim(p_owner_name),
      nullif(btrim(p_business_description), ''), verified_phone,
      nullif(btrim(p_whatsapp), ''), p_profile_photo_url, p_business_logo_url,
      nullif(btrim(p_county), ''), coalesce(p_working_hours, '{}'::jsonb),
      coalesce(p_is_available, true), 'approved', true, now(), now()
    ) returning id into v_application_id;
  else
    update public.provider_applications
    set business_name = btrim(p_business_name),
        owner_name = btrim(p_owner_name),
        business_description = nullif(btrim(p_business_description), ''),
        phone = verified_phone,
        whatsapp = nullif(btrim(p_whatsapp), ''),
        profile_photo_url = p_profile_photo_url,
        business_logo_url = p_business_logo_url,
        service_county = nullif(btrim(p_county), ''),
        working_hours = coalesce(p_working_hours, '{}'::jsonb),
        is_available = coalesce(p_is_available, true),
        verification_status = 'approved',
        phone_verified = true,
        reviewed_at = now(),
        updated_at = now()
    where id = v_application_id;
    delete from public.provider_application_services existing_service
      where existing_service.application_id = v_application_id;
    delete from public.provider_application_areas existing_area
      where existing_area.application_id = v_application_id;
  end if;

  insert into public.providers (
    id, business_name, bio, phone, whatsapp_number, profile_image_url,
    owner_name, business_logo_url, working_hours, phone_verified,
    verification_status, is_available, is_online, updated_at
  ) values (
    current_user_id, btrim(p_business_name), nullif(btrim(p_business_description), ''),
    verified_phone, nullif(btrim(p_whatsapp), ''), p_profile_photo_url,
    btrim(p_owner_name), p_business_logo_url, coalesce(p_working_hours, '{}'::jsonb),
    true, 'verified', coalesce(p_is_available, true), false, now()
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
    phone_verified = true,
    verification_status = case
      when providers.verification_status in ('suspended', 'rejected') then providers.verification_status
      else 'verified'
    end,
    is_available = excluded.is_available,
    updated_at = now();

  update public.profiles
  set role = 'provider',
      account_type = 'provider',
      phone = verified_phone,
      phone_verified = true,
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
    where existing.provider_id = current_user_id and existing.category_id = requested.id
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
