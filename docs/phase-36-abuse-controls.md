# Phase 36 — Anti-spam and abuse controls

Apply `supabase/migrations/20261022000300_phase_36_abuse_controls.sql` after the existing Phase 33 migration. The earlier abuse-control migration (`20261012000800_analytics_abuse_controls.sql`) must already be applied.

## Controls

- Request creation is serialized per customer, limited to 3 per hour and 8 per day, and rejects an exact normalized duplicate in the same category and area within 15 minutes. The client request UUID preserves retry idempotency.
- User reports are limited to 5 per user per day and duplicate reports against the same target/job/reason are rejected within 30 days.
- Reviews are limited to 3 per customer per day, require a completed job owned by the customer, allow only one review per job, and reject repeated normalized review text within 30 days.
- Provider responses are limited to 20 per provider per hour. Existing match state allows only one response per active match.
- Job disputes are limited to 3 per participant per day.
- Blocking is available from provider/customer job and response screens. Database guards prevent new matches, provider responses, and jobs between blocked users. Users can review and unblock accounts from profile/settings.
- Admins can suspend provider verification status or deactivate customer accounts using the existing admin controls.

These limits are enforced by Supabase functions/triggers, not only by client UI. Apply database migrations to Supabase before deploying app UI that uses `list_blocked_users()`.
