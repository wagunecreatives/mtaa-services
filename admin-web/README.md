# MTAA SERVICES Admin Web

This is a separate, static web application. Serve the `admin-web` directory with any static host or local HTTP server, then open `index.html`.

The admin enters the Supabase project URL and anon key on the sign-in form. The key is only held in memory; the authenticated session uses browser session storage. Never put a Supabase service-role key in this app. Admin RPCs enforce `admin` / `super_admin` authorization server-side.

Available sections: daily metrics; date-filtered platform analytics for new users/providers, requests, request-to-job connection conversion, response/acceptance/completion rates, response time, reviews, revenue, subscriptions, featured listings, and request breakdowns by category/location; provider management and editing; applications; service requests with matches/responses; job investigations; trust-and-safety reports; and read-only payment records.

Provider plan prices are displayed for market testing only. Paid plan requests, featured listing payments, and payment-reference submission are disabled in the provider app; the admin payment screen is read-only and must not be used to activate submitted payments. Providers may create explicitly marked, unpaid test featured listings to exercise category/area discovery; these records do not create payment rows. Apply `supabase/migrations/20261022000200_phase_33_featured_listings.sql` before using this feature. No payment gateway or payment instructions are configured. Pricing and billing terms remain subject to change before monetization launches.

The migration adds a service-role-only `process_due_platform_notifications()` function. Configure a trusted hourly Supabase Cron/Edge Function call to generate stale-job reminders and subscription/featured-listing expiry notices and to expire old records. Until the scheduler is configured, these reminders and expiry transitions will not run automatically.
