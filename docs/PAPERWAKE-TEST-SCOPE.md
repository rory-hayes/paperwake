# Paperwake release test scope

[`scripts/test-paperwake.mjs`](../scripts/test-paperwake.mjs) is the release manifest. Every selected test must pass; the runner does not convert failures into skips. New `paperwake-*.test.ts` files must be explicitly added before the manifest can run. GitHub CI uses this manifest, a production build and packaged-runtime checks, followed by the managed encrypted backup/restore drill.

| Group | Current coverage |
| --- | --- |
| `launch` | Fixed invoice schema and source limits, real PDF decoding, controlled extraction, review edits and warnings, revision fencing, approval/CSV values, account isolation, page reservation/debit/release, signed-upload recovery and client continuity |
| `accounts` | Registration admission, verification, password recovery, encrypted mail queue, sender transport, cleanup bounds, session/login protections, hosted invitation/rate limits, signup terms and auth UI |
| `boundaries` | Database roles/schema isolation, shared request budgets, private storage/path containment, file deletion claims, sanitized errors, static/SPA routing and dependency availability |
| `processing` | Hosted worker scheduling/authentication, extraction usage observations, model request/response validation, before-request cost-budget admission, PDF/source rejection, exact decimal/date normalization and CSV safety |
| `billing` | One-plan UI, Stripe contract evidence and replay, operator policy configuration, test-clock/customer boundaries, private preview configuration and the assumption-based economics model |
| `recovery` | Encrypted backup archives, CLI boundaries, runtime/staging protections and controlled private-storage transport |

The database preflight permits only `paperwake_test` or `paperwake_ci` over a local socket/loopback connection, checks the actual database/schema identity and verifies that the tenant role cannot bypass RLS. It refuses `paperwake_local`, the original Folio database, and hosted connections. Provider credentials are cleared in test child processes; provider-dependent tests use controlled transport or explicit test doubles. The runner raises synthetic budget limits for legacy ledger fixtures; the dedicated budget suite overrides them to exercise production-policy limits and rejection. Queue tests run serially. Fixtures clean their owned records; the bounded counter-cleanup regression locks and preserves counters from earlier suites instead of deleting unrelated records.

Inherited source and test files for generic parsers, bank statements, receipt/PO extraction, images, archives, splitting, incoming email, Sheets/webhooks, teams, public API keys, and alternate exports remain available for future work. Their product-level acceptance tests are historical rather than launch gates because those features are deliberately unavailable in Paperwake. The invoice suite checks that direct requests cannot enable them. Reusable low-level normalization, storage, provider, account, queue and backup protections are retained where they apply to the launch.

Retained account/Stripe tests have been updated to the Paperwake plan, subject text, settings URLs and API-disabled boundary. Their security and transactional assertions remain: tests are not removed simply because the old fixtures fail. A complete old collection is still available with `npm run test:historical`, but it is not a claim that deferred features work in the current product.

The legacy `verify:backup` runtime scenario exercises deferred Folio workflows and is preserved for historical use. Current CI keeps `verify:backup:managed`, which creates a separate temporary PostgreSQL cluster and controlled private object storage to test capture, encryption, restoration and verification without calling hosted services. A passing controlled drill does not prove the actual production backup schedule or recovery access.

Historical screenshots and deployment/account evidence are kept locally and excluded from public Git. Current tests require only `docs/unit-economics.example.json` from that documentation tree; the synthetic example remains included. See [public repository scope](PAPERWAKE-PUBLIC-REPOSITORY.md) for the publication boundary and retained tool guides.

The [local manifest receipt from 9 November](evidence/paperwake-release-manifest-2026-11-09.json) records its exact test count and scope limits. It is a dated local result, not a GitHub Actions or hosted-provider acceptance result.

Rendered browser acceptance, real-provider invoice tests, delivered account emails, Stripe payment/webhook lifecycle tests and hosted retention are separate evidence. See [the Week 1 record](PAPERWAKE-WEEK-ONE-EVIDENCE.md) for the distinction between completed and outstanding checks.
