insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-request-photos', 'service-request-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.service_request_photos (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  primary key (request_id, storage_path)
);

alter table public.service_request_photos enable row level security;
revoke all on public.service_request_photos from public, anon, authenticated;
grant select on public.service_request_photos to authenticated;

drop policy if exists "Request participants view request photos" on public.service_request_photos;
create policy "Request participants view request photos"
on public.service_request_photos for select to authenticated
using (
  exists (
    select 1 from public.service_requests sr
    where sr.id = request_id and sr.customer_id = (select auth.uid())
  )
  or exists (
    select 1 from public.request_matches rm
    where rm.request_id = service_request_photos.request_id
      and rm.provider_id = (select auth.uid())
  )
);

create or replace function public.set_service_request_photos(
  p_request_id uuid,
  p_storage_paths text[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_paths text[] := coalesce(p_storage_paths, '{}'::text[]);
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if cardinality(v_paths) > 3 then
    raise exception 'A request can include up to 3 photos' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_requests
    where id = p_request_id and customer_id = v_user
  ) then
    raise exception 'Request not found or not owned by this customer' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_paths) as requested(path)
    where nullif(requested.path, '') is null
      or split_part(requested.path, '/', 1) <> v_user::text
      or requested.path ~ '(^|/)\.\.?(/|$)'
  ) then
    raise exception 'Invalid request photo path' using errcode = '22023';
  end if;

  delete from public.service_request_photos where request_id = p_request_id;
  insert into public.service_request_photos (request_id, storage_path)
  select p_request_id, requested.path
  from (select distinct unnest(v_paths) as path) requested;

  return true;
end;
$$;

revoke all on function public.set_service_request_photos(uuid, text[]) from public, anon;
grant execute on function public.set_service_request_photos(uuid, text[]) to authenticated;

drop policy if exists "Customers upload their own request photos" on storage.objects;
create policy "Customers upload their own request photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-request-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
);

drop policy if exists "Customers update their own request photos" on storage.objects;
create policy "Customers update their own request photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'service-request-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'service-request-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
);

drop policy if exists "Request participants view request photos" on storage.objects;
create policy "Request participants view request photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'service-request-photos'
  and exists (
    select 1 from public.service_request_photos photo
    where photo.storage_path = name
  )
);
