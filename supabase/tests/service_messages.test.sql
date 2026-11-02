-- Catalog-only assertions for participant-safe job messaging.
\echo 1..8

select exists(select 1 from pg_class where oid='public.service_messages'::regclass and relrowsecurity) as ok \gset
\if :ok
\echo ok 1 - service message row-level security is enabled
\else
\echo not ok 1 - service message row-level security is enabled
\endif

select exists(select 1 from pg_policies where schemaname='public' and tablename='service_messages'
  and policyname='Job participants can view messages' and cmd='SELECT') as ok \gset
\if :ok
\echo ok 2 - only job participants can read messages
\else
\echo not ok 2 - only job participants can read messages
\endif

select exists(select 1 from pg_policies where schemaname='public' and tablename='service_messages'
  and policyname='Participants can send job messages' and cmd='INSERT') as ok \gset
\if :ok
\echo ok 3 - message inserts require the authenticated participant as sender
\else
\echo not ok 3 - message inserts require the authenticated participant as sender
\endif

select has_function_privilege('authenticated','public.get_service_message_threads(uuid,integer)','EXECUTE')
  and not has_function_privilege('anon','public.get_service_message_threads(uuid,integer)','EXECUTE') as ok \gset
\if :ok
\echo ok 4 - only authenticated users can call the inbox RPC
\else
\echo not ok 4 - only authenticated users can call the inbox RPC
\endif

select coalesce(pg_get_functiondef('public.get_service_message_threads(uuid,integer)'::regprocedure)
  like '%auth.uid() in (job.customer_id, job.provider_id)%'
  and pg_get_functiondef('public.get_service_message_threads(uuid,integer)'::regprocedure)
  like '%unread.read_at is null%',false) as ok \gset
\if :ok
\echo ok 5 - inbox threads are participant-scoped and count unread messages
\else
\echo not ok 5 - inbox threads are participant-scoped and count unread messages
\endif

select has_function_privilege('authenticated','public.mark_service_messages_read(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.mark_service_messages_read(uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 6 - only authenticated users can mark messages read
\else
\echo not ok 6 - only authenticated users can mark messages read
\endif

select coalesce(pg_get_functiondef('public.mark_service_messages_read(uuid)'::regprocedure)
  like '%sender_id <> auth.uid()%' and pg_get_functiondef('public.mark_service_messages_read(uuid)'::regprocedure)
  like '%job.customer_id, job.provider_id%',false) as ok \gset
\if :ok
\echo ok 7 - read state can only be updated by the other job participant
\else
\echo not ok 7 - read state can only be updated by the other job participant
\endif

select exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename='service_messages') as ok \gset
\if :ok
\echo ok 8 - messages are included in Supabase Realtime
\else
\echo not ok 8 - messages are included in Supabase Realtime
\endif
