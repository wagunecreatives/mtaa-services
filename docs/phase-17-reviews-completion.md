# Phase 17 — Reviews and completion

## Apply and verify

Apply the migrations in timestamp order to the same Supabase project: Phase 14 matching, Phase 15 notifications, Phase 16 job management, then `supabase/migrations/20261011000400_phase_17_reviews_completion.sql`.

Phase 17 extends the job lifecycle with `awaiting_confirmation`. Providers can mark an in-progress job ready; only its customer can confirm completion. Confirmation updates both the job and service request. A customer can then submit one 1–5 star review, with optional text of at most 2,000 characters. Review writes go through `submit_job_review`; direct client inserts, updates, and deletes are revoked. The database recalculates provider rating aggregates when reviews are added.

The migration preserves existing review rows and legacy `comment`/`is_visible` fields while adding `review_text`. Customers can view their own reviews; assigned providers can view reviews marked visible; admins can view all reviews. Providers and admins retrieve their review lists through ownership-checked RPCs. Completion and review notifications use the existing notification outbox on a best-effort basis, so a notification failure does not roll back the job or review operation.

After applying the migrations and starting the local Supabase stack, run the linked-safe schema/security assertions:

```sh
supabase test db
```

This runs `supabase/tests/phase_17_reviews_completion.test.sql`; it checks the constraints, row-level security, grants, RPC definitions, aggregate/notification triggers, and Realtime membership. It does not create fixtures or claim to cover customer/provider workflow behavior.

## Workflow smoke test

Use seeded customer, provider, profile, request, and job records in a test project:

1. As the assigned provider, progress a job to `in_progress` and mark it ready. Confirm its state becomes `awaiting_confirmation` and the customer receives an in-app completion notice.
2. As a different customer, try to confirm the job; the operation must fail. As its customer, confirm it and verify both job and service request become `completed`.
3. Submit a valid review as the customer. Confirm the provider's review list and rating aggregates update, and a `review_received` notice is enqueued. Confirm a second review for the same job is rejected.
4. Try invalid ratings, overlong review text, and direct writes to `reviews` as an authenticated client; each must be rejected.
5. Confirm customer request details show the completion and review state, provider Jobs shows received review text, and the admin Jobs view shows the review and completed job.

Workflow scenarios require authenticated test data and a running database; the linked-safe SQL suite does not exercise them. Mobile push delivery also requires the Phase 15 Edge Function/webhook setup and device credentials.
