update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'provider-assets';

create table if not exists public.provider_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint provider_portfolio_storage_path_owner
    check (split_part(storage_path, '/', 1) = provider_id::text)
);

alter table public.provider_portfolio_images enable row level security;
revoke all on public.provider_portfolio_images from public, anon, authenticated;
grant select on public.provider_portfolio_images to authenticated;

drop policy if exists "Customers view verified provider portfolio images" on public.provider_portfolio_images;
create policy "Customers view verified provider portfolio images"
on public.provider_portfolio_images for select to authenticated
using (
  exists (
    select 1
    from public.providers provider
    join public.profiles profile on profile.id = provider.id
    where provider.id = provider_portfolio_images.provider_id
      and provider.verification_status = 'verified'
      and profile.role = 'provider'
      and profile.is_active = true
  )
  or provider_id = (select auth.uid())
);

create or replace function public.get_provider_public_profile(p_provider_id uuid)
returns table (
  provider_id uuid,
  business_name text,
  bio text,
  profile_image_url text,
  rating_average numeric,
  total_reviews integer,
  verification_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select provider.id, provider.business_name, provider.bio,
         provider.profile_image_url, provider.rating_average,
         provider.total_reviews, provider.verification_status
  from public.providers provider
  join public.profiles profile on profile.id = provider.id
  where provider.id = p_provider_id
    and provider.verification_status = 'verified'
    and profile.role = 'provider'
    and profile.is_active = true
    and auth.uid() is not null;
$$;
revoke all on function public.get_provider_public_profile(uuid) from public, anon;
grant execute on function public.get_provider_public_profile(uuid) to authenticated;

create or replace function public.add_provider_portfolio_image(p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  current_provider uuid := auth.uid();
  image_id uuid;
begin
  if current_provider is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if nullif(p_storage_path, '') is null
     or split_part(p_storage_path, '/', 1) <> current_provider::text
     or p_storage_path ~ '(^|/)\.\.?(/|$)' then
    raise exception 'Invalid portfolio image path' using errcode = '22023';
  end if;

  perform 1 from public.providers where id = current_provider for update;
  if not found then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;
  if (select count(*) from public.provider_portfolio_images where provider_id = current_provider) >= 6 then
    raise exception 'A provider profile can include up to 6 work images' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'provider-assets' and name = p_storage_path
  ) then
    raise exception 'Upload the image before adding it to your profile' using errcode = '22023';
  end if;

  insert into public.provider_portfolio_images (provider_id, storage_path)
  values (current_provider, p_storage_path)
  returning id into image_id;
  return image_id;
end;
$$;
revoke all on function public.add_provider_portfolio_image(text) from public, anon;
grant execute on function public.add_provider_portfolio_image(text) to authenticated;

create or replace function public.remove_provider_portfolio_image(p_image_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_path text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  delete from public.provider_portfolio_images
  where id = p_image_id and provider_id = auth.uid()
  returning storage_path into removed_path;
  if removed_path is null then
    raise exception 'Portfolio image not found' using errcode = 'P0002';
  end if;
  return removed_path;
end;
$$;
revoke all on function public.remove_provider_portfolio_image(uuid) from public, anon;
grant execute on function public.remove_provider_portfolio_image(uuid) to authenticated;

drop policy if exists "Providers delete their own onboarding assets" on storage.objects;
create policy "Providers delete their own onboarding assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'provider-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
