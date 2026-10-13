-- Phase 15: per-user notification history, preferences and push outbox.
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  match_alerts_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists idx_device_push_tokens_user on public.device_push_tokens(user_id) where is_active;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('provider_match','request_status','legacy')),
  -- Nullable to retain legacy notifications that were not tied to a request.
  request_id uuid references public.service_requests(id) on delete cascade,
  match_id uuid references public.request_matches(id) on delete cascade,
  event_key text not null unique,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The live project has a legacy notifications table (user_id/type/is_read) with
-- existing rows. Upgrade it in place so history and IDs survive. New app
-- notifications use recipient_id/event_type/read_at; old alias columns remain
-- nullable for compatibility with older clients.
alter table public.notifications add column if not exists recipient_id uuid;
alter table public.notifications add column if not exists event_type text;
alter table public.notifications add column if not exists request_id uuid;
alter table public.notifications add column if not exists match_id uuid;
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists data jsonb default '{}'::jsonb;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='user_id') then
    execute $q$
      update public.notifications
      set recipient_id=coalesce(recipient_id, user_id),
          event_type=coalesce(event_type, case
            when type in ('provider_match','request_status') then type
            else 'legacy' end),
          event_key=coalesce(event_key, 'legacy:' || id::text),
          read_at=coalesce(read_at, case when is_read then created_at else null end),
          data=coalesce(data, '{}'::jsonb)
      where recipient_id is null or event_type is null or event_key is null or data is null
         or (is_read and read_at is null)
    $q$;
    alter table public.notifications alter column user_id drop not null;
  else
    update public.notifications
    set event_type=coalesce(event_type,'legacy'),
        event_key=coalesce(event_key,'legacy:' || id::text),
        data=coalesce(data,'{}'::jsonb)
    where event_type is null or event_key is null or data is null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='type') then
    alter table public.notifications alter column type drop not null;
  end if;

  alter table public.notifications alter column recipient_id set not null;
  alter table public.notifications alter column event_type set not null;
  alter table public.notifications alter column event_key set not null;
  alter table public.notifications alter column data set default '{}'::jsonb;
  alter table public.notifications alter column data set not null;

  if not exists (select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_recipient_id_fkey') then
    alter table public.notifications add constraint notifications_recipient_id_fkey
      foreign key (recipient_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_request_id_fkey') then
    alter table public.notifications add constraint notifications_request_id_fkey
      foreign key (request_id) references public.service_requests(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_match_id_fkey') then
    alter table public.notifications add constraint notifications_match_id_fkey
      foreign key (match_id) references public.request_matches(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_event_key_key') then
    alter table public.notifications add constraint notifications_event_key_key unique (event_key);
  end if;
  alter table public.notifications drop constraint if exists notifications_event_type_check;
  alter table public.notifications add constraint notifications_event_type_check
    check (event_type in ('provider_match','request_status','legacy'));
end $$;

create or replace function public.sync_legacy_notification_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare row_json jsonb;
begin
  row_json := to_jsonb(new);
  -- jsonb_populate_record ignores fields absent from the installed table, so
  -- this works for both the fresh and upgraded notification schemas.
  if row_json ? 'recipient_id' then
    row_json := jsonb_set(row_json, '{recipient_id}', coalesce(row_json->'recipient_id', row_json->'user_id'), true);
  end if;
  if row_json ? 'user_id' then
    row_json := jsonb_set(row_json, '{user_id}', coalesce(row_json->'user_id', row_json->'recipient_id'), true);
  end if;
  if row_json ? 'event_type' and row_json->>'event_type' is null then
    if row_json->>'type' in ('provider_match','request_status','provider_response','job_assigned','job_status') then
      row_json := jsonb_set(row_json, '{event_type}', row_json->'type', true);
    else
      row_json := jsonb_set(row_json, '{event_type}', '"legacy"'::jsonb, true);
    end if;
  end if;
  if row_json ? 'type' then
    row_json := jsonb_set(row_json, '{type}', coalesce(row_json->'type', row_json->'event_type'), true);
  end if;
  if row_json ? 'event_key' and row_json->>'event_key' is null then
    row_json := jsonb_set(row_json, '{event_key}', to_jsonb('legacy:' || coalesce(row_json->>'id', gen_random_uuid()::text)), true);
  end if;
  if row_json ? 'is_read' and row_json->>'read_at' is not null then
    row_json := jsonb_set(row_json, '{is_read}', 'true'::jsonb, true);
  elsif row_json ? 'is_read' and row_json->>'is_read' = 'true' and row_json->>'read_at' is null then
    row_json := jsonb_set(row_json, '{read_at}', to_jsonb(now()), true);
  end if;
  return jsonb_populate_record(new, row_json);
end; $$;
revoke all on function public.sync_legacy_notification_columns() from public, anon, authenticated;
drop trigger if exists sync_legacy_notification_columns on public.notifications;
create trigger sync_legacy_notification_columns before insert or update on public.notifications
for each row execute function public.sync_legacy_notification_columns();

create index if not exists idx_notifications_recipient_created on public.notifications(recipient_id, created_at desc);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated;

alter table public.notification_preferences enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences" on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own push tokens" on public.device_push_tokens;
drop policy if exists "Users view own push tokens" on public.device_push_tokens;
create policy "Users view own push tokens" on public.device_push_tokens for select to authenticated using (user_id = auth.uid());
do $$ declare existing_policy record; begin
  for existing_policy in
    select policyname from pg_policies where schemaname='public' and tablename='notifications'
  loop
    execute format('drop policy %I on public.notifications', existing_policy.policyname);
  end loop;
end $$;
create policy "Users view own notifications" on public.notifications for select to authenticated using (recipient_id = auth.uid());
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select on public.device_push_tokens to authenticated;

create or replace function public.register_device_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_platform not in ('ios','android') or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid push token or platform' using errcode='22023';
  end if;
  insert into public.device_push_tokens(user_id,expo_push_token,platform,is_active,updated_at)
  values(auth.uid(),p_token,p_platform,true,now())
  on conflict(expo_push_token) do update set user_id=excluded.user_id, platform=excluded.platform, is_active=true, updated_at=now();
end; $$;
revoke all on function public.register_device_push_token(text,text) from public, anon;
grant execute on function public.register_device_push_token(text,text) to authenticated;

create or replace function public.unregister_device_push_token(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  delete from public.device_push_tokens where user_id=auth.uid() and expo_push_token=p_token;
end; $$;
revoke all on function public.unregister_device_push_token(text) from public, anon;
grant execute on function public.unregister_device_push_token(text) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare changed_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = auth.uid();
  get diagnostics changed_count = row_count;
  return changed_count > 0;
end; $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.claim_notification_outbox(p_outbox_id uuid)
returns table(notification_id uuid, claimed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query update public.notification_outbox o
  set status='processing', attempts=o.attempts+1, last_error=null
  where o.id=p_outbox_id and o.status in ('pending','failed') and o.attempts < 5
  returning o.notification_id, true;
end; $$;
revoke all on function public.claim_notification_outbox(uuid) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(uuid) to service_role;

-- A notification and outbox item are created in the same transaction as its match.
create or replace function public.enqueue_provider_match_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.service_requests%rowtype; category_name text; n_id uuid;
begin
  select * into r from public.service_requests where id = new.request_id;
  if not found then return new; end if;
  -- In-app notification is always recorded; preferences are checked by the push worker.
  select sc.name into category_name from public.service_categories sc where sc.id = r.category_id;
  insert into public.notifications(recipient_id,event_type,request_id,match_id,event_key,title,body,data)
  values (new.provider_id,'provider_match',new.request_id,new.id,'match:'||new.id::text,
    'New service request',
    coalesce(category_name,'Service') || ' request in ' || coalesce(nullif(r.area_name,''),'your service area') || ' (' || coalesce(nullif(r.urgency,''),'standard') || ')',
    jsonb_build_object('screen','/(provider)/leads','requestId',new.request_id::text))
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end; $$;
revoke all on function public.enqueue_provider_match_notification() from public, anon, authenticated;
drop trigger if exists request_matches_notification_after_insert on public.request_matches;
create trigger request_matches_notification_after_insert after insert on public.request_matches
for each row execute function public.enqueue_provider_match_notification();

create or replace function public.enqueue_request_status_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n_id uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  insert into public.notifications(recipient_id,event_type,request_id,event_key,title,body,data)
  values (new.customer_id,'request_status',new.id,'request-status:'||new.id::text||':'||new.status,
    'Request update','Your service request is now '||replace(new.status,'_',' '),
    jsonb_build_object('screen','/(customer)/requests','requestId',new.id::text))
  on conflict(event_key) do nothing returning id into n_id;
  if n_id is not null then insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing; end if;
  return new;
end; $$;
revoke all on function public.enqueue_request_status_notification() from public, anon, authenticated;
drop trigger if exists service_request_status_notification_after_update on public.service_requests;
create trigger service_request_status_notification_after_update after update of status on public.service_requests
for each row execute function public.enqueue_request_status_notification();

-- Narrow RPC keeps customer contact details out of provider lead queries.
create or replace function public.get_provider_leads()
returns table(request_id uuid, category_name text, area_name text, county text, urgency text, title text, description text, match_status text, match_rank integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='provider' and p.is_active=true) then
    raise exception 'Active provider required' using errcode='42501';
  end if;
  return query select sr.id, sc.name, sr.area_name, sr.county, sr.urgency, sr.title, sr.description, rm.status, rm.match_rank, sr.created_at
  from public.request_matches rm join public.service_requests sr on sr.id=rm.request_id
  join public.service_categories sc on sc.id=sr.category_id where rm.provider_id=auth.uid()
  order by rm.match_rank nulls last, sr.created_at desc;
end; $$;
revoke all on function public.get_provider_leads() from public, anon;
grant execute on function public.get_provider_leads() to authenticated;

grant select on public.notifications to service_role;
grant select on public.notification_preferences to service_role;
grant select, update on public.device_push_tokens to service_role;
grant select, update on public.notification_outbox to service_role;

-- Realtime is scoped by each table's RLS policies.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.service_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
