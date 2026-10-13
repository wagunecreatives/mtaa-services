-- Linked-safe schema/security assertions. No fixtures or database writes are made.
-- Data-dependent customer/provider and concurrent-session scenarios still need
-- provisioned auth fixtures; this suite does not claim those scenarios pass.
\echo 1..34

select coalesce((select pg_get_constraintdef(oid) like '%awaiting_confirmation%' and pg_get_constraintdef(oid) like '%completed%' from pg_constraint where conrelid='public.jobs'::regclass and conname='jobs_status_check'),false) as ok \gset
\if :ok
\echo ok 1 - jobs accepts awaiting confirmation and completed states
\else
\echo not ok 1 - jobs accepts awaiting confirmation and completed states
\endif
select exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='jobs_request_id_key' and contype='u') as ok \gset
\if :ok
\echo ok 2 - one job per request remains enforced
\else
\echo not ok 2 - one job per request remains enforced
\endif
select exists(select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_job_id_key' and contype='u') as ok \gset
\if :ok
\echo ok 3 - one review per job is enforced
\else
\echo not ok 3 - one review per job is enforced
\endif
select coalesce((select pg_get_constraintdef(oid) like '%rating >= 1%' and pg_get_constraintdef(oid) like '%rating <= 5%' from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_rating_check'),false) as ok \gset
\if :ok
\echo ok 4 - database rating constraint permits only 1 through 5
\else
\echo not ok 4 - database rating constraint permits only 1 through 5
\endif
select exists(select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_customer_id_fkey' and contype='f') as ok \gset
\if :ok
\echo ok 5 - review customer foreign key exists
\else
\echo not ok 5 - review customer foreign key exists
\endif
select exists(select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_provider_id_fkey' and contype='f') as ok \gset
\if :ok
\echo ok 6 - review provider foreign key exists
\else
\echo not ok 6 - review provider foreign key exists
\endif
select exists(select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_job_id_fkey' and contype='f') as ok \gset
\if :ok
\echo ok 7 - review job foreign key exists
\else
\echo not ok 7 - review job foreign key exists
\endif
select exists(select 1 from pg_attribute where attrelid='public.reviews'::regclass and attname='review_text' and attnum>0 and not attisdropped) as ok \gset
\if :ok
\echo ok 8 - Phase 17 review text API field exists
\else
\echo not ok 8 - Phase 17 review text API field exists
\endif
select coalesce((select relrowsecurity from pg_class where oid='public.reviews'::regclass),false) as ok \gset
\if :ok
\echo ok 9 - reviews RLS is enabled
\else
\echo not ok 9 - reviews RLS is enabled
\endif
select exists(select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='Review participants and admins can view reviews' and cmd='SELECT') as ok \gset
\if :ok
\echo ok 10 - participant and admin review read policy exists
\else
\echo not ok 10 - participant and admin review read policy exists
\endif
select not exists(select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname in ('Users can view visible reviews','Customers can create reviews for their jobs')) as ok \gset
\if :ok
\echo ok 11 - legacy broad review policies are removed
\else
\echo not ok 11 - legacy broad review policies are removed
\endif
select not has_table_privilege('authenticated','public.reviews','INSERT') as ok \gset
\if :ok
\echo ok 12 - authenticated clients cannot insert reviews directly
\else
\echo not ok 12 - authenticated clients cannot insert reviews directly
\endif
select not has_table_privilege('authenticated','public.reviews','UPDATE') and not has_table_privilege('authenticated','public.reviews','DELETE') as ok \gset
\if :ok
\echo ok 13 - authenticated clients cannot update or delete reviews directly
\else
\echo not ok 13 - authenticated clients cannot update or delete reviews directly
\endif
select not has_table_privilege('anon','public.reviews','SELECT') and not has_table_privilege('anon','public.reviews','INSERT') and not has_table_privilege('anon','public.reviews','UPDATE') and not has_table_privilege('anon','public.reviews','DELETE') as ok \gset
\if :ok
\echo ok 14 - anonymous clients have no review table privileges
\else
\echo not ok 14 - anonymous clients have no review table privileges
\endif
select not has_column_privilege('authenticated','public.providers','rating_average','UPDATE') and not has_column_privilege('authenticated','public.providers','total_reviews','UPDATE') as ok \gset
\if :ok
\echo ok 15 - authenticated clients cannot update provider aggregates
\else
\echo not ok 15 - authenticated clients cannot update provider aggregates
\endif
select not has_column_privilege('authenticated','public.providers','rating_average','INSERT') and not has_column_privilege('authenticated','public.providers','total_reviews','INSERT') as ok \gset
\if :ok
\echo ok 16 - authenticated clients cannot set provider aggregates on insert
\else
\echo not ok 16 - authenticated clients cannot set provider aggregates on insert
\endif
select has_function_privilege('authenticated','public.confirm_job_completion(uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 17 - authenticated users can call completion confirmation RPC
\else
\echo not ok 17 - authenticated users can call completion confirmation RPC
\endif
select not has_function_privilege('anon','public.confirm_job_completion(uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 18 - anonymous users cannot call completion confirmation RPC
\else
\echo not ok 18 - anonymous users cannot call completion confirmation RPC
\endif
select has_function_privilege('authenticated','public.submit_job_review(uuid,integer,text)','EXECUTE') as ok \gset
\if :ok
\echo ok 19 - authenticated users can call review submission RPC
\else
\echo not ok 19 - authenticated users can call review submission RPC
\endif
select not has_function_privilege('anon','public.submit_job_review(uuid,integer,text)','EXECUTE') as ok \gset
\if :ok
\echo ok 20 - anonymous users cannot call review submission RPC
\else
\echo not ok 20 - anonymous users cannot call review submission RPC
\endif
select coalesce(pg_get_functiondef('public.advance_job(uuid,text)'::regprocedure) like '%awaiting_confirmation%',false) as ok \gset
\if :ok
\echo ok 21 - provider advancement includes awaiting confirmation
\else
\echo not ok 21 - provider advancement includes awaiting confirmation
\endif
select coalesce(pg_get_functiondef('public.confirm_job_completion(uuid)'::regprocedure) like '%for update%',false) as ok \gset
\if :ok
\echo ok 22 - completion confirmation locks its job row
\else
\echo not ok 22 - completion confirmation locks its job row
\endif
select coalesce(pg_get_functiondef('public.confirm_job_completion(uuid)'::regprocedure) like '%customer_id%' and pg_get_functiondef('public.confirm_job_completion(uuid)'::regprocedure) like '%service_requests%' and pg_get_functiondef('public.confirm_job_completion(uuid)'::regprocedure) like '%completed_at%',false) as ok \gset
\if :ok
\echo ok 23 - confirmation checks customer ownership and updates completion fields
\else
\echo not ok 23 - confirmation checks customer ownership and updates completion fields
\endif
select coalesce(pg_get_functiondef('public.submit_job_review(uuid,integer,text)'::regprocedure) like '%customer_id%' and pg_get_functiondef('public.submit_job_review(uuid,integer,text)'::regprocedure) like '%completed%' and pg_get_functiondef('public.submit_job_review(uuid,integer,text)'::regprocedure) like '%unique_violation%',false) as ok \gset
\if :ok
\echo ok 24 - submission RPC enforces ownership, completed state and duplicate handling
\else
\echo not ok 24 - submission RPC enforces ownership, completed state and duplicate handling
\endif
select exists(select 1 from pg_trigger where tgrelid='public.reviews'::regclass and tgname='reviews_refresh_provider_aggregate' and not tgisinternal) as ok \gset
\if :ok
\echo ok 25 - aggregate trigger is installed
\else
\echo not ok 25 - aggregate trigger is installed
\endif
select coalesce(pg_get_functiondef('public.refresh_provider_review_aggregate()'::regprocedure) like '%avg(%' and pg_get_functiondef('public.refresh_provider_review_aggregate()'::regprocedure) like '%count(%' and pg_get_functiondef('public.refresh_provider_review_aggregate()'::regprocedure) like '%for update%',false) as ok \gset
\if :ok
\echo ok 26 - aggregate is recalculated from reviews under provider row lock
\else
\echo not ok 26 - aggregate is recalculated from reviews under provider row lock
\endif
select exists(select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_event_type_check' and pg_get_constraintdef(oid) like '%job_completion_confirmation%' and pg_get_constraintdef(oid) like '%review_received%') as ok \gset
\if :ok
\echo ok 27 - notification event constraint includes Phase 17 events
\else
\echo not ok 27 - notification event constraint includes Phase 17 events
\endif
select exists(select 1 from pg_trigger where tgrelid='public.reviews'::regclass and tgname='reviews_notify_provider' and not tgisinternal) as ok \gset
\if :ok
\echo ok 28 - review notification trigger is installed
\else
\echo not ok 28 - review notification trigger is installed
\endif
select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reviews') as ok \gset
\if :ok
\echo ok 29 - reviews are in the Realtime publication
\else
\echo not ok 29 - reviews are in the Realtime publication
\endif
select has_function_privilege('authenticated','public.match_service_request(uuid)','EXECUTE') and has_function_privilege('authenticated','public.select_provider_response(uuid)','EXECUTE') and has_function_privilege('authenticated','public.cancel_job(uuid,text)','EXECUTE') as ok \gset
\if :ok
\echo ok 30 - Phase 14 matching and Phase 16 selection/cancellation RPC grants remain
\else
\echo not ok 30 - Phase 14 matching and Phase 16 selection/cancellation RPC grants remain
\endif
select coalesce(pg_get_functiondef('public.get_admin_jobs(text)'::regprocedure) like '%awaiting_confirmation%',false) as ok \gset
\if :ok
\echo ok 31 - admin jobs filter accepts awaiting confirmation
\else
\echo not ok 31 - admin jobs filter accepts awaiting confirmation
\endif
select exists(select 1 from pg_attribute where attrelid='public.reviews'::regclass and attname='comment' and attnum>0 and not attisdropped) and exists(select 1 from pg_attribute where attrelid='public.reviews'::regclass and attname='is_visible' and attnum>0 and not attisdropped) as ok \gset
\if :ok
\echo ok 32 - legacy review comment and moderation fields are preserved
\else
\echo not ok 32 - legacy review comment and moderation fields are preserved
\endif
select coalesce(pg_get_functiondef('public.notify_job_change()'::regprocedure) like '%notification_outbox%' and pg_get_functiondef('public.notify_job_change()'::regprocedure) like '%job_completion_confirmation%' and pg_get_functiondef('public.notify_job_change()'::regprocedure) like '%exception when others%',false) and coalesce(pg_get_functiondef('public.notify_review_received()'::regprocedure) like '%notification_outbox%' and pg_get_functiondef('public.notify_review_received()'::regprocedure) like '%review_received%' and pg_get_functiondef('public.notify_review_received()'::regprocedure) like '%exception when others%',false) as ok \gset
\if :ok
\echo ok 33 - completion and review notices use best-effort notification outbox events
\else
\echo not ok 33 - completion and review notices use best-effort notification outbox events
\endif
select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jobs') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_requests') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reviews') as ok \gset
\if :ok
\echo ok 34 - Phase 15/16 Realtime tables and reviews remain published
\else
\echo not ok 34 - Phase 15/16 Realtime tables and reviews remain published
\endif
