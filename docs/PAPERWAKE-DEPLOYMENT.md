# Paperwake deployment and launch status

This repository is a separate copy of the user's Folio source. Original source: `maintainflow-folio-release` commit `c97df310b5813e7dd483259b848ff472e9592815`. No Supastarter source is used. Internal `FOLIO_*` configuration names and historical migrations remain for compatibility; the customer-facing app is Paperwake.

## Owned targets

- Git repository: https://github.com/rory-hayes/paperwake
- Vercel project: `paperwake`; exact account/project binding is stored in ignored deployment configuration.
- Stable acceptance URL: https://paperwake-gamma.vercel.app
- Dedicated Supabase project: Paperwake, Ireland. The project reference and credentials stay in private deployment configuration.
- Private PostgreSQL schema: `paperwake`; restricted runtime roles: `paperwake_backend` and `paperwake_tenant`.
- Original files: private `folio-originals` bucket, maximum 10 MiB/object. The internal bucket name does not imply reuse of Folio's data.

Do not point this deployment at original Folio/MaintainFlow databases, storage, domains or billing accounts. Runtime roles must not own tables, bypass row-level security, or have migration privileges.

## Local verification

`npm run setup` uses a configured dedicated database if `PGHOST` is set. Otherwise it provisions its own private socket-only PostgreSQL. It never starts/stops a configured external server. On this workstation, `paperwake_local` is the manual/browser acceptance database and `paperwake_test` is the separate regression database. Both use the restricted `paperwake_app` runtime role.

1. Copy `.env.example` to `.env.local` and set the needed values.
2. `npm run setup`
3. `npm run dev` (UI 5189; API 4328; durable worker)
4. Run release tests against the separate test database; never use a live customer database.
5. `npm run build:vercel` packages static assets and a private Node function.

Local email delivery can be disabled for synthetic-only acceptance. That does not prove customer registration/recovery email delivery. Likewise mocked/test billing cannot prove subscription collection.

## Hosted configuration

Secrets are server-only environment variables, set through the deployment provider's secret mechanism. Do not prefix these with `VITE_`, put them in frontend code, logs or command arguments, or commit `.env.hosted.local`.

Required runtime: `APP_ORIGIN`, `DATABASE_SCHEMA`, `DATABASE_ADMIN_ROLE`, `DATABASE_APP_ROLE`, `DATABASE_POOL_MAX`, `DATABASE_ADMIN_URL`, `DATABASE_URL`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `FOLIO_WORKER_SECRET`, `FOLIO_MONITOR_SECRET`. Remote PostgreSQL connections verify certificates; use `DATABASE_CA_CERT` if the provider's certificate requires its supplied CA. Never disable verification to work around a connection failure.

Migrations need a separate owner identity. Runtime URLs cannot run DDL. The generated SQL Editor bootstrap creates restricted roles and private schema in one transaction, then applies all current migrations. Inspect before applying; it refuses existing conflicting roles/schema. Follow-up migrations must use the existing-schema path, not recreate roles.

Apply [migration 049](../migrations/049_paperwake_reservation_billing_mode.sql) before deploying the billing-mode-aware intake and worker. It adds the nullable `usage_reservations.billing_mode` column without changing roles or privileges. New paid reservations save their admitted mode; trial reservations remain null. Historical paid reservations with no saved mode fail closed and require operator review. Do not infer or backfill their original mode from the workspace's current plan.

For a private acceptance deployment, set `FOLIO_PREVIEW_MODE=true`, a random `FOLIO_PREVIEW_INVITE_CODE` of at least 32 characters and an explicit preview billing mode. The current hosted preview uses `FOLIO_PREVIEW_STRIPE_TEST=true`, `FOLIO_BILLING_MOCK=false` and matching Stripe test configuration. Mock and Stripe test billing remain labelled and do not establish paid readiness.

For paid launch:

- Disable preview/mock modes and require email verification.
- Configure the verified transactional-email sender and test registration, verification and recovery delivery.
- Configure the owner's Stripe account, an explicitly exclusive-tax EUR 49/month recurring price for 500 pages, webhook signing secret and cancellation-enabled portal. `STRIPE_PORTAL_CONFIGURATION_ID` is required in both test and live mode. Verify checkout, webhook reconciliation, cancellation and renewal in test mode before live configuration.
- Supply actual operator/support details and reviewed payment/data-handling policies. `STRIPE_AUTOMATIC_TAX_ENABLED` is an explicit operator choice and requires the correct Stripe setup; code alone does not configure tax registration.
- Install the reviewed conditional queue watchdog only after the authenticated worker endpoint is reachable. Prove recovery without relying on a browser remaining open, plus retention/deletion execution.
- Repeat upload → real extraction → saved correction → approval → downloaded CSV on the deployed target. Prove cross-workspace access denial and failure/quota handling there.
- Record deployed commit, configuration mode, evidence and remaining limitations. A successful build or healthy homepage is not end-to-end release proof.

### Billing boundaries

New paid work requires the workspace's billing mode to match the active mock/test/live environment. A worker verifies the saved reservation's workspace, job, document, page count, state and billing mode, plus its current unexpired lease, before reading the source and again before provider dispatch. Stale-mode or unknown-mode paid work is rejected without a page debit; existing usage history and the ten lifetime evaluation pages are preserved.

Valid accepted paid work retains its original reservation across renewal or cancellation. Its exact processing operation can still use the paid AI cost cap after downgrade, within the workspace and global budgets; unrelated trial jobs cannot borrow that grant. A failed final authority check retains any already-recorded cost intent conservatively, even when no provider request is sent.

Checkout requires an active EUR 49 monthly price with explicit `tax_behavior=exclusive`; inclusive, unspecified or missing behavior is rejected even with automatic tax disabled. It also retrieves and validates the active cancellation-enabled portal before creating billing state. Cancellation-only portals remain accessible to their bound existing customers when signup pricing is archived or changes; portals that offer subscription updates still validate the available price. Controlled regressions cover these guards. The separate [Stripe test record](PAPERWAKE-STRIPE-TEST-2026-11-10.md) records the actual configured sandbox and hosted simulated-payment acceptance; neither establishes live payment collection.

## Evidence status

The hosted preview uses private invitations and the isolated Paperwake Stripe testing sandbox, with mock billing disabled and account-email delivery still unverified. Acceptance deployment `dpl_ENfvGRwLjsn27DJFryb6PGpZp35M`, source `bf380c9c739e08bdc814bb072e4b0a4dca9659f1`, passed configuration/readiness checks, actual browser Checkout with a simulated EUR 49 payment, signed-webhook reconciliation and the current 500-page allowance. Scheduled cancellation and actual event replay also passed. A follow-on clock test passed paid renewal, failed renewal, same-invoice recovery and terminal cancellation; final readback at 21:40:13.550 UTC showed all 16 events completed and the fixture on Explore with ten unused evaluation pages. Future paid periods remained unavailable against real database time. No pages were consumed, so spent-quota reset retains controlled-test coverage only; no live activation, real charge or manual database-time/entitlement change occurred. The global test-clock setting was removed; the replacement deployment passed configuration, health and readiness checks at 21:43:00 UTC on the same source. [Exact Stripe scope and receipts](PAPERWAKE-STRIPE-TEST-2026-11-10.md).

Earlier synthetic invoice acceptance reached actual extraction, persisted corrections, explicit approval and verified CSV download. A separate 52-check hosted run passed account isolation, duplicate/replay accounting, invalid-upload rejection and launch-route boundaries. Correlated cron/HTTP and persisted-state evidence verified a seeded expired-lease recovery and deletion of one synthetic document, its extraction run and original file while preserving page/AI usage; neither phase used a manual wake. No process was killed, and the retention fixture had no corrections/approvals/exports to delete. These checks retain their original revisions. Approved terms capture, live/tax configuration, delivered account email, operator policies, commercial hosting eligibility and operational backups remain outstanding.

See [the verification record](PAPERWAKE-WEEK-ONE-EVIDENCE.md) for exact tested revisions and outstanding checks, and [the worker verification procedure](PAPERWAKE-HOSTED-WORKER-VERIFICATION.md) for the separate recovery/retention acceptance. Status must distinguish controlled tests, real-provider synthetic runs, browser checks and hosted checks. No source claims blanket invoice accuracy or support for unlisted formats.

The owner-approved hosted-source recovery drill subsequently passed at 20:08 UTC on 10 November. It captured and restored 64 tables, 99 rows, 40 migrations and one private PDF, including the integration-encryption key. The fresh local database passed inactive byte/permission verification; no restored services were activated. The hosted runtime limits and named cron schedule were restored exactly, and health, both runtime connections and the original approved PDF passed separate checks. [Recovery receipt](evidence/paperwake-hosted-restore-2026-11-10.json). Recurring backup scheduling, independent offsite storage/key custody, retention and failure notifications still remain open.

## Private paid pilot and cost controls

`PAPERWAKE_SIGNUP_INVITE_CODE` keeps new registration closed independently of preview billing. Configure it before disabling preview for the first paid pilots; existing-user sign-in remains available. Invalid configured codes fail closed. Never publish the code in frontend bundles or repository files.

### Optional configured signup terms

The default application now reads an explicit owner-supplied policy through [signup-policy-configuration.ts](../server/core/signup-policy-configuration.ts). Nothing is enabled until approved content is configured. Supply all three server variables together:

- `PAPERWAKE_SIGNUP_POLICY_JSON`: one strict JSON object with `version`, `language`, `title`, `text`, `url` and `agreementText`; no extra fields. The URL must be HTTPS without credentials or a fragment.
- `PAPERWAKE_SIGNUP_POLICY_VERSION`: the exact version in that object.
- `PAPERWAKE_SIGNUP_POLICY_SHA256`: lowercase SHA-256 of `canonicalSignupPolicy(policy)` from [shared/signup-terms.ts](../shared/signup-terms.ts), binding every displayed field in its defined order. It is not the digest of the original JSON bytes or just the text.

Both raw configuration JSON and canonical policy JSON must fit 16 KiB. All three variables absent leaves signup terms disabled for the existing private preview. Any present-but-empty, partial, malformed, oversized, version-mismatched or hash-mismatched configuration returns 503 for signup-terms status and registration; it never silently disables acceptance. Correct configuration uses the existing UI, current version/hash checks, encrypted verification-queue snapshot and persisted acceptance record. Policy changes do not rewrite earlier accepted records. There is no network policy fetch, bundled legal text or claim of legal completeness. Checkout terms remain a separate configuration.

### Processing cost controls

`PAPERWAKE_AI_TRIAL_MONTHLY_USD`, `PAPERWAKE_AI_PAID_MONTHLY_USD` and `PAPERWAKE_AI_GLOBAL_MONTHLY_USD` default to USD 2, 25 and 100 per UTC calendar month. Values are plain positive USD decimals with at most two decimal places. Trial/paid maximum is 1000; installation maximum is 10000. Each pending or unpriced provider attempt conservatively reserves USD 1, then settles only against verified token pricing. Unknown/failed attempts remain accounted for; deleting a document does not reset spend. This bounds this installation, not unrelated apps using the same API key.

The cost guard may pause expensive or uncertain work before all page credits have been used. It is an operator safety stop, not an extra customer charge or proof of profitability. Investigate the cause and actual recorded costs; do not automatically raise limits or restart failed jobs. The pinned model/rate/output assumptions must be reviewed before changing the provider. See the economics note for measured costs and sampling limits.
