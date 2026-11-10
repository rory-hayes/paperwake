# Paperwake

Paperwake turns English supplier-invoice PDFs into reviewed CSV files. It is a separate application copied from the user-owned Folio codebase, with the original visual design retained and a much smaller launch scope.

The initial customer is the finance or operations team at a small wholesaler or importer, repeatedly copying supplier-invoice fields and line items into Excel or Google Sheets. The first product is one complete workflow: **upload → extract → review and correct → approve → download CSV**.

## Launch scope

- Email/password accounts, verification and password recovery; one workspace per account.
- Digital, English supplier-invoice PDFs with a fixed invoice field/line-item schema.
- Original PDF alongside editable extraction results; missing or uncertain values require review.
- Persisted corrections, revision checks, explicit approval, and approved CSV snapshots.
- Page allowance, billing settings, and source retention of at most 30 days.

Each batch accepts up to **10 PDFs**. Each PDF is limited to **10 MB and 5 pages**, with one flat line-item table containing at most **100 rows**. Enforced format, size, page and row limits reject unsupported inputs explicitly; extraction results still require human review. Scanned/image-only documents, other document types, inbound email, generic parser builders, table splitting, spreadsheet integrations, teams and a public API are outside this launch. Their inherited helpers are not evidence that those features are available; the server enforces the launch boundary.

The proposed offer is **€49/month excluding applicable VAT for 500 processed pages per subscription billing period**, plus **ten evaluation pages once per account**. Pages are reserved while processing and counted when a reviewable extraction is saved. Failed processing releases its reservation; exact duplicates and automatic retries add no page charge. Deleting a completed invoice does not restore pages. Uploads pause at the allowance limit; there are no automatic overage charges. Separate processing-cost safeguards can pause unusual or uncertain work for operator review; see the cost evidence below. The catalogue lives in [shared/plans.ts](shared/plans.ts).

Current project records: [Week 1 verification](docs/PAPERWAKE-WEEK-ONE-EVIDENCE.md), [deployment setup and remaining checks](docs/PAPERWAKE-DEPLOYMENT.md), and [initial cost evidence and its limits](docs/PAPERWAKE-ECONOMICS.md).

## Runtime and local development

The application uses React/Vite, Fastify, PostgreSQL with tenant row-level security, private file storage, and a durable background worker. OpenAI provides invoice extraction. Stripe handles subscriptions and its customer portal; Resend handles account mail. Secrets and provider operations stay on the server.

Use Node.js 24 and PostgreSQL 17. Install locked dependencies with `npm ci`. Configure ignored `.env.local` for the dedicated Paperwake database and application origin. Never reuse an existing Folio or unrelated application's database/storage credentials.

For the supplied local PostgreSQL bootstrap, `npm run setup` starts/verifies the private development database and applies migrations. If PostgreSQL is already managed locally, configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGADMINUSER`, `PGUSER`, and `DATABASE_APP_ROLE`; the bootstrap verifies that configured local database instead. The application role must be restricted and cannot bypass RLS. Managed hosting uses separate `DATABASE_ADMIN_URL` and `DATABASE_URL` credentials; a private application schema also needs its own migration connection.

Then run:

```sh
npm run dev
```

This starts the UI at `http://127.0.0.1:5189`, the API at port `4328`, and the local worker. `APP_ORIGIN` must match the UI origin. Set the server-only `OPENAI_API_KEY` for actual extraction; source tests use controlled providers. Local storage defaults to `.local/files`. Hosted storage must be private and separately configured. [`.env.example`](.env.example) provides the minimum configuration template; [deployment setup](docs/PAPERWAKE-DEPLOYMENT.md) covers provider and operator-policy requirements. The template contains no usable credentials.

Account verification and password recovery require a verified sender, `FOLIO_AUTH_EMAIL_ENABLED=true`, `FOLIO_AUTH_EMAIL_FROM`, `FOLIO_AUTH_EMAIL_API_KEY`, a trusted `APP_ORIGIN`, and the application's integration-encryption key. Production requires email verification by default. Missing configuration must remain visible as unavailable; it is not a reason to fabricate email delivery.

## Billing and deployment

Paid checkout requires the matching Stripe mode/key, webhook signing secret and `STRIPE_PRICE_STANDARD` for EUR 49/month. Live mode also requires the approved account ID, cancellation-enabled portal configuration, exact HTTPS origin, and configured operator checkout terms. A signed provider event, followed by reconciliation against Stripe, updates the subscription and its billing-period allowance. Returning from Checkout alone grants no paid access.

`STRIPE_AUTOMATIC_TAX_ENABLED` is an explicit operator choice, off by default. Enabling it requires an exclusive-tax price and appropriate Stripe tax configuration. The repository does not assert the operator's VAT status or registrations. Test and mock billing are labelled and do not prove a live subscription.

`PAPERWAKE_SIGNUP_INVITE_CODE` optionally closes new registration to invited pilots independently of billing mode. Use a private random code of 32–256 characters without whitespace; leave the variable unset for open registration. Invalid configured values prevent startup. Existing users can still sign in. Preview deployments retain their separate preview invitation and simulated/test-billing rules.

`npm run build:vercel` builds the web application and packages the backend and isolated decoders. Hosting also needs configured database/storage, worker wake scheduling and authentication, account-email delivery, provider credentials and operator policies. A deployed frontend alone is insufficient. No README statement substitutes for actual hosted upload-to-CSV, billing, email and retention acceptance.

## Verification

```sh
npm run typecheck
npm test
npm run build:vercel
node scripts/verify-vercel-bundle.mjs
```

`npm test` uses the explicit release manifest in [scripts/test-paperwake.mjs](scripts/test-paperwake.mjs). [Test scope and retained historical coverage](docs/PAPERWAKE-TEST-SCOPE.md) explains the selection. It covers the invoice workflow and editor, page-accounting concurrency and tenant boundaries, accounts/recovery/verification, rate limits, private storage, worker scheduling, extraction normalization, billing contracts and backup components. Providers are controlled fixtures; these tests do not send real account emails or create real subscriptions.

Tests require a separate, migrated local **paperwake_test** database, or CI's disposable **paperwake_ci** database. They refuse remote, production and original Folio databases and check that the application role cannot bypass RLS. The runner defaults `PGDATABASE` to `paperwake_test` and clears external provider credentials in child processes. Use `node scripts/test-paperwake.mjs --list` to inspect coverage or `--group=accounts` to run one group. Never point the suite at the running development database or run another worker against its test database.

CI runs this launch manifest, build/package checks, and an independently encrypted managed-storage backup/restore drill using controlled storage and its own temporary PostgreSQL cluster. Backup component tests and the restore drill test recovery mechanics; hosted backup scheduling, independent storage and operational recovery acceptance remain separate requirements.

Inherited source, tests and synthetic fixtures remain in the repository. `npm run test:historical` invokes the older broad collection, which includes deferred Folio features and outdated product assumptions and is not a Paperwake release gate. The old generic `verify:backup` runtime drill likewise assumes those deferred workflows; current CI uses `verify:backup:managed`. Historical Folio screenshots, deployment/account reports and the previous README are preserved locally and excluded from public Git. [Repository publication scope](docs/PAPERWAKE-PUBLIC-REPOSITORY.md) records that boundary and the documentation required by tests. Historical results do not establish Paperwake release acceptance.

Paperwake's live provider configuration, hosted workflow, measured full-allowance economics and readiness for paying pilots must be verified and recorded separately before a customer launch.
