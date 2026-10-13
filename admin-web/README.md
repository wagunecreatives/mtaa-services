# RuiruFix Admin Web

This is a separate, static web application. Serve the `admin-web` directory with any static host or local HTTP server, then open `index.html`.

The admin enters the Supabase project URL and anon key on the sign-in form. The key is only held in memory; the authenticated session uses browser session storage. Never put a Supabase service-role key in this app. Admin RPCs enforce `admin` / `super_admin` authorization server-side.

Available sections: daily and platform metrics, provider management and editing, applications, service requests with matches/responses, job investigations, trust-and-safety reports, and payment verification.

The monetization workflow records provider submitted payment references. An admin must verify the external transaction and exact amount before a subscription or featured listing activates. No payment gateway or payment instructions are configured in the project. Business and Premium billing terms are set by the admin during verification because the supplied plan table does not state their billing intervals. The admin dashboard revenue figure counts verified ledger payments.

The migration adds a service-role-only `process_due_platform_notifications()` function. Configure a trusted hourly Supabase Cron/Edge Function call to generate stale-job reminders and subscription/featured-listing expiry notices and to expire old records. Until the scheduler is configured, these reminders and expiry transitions will not run automatically.
