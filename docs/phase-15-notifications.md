# Phase 15 deployment

## Database and Edge Function

Apply `supabase/migrations/20261011000200_phase_15_notifications.sql` to the same Supabase project as Phase 14. The migration creates notification history, preferences, per-device Expo tokens, an RLS protected read RPC, an idempotent outbox, and triggers for newly inserted matches and request status changes.

The migration upgrades the existing legacy `notifications` table in place. It retains notification IDs, titles, bodies, payloads, and read history; maps legacy recipients into `recipient_id`; uses `created_at` as the read timestamp for old rows marked read without a timestamp; assigns `legacy` to unrecognized old event types; and leaves request references nullable for old notifications that were not tied to a request. The old `user_id`, `type`, and `is_read` columns remain nullable aliases. It replaces existing notification policies with the recipient-scoped read policy before granting clients SELECT only.

Set two Edge Function secrets (never put these in `.env`, the app bundle, or SQL):

```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-project-service-role-key> NOTIFICATION_WORKER_SECRET=<random-long-secret>
supabase functions deploy send-notification --no-verify-jwt
```

The function uses a custom secret header because the database webhook is not a signed-in app user. In Supabase Dashboard, create a Database Webhook on `public.notification_outbox`, events `INSERT` and `UPDATE`, method `POST`, URL `https://<project-ref>.supabase.co/functions/v1/send-notification`. Add header `x-notification-worker-secret` with the exact `NOTIFICATION_WORKER_SECRET` value. The webhook payload contains only the outbox record; the worker loads the notification and recipient's devices using the server key. The service role key stays only in Edge Function secrets. The worker atomically claims each item; update webhooks caused by `processing` and `sent` are harmless no-ops. A failed attempt changes the item to `failed`, causing another bounded attempt; after five attempts it stops.

The worker claims outbox work atomically, checks the recipient's preferences, and does not put customer contact details, address, description, or coordinates in Expo's payload. Expo ticket errors for unregistered devices deactivate those tokens. Expo returns a ticket when a push is accepted, not proof it appeared on the device; delivery receipts can be added as a follow-up reliability improvement.

## Mobile push setup

The Expo Notifications plugin and EAS project ID are already configured. Enable Android FCM v1 credentials in EAS for this project, then build and install a development or production build. Android remote push does not work in Expo Go on current Expo SDKs; physical device testing needs a native build. In provider Settings, enable Push notifications and grant OS permission. The Expo token is saved in `device_push_tokens` under the signed-in user's RLS scope. Disabling the preference suppresses pushes while preserving in-app history.

## Realtime

The migration adds `notifications` and `service_requests` to `supabase_realtime` (when that publication exists). The app subscribes with recipient/customer filters and RLS remains the access boundary. If your project manages publication membership manually, confirm both tables are enabled in Database → Publications → `supabase_realtime`.

## Smoke test

1. Create a customer request that matches multiple verified, active providers in the requested category and service area.
2. Confirm one `request_matches` and one `notifications` row per provider. The unique match constraint and notification event key prevent duplicate rows.
3. Confirm the worker webhook created Expo tickets for opted-in providers, then tap a notification; it opens provider Leads and marks its notification read.
4. Confirm a provider cannot select another user's notifications/tokens or call `get_provider_leads()` as a customer. Confirm customer request list and status notices are limited to `auth.uid()` by RLS.
5. Update request status and confirm the customer's request screen refreshes and an in-app status notification appears.

The Expo push service and Supabase project credentials are external to this repository, so actual device delivery requires the deployment setup above.

## Phase 27 event coverage

Apply migrations through `20261022000100_phase_27_notification_improvements.sql`. The notification event set covers `new_request`, `provider_accepted`, `provider_response`, `new_message`, `job_reminder`, `job_completed`, `review_reminder`, `subscription_expiry`, and `featured_listing_expiry`. Database triggers create request, response, job, message, completion, and review notices in the same transaction as the triggering change; scheduled reminders and expiry transitions are handled by `process_due_platform_notifications()`.

Provider response pushes include the service category and area (for example, “A plumber near Membley is available for your request.”). Push payloads include the notification event and job ID so tapping a review reminder opens the review form and job-related notices can navigate to the relevant job/request.

The outbox webhook and push credentials above must be configured for push delivery. In addition, configure a trusted hourly scheduler to invoke `process_due_platform_notifications()` with the service role. Until that scheduler is configured, job reminders and subscription/featured listing expiry notices and transitions will not run automatically. The scheduled function is idempotent; the outbox event keys prevent duplicate notices.
