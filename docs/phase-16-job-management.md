# Phase 16 — Job Management

## Schema decisions

The existing `jobs` table is reused. Its allowed statuses are `assigned`, `accepted`, `on_the_way`, `arrived`, `in_progress`, `completed`, `cancelled`, and `disputed`. Provider responses use `pending`, `accepted`, `rejected`, and `withdrawn`; a response is created from a valid `request_matches` row. `jobs_request_id_key` remains the one-job-per-request guard. One nullable `service_requests.cancellation_reason` column is added so customer cancellations before job creation keep their reason too.

Selecting a pending provider response creates one `assigned` job in the same transaction, copies the provider quote to `agreed_price`, accepts the selected response, rejects other pending responses, marks other open matches cancelled, and sets the request to `provider_selected`. Provider transitions use RPCs only. Customer confirmation is deferred to the review phase because the existing jobs schema has no confirmation column or status.

## Apply and verify

Apply pending migrations in timestamp order (Phase 14, Phase 15, then `supabase/migrations/20261011000300_phase_16_job_management.sql`) to the Supabase project. The Phase 16 migration replaces direct request-status edits with column-level request edits, revokes direct job writes from app roles, preserves existing jobs RLS read/admin policies, adds workflow RPCs, expands Phase 15 notification events, and publishes jobs to Realtime.

The provider response and status changes are secure database functions. Customer response details and provider-assigned job details are returned only by ownership-checked functions. Provider contact is returned to a customer only for their selected, non-cancelled job. Job/customer details are returned to a provider only for jobs assigned to that provider. Admin listing requires `is_admin()`.

Phase 16 also removes broad authenticated INSERT/UPDATE grants on `providers` and grants only profile fields needed by provider clients. Rating and other matching aggregates, verification fields, and counters remain database-managed. This is required because a column-level revoke cannot override the live project's table-level UPDATE privilege. Admin verification changes use the admin-authorized `admin_update_provider_verification` RPC.

## Checks

Run `supabase test db` after migrations are applied to a local Supabase stack to execute `supabase/tests/phase_16_schema_security.test.sql`. It asserts the existing unique constraints and state checks, jobs RLS, absence of direct authenticated job write privileges, RPC grants, and Realtime publication membership.

Workflow integration cases still require seeded Supabase Auth/profile/provider/request data and a running database. Exercise: matched provider response; customer selects only their own request's eligible response; a second selection fails; provider accepts/starts/completes their assigned job; another provider cannot update it; direct job writes are denied; request/job cancellation is limited to eligible states; concurrent selection produces one row. Supabase migrations and workflow integration tests are not run by editing the app locally.
