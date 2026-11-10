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

For a private acceptance deployment, set `FOLIO_PREVIEW_MODE=true`, a random `FOLIO_PREVIEW_INVITE_CODE` of at least 32 characters and an explicit preview billing mode. Mock billing is labelled test billing. Do not promote that configuration as paid-ready.

For paid launch:

- Disable preview/mock modes and require email verification.
- Configure the verified transactional-email sender and test registration, verification and recovery delivery.
- Configure the owner's Stripe account, a EUR 49/month recurring price for 500 pages, webhook signing secret and cancellation-enabled portal. Verify checkout, webhook reconciliation, cancellation and renewal in test mode before live configuration.
- Supply actual operator/support details and reviewed payment/data-handling policies. `STRIPE_AUTOMATIC_TAX_ENABLED` is an explicit operator choice and requires the correct Stripe setup; code alone does not configure tax registration.
- Install the reviewed conditional queue watchdog only after the authenticated worker endpoint is reachable. Prove recovery without relying on a browser remaining open, plus retention/deletion execution.
- Repeat upload → real extraction → saved correction → approval → downloaded CSV on the deployed target. Prove cross-workspace access denial and failure/quota handling there.
- Record deployed commit, configuration mode, evidence and remaining limitations. A successful build or healthy homepage is not end-to-end release proof.

## Evidence status

As of 10 November 2026, the hosted preview uses private invitations, preview mode and mock billing, with account-email delivery disabled. Its synthetic invoice browser workflow reached actual extraction, persisted corrections, explicit approval and verified CSV download. Readiness and worker authentication probes passed; scheduler installation and idle ticks do not yet prove scheduled recovery or retention. Live payments and email delivery are not configured.

See [the verification record](PAPERWAKE-WEEK-ONE-EVIDENCE.md) for exact tested revisions and outstanding checks, and [the worker verification procedure](PAPERWAKE-HOSTED-WORKER-VERIFICATION.md) for the separate recovery/retention acceptance. Status must distinguish controlled tests, real-provider synthetic runs, browser checks and hosted checks. No source claims blanket invoice accuracy or support for unlisted formats.

## Private paid pilot and cost controls

`PAPERWAKE_SIGNUP_INVITE_CODE` keeps new registration closed independently of preview billing. Configure it before disabling preview for the first paid pilots; existing-user sign-in remains available. Invalid configured codes fail closed. Never publish the code in frontend bundles or repository files.

`PAPERWAKE_AI_TRIAL_MONTHLY_USD`, `PAPERWAKE_AI_PAID_MONTHLY_USD` and `PAPERWAKE_AI_GLOBAL_MONTHLY_USD` default to USD 2, 25 and 100 per UTC calendar month. Values are plain positive USD decimals with at most two decimal places. Trial/paid maximum is 1000; installation maximum is 10000. Each pending or unpriced provider attempt conservatively reserves USD 1, then settles only against verified token pricing. Unknown/failed attempts remain accounted for; deleting a document does not reset spend. This bounds this installation, not unrelated apps using the same API key.

The cost guard may pause expensive or uncertain work before all page credits have been used. It is an operator safety stop, not an extra customer charge or proof of profitability. Investigate the cause and actual recorded costs; do not automatically raise limits or restart failed jobs. The pinned model/rate/output assumptions must be reviewed before changing the provider. See the economics note for measured costs and sampling limits.
