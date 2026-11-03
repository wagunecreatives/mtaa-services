# CI and lifecycle testing

The GitHub Actions workflow runs Expo linting, TypeScript type-checking, the
seeded customer/provider lifecycle test, and PostgreSQL syntax validation for
all migration files.

## Lifecycle test environment

The lifecycle test uses a **dedicated, disposable Supabase test project**. It
signs up customer and provider accounts, seeds an eligible verified provider,
and exercises signup, request creation and retry idempotency, matching, provider
response, customer selection, job progression, completion confirmation, and
review persistence. It also checks that anonymous request creation is rejected.
All generated accounts and marketplace records are removed after the test.

Do not point these credentials at production or a project containing real user
data. The test uses a service-role key to seed and clean up records.

Configure these repository Actions secrets:

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`

The test project's migrations must already be applied, and it must have at
least one active service category. The lifecycle test reports an explicit skip
when credentials are not configured; CI lint, type-check, and migration syntax
validation still run.

Run it locally in PowerShell after setting the same environment variables:

```powershell
$env:SUPABASE_TEST_URL = "https://<test-project>.supabase.co"
$env:SUPABASE_TEST_ANON_KEY = "<test-anon-key>"
$env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<test-service-role-key>"
npm run test:lifecycle
```

## Migration validation scope

`scripts/validate-migrations.py` checks timestamped migration naming,
chronological ordering, duplicate timestamps, and PostgreSQL SQL statement
syntax via `pglast` (pinned to 8.7 in CI). PostgreSQL parses PL/pgSQL function bodies only when they
are executed.

The repository does not include a base-schema migration or a seed database that
can initialize a new local Supabase instance from an empty database. Therefore
this syntax check does not claim that every migration can be applied end to
end from scratch. Full reset/lint validation requires the project's canonical
base schema to be versioned alongside these migrations.
