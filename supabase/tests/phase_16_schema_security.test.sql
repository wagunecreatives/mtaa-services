-- Phase 16 remote-safe schema/security assertions; catalog reads only.
\echo 1..13
select exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='jobs_request_id_key' and contype='u') as ok \gset
\if :ok
\echo ok 1 - one job per request is enforced
\else
\echo not ok 1 - one job per request is enforced
\endif
select exists(select 1 from pg_constraint where conrelid='public.provider_responses'::regclass and conname='provider_responses_request_id_provider_id_key' and contype='u') as ok \gset
\if :ok
\echo ok 2 - provider response is unique per request and provider
\else
\echo not ok 2 - provider response is unique per request and provider
\endif
select coalesce((select pg_get_constraintdef(oid) like '%assigned%' and pg_get_constraintdef(oid) like '%completed%' and pg_get_constraintdef(oid) like '%cancelled%' from pg_constraint where conrelid='public.jobs'::regclass and conname='jobs_status_check'),false) as ok \gset
\if :ok
\echo ok 3 - Phase 16 job statuses are present
\else
\echo not ok 3 - Phase 16 job statuses are present
\endif
select coalesce((select relrowsecurity from pg_class where oid='public.jobs'::regclass),false) as ok \gset
\if :ok
\echo ok 4 - jobs RLS is enabled
\else
\echo not ok 4 - jobs RLS is enabled
\endif
select exists(select 1 from pg_policies where schemaname='public' and tablename='jobs' and policyname='Customers and providers can view their jobs' and cmd='SELECT') as ok \gset
\if :ok
\echo ok 5 - customer/provider job read policy remains
\else
\echo not ok 5 - customer/provider job read policy remains
\endif
select not has_table_privilege('authenticated','public.jobs','INSERT') and not has_table_privilege('authenticated','public.jobs','UPDATE') and not has_table_privilege('authenticated','public.jobs','DELETE') as ok \gset
\if :ok
\echo ok 6 - authenticated clients cannot directly mutate jobs
\else
\echo not ok 6 - authenticated clients cannot directly mutate jobs
\endif
select not has_table_privilege('authenticated','public.provider_responses','INSERT') and not has_table_privilege('authenticated','public.provider_responses','UPDATE') and not has_table_privilege('authenticated','public.provider_responses','DELETE') as ok \gset
\if :ok
\echo ok 7 - provider responses remain RPC-write-only
\else
\echo not ok 7 - provider responses remain RPC-write-only
\endif
select not has_column_privilege('authenticated','public.service_requests','status','UPDATE') as ok \gset
\if :ok
\echo ok 8 - customers cannot directly update request status
\else
\echo not ok 8 - customers cannot directly update request status
\endif
select not has_column_privilege('authenticated','public.providers','rating_average','UPDATE') and not has_column_privilege('authenticated','public.providers','total_reviews','UPDATE') and not has_column_privilege('authenticated','public.providers','rating_average','INSERT') and not has_column_privilege('authenticated','public.providers','total_reviews','INSERT') as ok \gset
\if :ok
\echo ok 9 - provider aggregates remain protected
\else
\echo not ok 9 - provider aggregates remain protected
\endif
select exists(select 1 from pg_attribute where attrelid='public.notifications'::regclass and attname='recipient_id' and attnum>0 and not attisdropped) and exists(select 1 from pg_attribute where attrelid='public.notifications'::regclass and attname='event_type' and attnum>0 and not attisdropped) and exists(select 1 from pg_attribute where attrelid='public.notifications'::regclass and attname='event_key' and attnum>0 and not attisdropped) and to_regclass('public.notification_outbox') is not null as ok \gset
\if :ok
\echo ok 10 - Phase 15 notifications and outbox structures exist
\else
\echo not ok 10 - Phase 15 notifications and outbox structures exist
\endif
select has_function_privilege('authenticated','public.select_provider_response(uuid)','EXECUTE') and has_function_privilege('authenticated','public.advance_job(uuid,text)','EXECUTE') and has_function_privilege('authenticated','public.cancel_job(uuid,text)','EXECUTE') and has_function_privilege('authenticated','public.admin_update_provider_verification(uuid,text,text)','EXECUTE') as ok \gset
\if :ok
\echo ok 11 - Phase 16 workflow and admin RPC grants remain
\else
\echo not ok 11 - Phase 16 workflow and admin RPC grants remain
\endif
select not has_function_privilege('anon','public.select_provider_response(uuid)','EXECUTE') and not has_function_privilege('anon','public.advance_job(uuid,text)','EXECUTE') and not has_function_privilege('anon','public.admin_update_provider_verification(uuid,text,text)','EXECUTE') as ok \gset
\if :ok
\echo ok 12 - anonymous users cannot execute protected Phase 16 RPCs
\else
\echo not ok 12 - anonymous users cannot execute protected Phase 16 RPCs
\endif
select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jobs') as ok \gset
\if :ok
\echo ok 13 - jobs are in Realtime publication
\else
\echo not ok 13 - jobs are in Realtime publication
\endif
