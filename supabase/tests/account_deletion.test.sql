\echo 1..8
select coalesce((select relrowsecurity from pg_class where oid='public.account_deletion_requests'::regclass),false) as ok \gset
\if :ok
\echo ok 1 - account deletion requests have row-level security enabled
\else
\echo not ok 1 - account deletion requests have row-level security enabled
\endif
select not has_table_privilege('anon','public.account_deletion_requests','SELECT')
  and not has_table_privilege('authenticated','public.account_deletion_requests','SELECT') as ok \gset
\if :ok
\echo ok 2 - clients cannot read account deletion requests
\else
\echo not ok 2 - clients cannot read account deletion requests
\endif
select has_function_privilege('service_role','public.start_account_deletion_request(uuid,text,timestamptz)','EXECUTE')
  and has_function_privilege('service_role','public.claim_account_deletion_request(text)','EXECUTE')
  and has_function_privilege('service_role','public.delete_user_account(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.validate_account_deletion(uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 3 - deletion workflow RPCs are available to service_role
\else
\echo not ok 3 - deletion workflow RPCs are available to service_role
\endif
select not has_function_privilege('anon','public.delete_user_account(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.delete_user_account(uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 4 - clients cannot directly delete auth accounts
\else
\echo not ok 4 - clients cannot directly delete auth accounts
\endif
select exists(
  select 1 from pg_trigger
  where tgrelid='auth.users'::regclass
    and tgname='anonymize_account_data_before_delete'
    and tgenabled <> 'D'
) as ok \gset
\if :ok
\echo ok 5 - auth deletion runs the anonymization trigger
\else
\echo not ok 5 - auth deletion runs the anonymization trigger
\endif
select count(*)=2 as ok from pg_constraint
  where conrelid='public.reviews'::regclass
    and conname in ('reviews_customer_id_fkey','reviews_provider_id_fkey')
    and confdeltype='n' \gset
\if :ok
\echo ok 6 - reviews retain only anonymized participant references
\else
\echo not ok 6 - reviews retain only anonymized participant references
\endif
select exists(
  select 1 from pg_constraint
  where conrelid='public.account_deletion_requests'::regclass
    and conname='account_deletion_requests_user_id_fkey'
    and confdeltype='c'
) as ok \gset
\if :ok
\echo ok 7 - deletion request tokens are removed with their account
\else
\echo not ok 7 - deletion request tokens are removed with their account
\endif
select count(*)=2 as ok from pg_constraint
  where conrelid in ('public.user_reports'::regclass,'public.job_disputes'::regclass)
    and conname in ('user_reports_reporter_id_fkey','job_disputes_raised_by_fkey')
    and confdeltype='n' \gset
\if :ok
\echo ok 8 - reports and disputes retain only anonymized actor references
\else
\echo not ok 8 - reports and disputes retain only anonymized actor references
\endif
