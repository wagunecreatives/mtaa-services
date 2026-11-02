-- Secure inbox summaries and recipient-only read state for job conversations.

grant execute on function public.provider_is_email_verified_active(uuid) to authenticated;

drop policy if exists "Customers view verified provider portfolio images" on public.provider_portfolio_images;
create policy "Customers view verified provider portfolio images"
on public.provider_portfolio_images for select to authenticated
using (
  public.provider_is_email_verified_active(provider_id)
  or provider_id = (select auth.uid())
);

create or replace function public.get_service_message_threads(
  p_job_id uuid default null,
  p_limit integer default 50
)
returns table (
  job_id uuid,
  request_id uuid,
  job_status text,
  service_title text,
  counterpart_id uuid,
  counterpart_name text,
  last_message text,
  last_message_at timestamptz,
  last_message_from_me boolean,
  unread_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Thread limit must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  select
    job.id,
    job.request_id,
    job.status,
    coalesce(request.title, 'Service request'),
    case when job.customer_id = auth.uid() then job.provider_id else job.customer_id end,
    case when job.customer_id = auth.uid()
      then coalesce(provider.business_name, provider_account.full_name, 'Provider')
      else coalesce(customer.full_name, 'Customer')
    end,
    latest.body,
    latest.created_at,
    case when latest.id is null then null else latest.sender_id = auth.uid() end,
    (select count(*)::integer
     from public.service_messages unread
     where unread.job_id = job.id
       and unread.sender_id <> auth.uid()
       and unread.read_at is null)
  from public.jobs job
  left join public.service_requests request on request.id = job.request_id
  left join public.profiles customer on customer.id = job.customer_id
  left join public.providers provider on provider.id = job.provider_id
  left join public.profiles provider_account on provider_account.id = job.provider_id
  left join lateral (
    select message.id, message.body, message.created_at, message.sender_id
    from public.service_messages message
    where message.job_id = job.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  where auth.uid() in (job.customer_id, job.provider_id)
    and (
      job.id = p_job_id
      or (p_job_id is null and latest.id is not null)
    )
  order by latest.created_at desc nulls last, job.created_at desc
  limit case when p_job_id is null then p_limit else 1 end;
end;
$$;
revoke all on function public.get_service_message_threads(uuid, integer) from public, anon;
grant execute on function public.get_service_message_threads(uuid, integer) to authenticated;

create or replace function public.mark_service_messages_read(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.jobs job
    where job.id = p_job_id and auth.uid() in (job.customer_id, job.provider_id)
  ) then
    raise exception 'Service conversation not found or not accessible' using errcode = '42501';
  end if;

  update public.service_messages
  set read_at = now()
  where job_id = p_job_id
    and sender_id <> auth.uid()
    and read_at is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
revoke all on function public.mark_service_messages_read(uuid) from public, anon;
grant execute on function public.mark_service_messages_read(uuid) to authenticated;

create or replace function public.notify_new_service_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient uuid;
  request_uuid uuid;
  notification_id uuid;
  target_screen text;
begin
  select
    case
      when job.customer_id = new.sender_id then job.provider_id
      when job.provider_id = new.sender_id then job.customer_id
      else null
    end,
    job.request_id
  into recipient, request_uuid
  from public.jobs job
  where job.id = new.job_id;

  if recipient is null then
    raise exception 'Message sender is not a participant in this job' using errcode = '42501';
  end if;

  select case
    when profile.role = 'provider' or profile.account_type = 'provider'
      then '/(provider)/messages'
    else '/(customer)/messages'
  end
  into target_screen
  from public.profiles profile
  where profile.id = recipient;

  insert into public.notifications(
    recipient_id, event_type, request_id, event_key, title, body, data
  )
  values (
    recipient,
    'new_message',
    request_uuid,
    'new-message:' || new.id::text,
    'New message',
    'You received a message about your service job.',
    jsonb_build_object(
      'screen', target_screen,
      'requestId', request_uuid::text,
      'jobId', new.job_id::text
    )
  )
  on conflict(event_key) do nothing
  returning id into notification_id;

  if notification_id is not null then
    insert into public.notification_outbox(notification_id)
    values(notification_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_new_service_message() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'service_messages'
     ) then
    alter publication supabase_realtime add table public.service_messages;
  end if;
end;
$$;
