-- Offline request idempotency schema/security assertions.
-- Run with psql after applying the migration. These checks do not create requests.
\echo 1..10

select to_regclass('public.service_request_idempotency') is not null as ok \gset
\if :ok
\echo ok 1 - idempotency mapping table exists
\else
\echo not ok 1 - idempotency mapping table exists
\endif

select coalesce((select relrowsecurity from pg_class where oid='public.service_request_idempotency'::regclass),false) as ok \gset
\if :ok
\echo ok 2 - idempotency table has row-level security enabled
\else
\echo not ok 2 - idempotency table has row-level security enabled
\endif

select not has_table_privilege('authenticated','public.service_request_idempotency','SELECT')
  and not has_table_privilege('authenticated','public.service_request_idempotency','INSERT')
  and not has_table_privilege('anon','public.service_request_idempotency','SELECT')
  as ok \gset
\if :ok
\echo ok 3 - client roles cannot access idempotency mappings directly
\else
\echo not ok 3 - client roles cannot access idempotency mappings directly
\endif

select has_function_privilege('authenticated','public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 4 - authenticated role can call the idempotent request RPC
\else
\echo not ok 4 - authenticated role can call the idempotent request RPC
\endif

select not has_function_privilege('anon','public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)','EXECUTE') as ok \gset
\if :ok
\echo ok 5 - anonymous role cannot call the request RPC
\else
\echo not ok 5 - anonymous role cannot call the request RPC
\endif

select exists(select 1 from pg_constraint where conrelid='public.service_request_idempotency'::regclass
  and conname='service_request_idempotency_pkey' and contype='p') as ok \gset
\if :ok
\echo ok 6 - client request IDs are unique per customer
\else
\echo not ok 6 - client request IDs are unique per customer
\endif

select exists(select 1 from pg_constraint where conrelid='public.service_request_idempotency'::regclass
  and conname='service_request_idempotency_service_request_id_key' and contype='u') as ok \gset
\if :ok
\echo ok 7 - one idempotency mapping per service request
\else
\echo not ok 7 - one idempotency mapping per service request
\endif

select coalesce(
  pg_get_functiondef('public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)'::regprocedure)
    like '%client_request_id%'
    and pg_get_functiondef('public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)'::regprocedure)
    like '%return v_request_id%',
  false
) as ok \gset
\if :ok
\echo ok 8 - request RPC returns the original UUID for a repeated key
\else
\echo not ok 8 - request RPC returns the original UUID for a repeated key
\endif

select coalesce(
  pg_get_functiondef('public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)'::regprocedure)
    like '%when ''now'' then ''emergency''%'
    and pg_get_functiondef('public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)'::regprocedure)
    like '%when ''today'' then ''urgent''%'
    and pg_get_functiondef('public.create_service_request(uuid,text,double precision,double precision,text,text,text,text,uuid)'::regprocedure)
    like '%when ''this_week'' then ''normal''%',
  false
) as ok \gset
\if :ok
\echo ok 9 - app urgency values map to database constraint values
\else
\echo not ok 9 - app urgency values map to database constraint values
\endif

select coalesce(
  pg_get_functiondef('public.match_service_request(uuid)'::regprocedure)
    like '%v_request.urgency = ''emergency''%'
    and pg_get_functiondef('public.match_service_request(uuid)'::regprocedure)
    like '%v_request.urgency = ''urgent''%',
  false
) as ok \gset
\if :ok
\echo ok 10 - matching scoring uses valid database urgency values
\else
\echo not ok 10 - matching scoring uses valid database urgency values
\endif

