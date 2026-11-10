# Paperwake Week 1 verification

Updated: 2026-11-10. This is a working evidence log, not a claim of universal invoice accuracy or paid launch readiness.

## Scope delivered

Separate Paperwake repository copied from the user's Folio source; original checkout left unchanged. Preserved visual design with Invoices and Settings navigation. Fixed supplier-invoice workflow only; generic parser, receipt, purchase order, bank, split, archive, integration and public API routes are unavailable at launch.

Supported scope: English digital PDFs with selectable text, one supplier invoice per PDF, 10 files/batch, 10 MiB/file, five pages/file, up to 100 line items. Human review and explicit saved-revision approval are required before CSV export.

Commercial configuration: ten lifetime evaluation pages; EUR 49/month excluding applicable VAT for 500 processed pages per billing period. Pages reserve while processing and commit after a usable extraction is saved. Terminal failures release reservations. Exact duplicates, internal retries and repeated downloads do not add charges. No automatic overage.

## Verified directly by the root agent

### Actual local browser + real provider

- Started the separate API on 4328, UI on 5189 and durable worker, using `paperwake_local`.
- Registered a disposable synthetic account through the rendered sign-up form. This local test deliberately did not send email and is not email-delivery proof.
- Uploaded an actual one-page PDF through the browser file picker.
- Real OpenAI extraction returned all expected invoice headers and two exact line items, including leading-zero product codes.
- Edited invoice reference and a product code; saved; reloaded; verified persisted corrected values.
- Approved the saved revision, downloaded CSV through the browser and read the resulting local file. Verified both rows, corrected reference, `000012` product code and exact decimal strings.
- Renamed the invoice-reference CSV column and moved supplier to first position through Settings. Saved and downloaded a second CSV; verified column order, renamed heading and unchanged corrected values.
- Billing screen showed one of ten pages used, nine remaining, no monthly reset, and EUR 49/500. Paid checkout correctly unavailable without configuration.
- Desktop review design and 390-pixel mobile invoice list/review/PDF-preview rendered and interacted correctly. No console warnings/errors observed in that acceptance session.

Artifacts remain local under ignored `.local/acceptance`. Browser screenshots are in the chat visualization directory, outside the source repository.

Expanded real-provider synthetic checks passed all seven scenarios: repeated-header multipage, 100 rows, purchase order, credit note, missing currency, ambiguous date and explicit shipping. Recorded token-price estimate: USD 0.04546875. The 100-row values and CSV matched exactly, but 495 source-quote warnings remained; the UI groups them honestly. This is synthetic evidence, not general accuracy. Local ambiguous-date and totals-warning UI checks passed: edits reset acknowledgment, saved shipping-inclusive totals remained unchanged, and an offline save preserved the draft and succeeded after connectivity returned.

### Infrastructure and build

- Created separate local regression database `paperwake_test`; regression workers do not race the manual/live-provider database.
- `npm run setup` verified configured local PostgreSQL and all 39 migrations through 048.
- `npm run build:vercel` passed typecheck, Vite production build and packaged the private Node runtime (62.1 MiB at this checkpoint).
- Verified Paperwake Supabase server storage credential against its own project without logging it.
- Created the private originals bucket with 10 MiB limit; wrote/read a synthetic PDF with identical bytes; anonymous public read was denied; removed the test object afterward.
- Scanned candidate repository files for common credential formats; no matching key/private-key candidates found. This scan is supplementary, not a comprehensive secret audit.
- Hosted setup applied on 2026-11-10 after an initial safe rollback and a narrow, tested compatibility correction for a platform PL/pgSQL event trigger. Verified 39 migrations, 64 private tables, two restricted runtime roles and zero role memberships. Runtime connections verify the provider CA; migration-owner records remain inaccessible to runtime roles.

### Hosted preview: browser workflow and operational probes

On 10 November, the root agent verified deployed commit `ee633b6e54de00c03419af08ec968983110d1652` before starting the browser workflow through [the hosted preview's stable alias](https://paperwake-gamma.vercel.app). That alias may have advanced during acceptance to the test-only `46175ee` revision; the workflow was not pinned to an immutable deployment URL throughout. Application code was unchanged through `cb78350213cd766d4f40a6d473fdf3f2943cfd24`, whose exact deployed revision was verified by a separate read-only probe.

Configuration was **private invitation, preview enabled, mock billing, account-email delivery disabled**. This acceptance used only a synthetic invoice and actual OpenAI extraction.

- Signed up through the rendered UI and uploaded the PDF into private hosted storage.
- Actual extraction produced two expected line items. Edited the invoice reference and a leading-zero product code, saved, reloaded and confirmed both corrections persisted.
- Explicitly approved the saved revision and downloaded CSV. The resulting file contained two rows, both corrected values, the leading-zero code, exact `12.50` and `3.75` unit-price strings, and `49.20` total.
- Usage showed one of ten lifetime evaluation pages consumed and nine remaining. Billing displayed EUR 49/month for 500 pages; mock billing is not payment evidence.
- `/api/health` and `/api/ready` returned 200; readiness reported database, private storage and restore gate OK. Unauthenticated worker and diagnostics calls returned 401. Authenticated diagnostics returned 200 with empty queues; an authenticated worker request returned 202.
- Installed the one-minute scheduler with its two required private Vault entries. Two initial idle ticks were observed with no runnable work. These installation/HTTP checks alone do not prove completed work; the later correlated recovery and retention run is recorded below.

The browser receipt, read-only probe receipt and screenshot remain private local artifacts. No account identifiers, credentials or personal data are published here.

After the signup-policy release, a read-only hosted check at **2026-11-10 08:20:50 UTC** verified exact revision `b0d51665e93247164877c1642df612268875ef6f`: `/api/health` returned 200, `/api/ready` returned 200 with database/storage/restore OK, and `/api/auth/signup-terms` returned 200 with `{enabled:false,policy:null}`. This confirms the unconfigured preview remains available after deployment. It does not prove acceptance of configured owner-approved terms; no authenticated test mutation or policy activation was performed.

### Hosted account boundaries and duplicate accounting

After explicit owner approval, the root agent completed **52/52 hosted checks** on 10 November, finishing at **08:28:18 UTC** with deployment held at `1592e3b15295c98c810032f8a61035103181bb17`. This used only disposable synthetic accounts/documents and no new extraction, settings changes, role changes or deletions. The [sanitized boundary receipt](evidence/paperwake-hosted-boundaries-2026-11-10.json) records the results without account or document identifiers.

- A second workspace could not read the first account's invoice, original PDF, signed download link, extraction run or CSV, or target its uploads/exports. Foreign workspace selection returned 403; resource reads returned 404. Lists did not reveal the other account's records. Anonymous document/export access returned 401; public API bearer access remained disabled with 403.
- Exact duplicate upload, retry before upload and finalization replay returned the original document without a new extraction job. Before and after: **one processed page, zero reserved, nine remaining, one document**. The approved revision, job/run counts and corrected CSV remained intact.
- A non-PDF filename and text disguised as a PDF returned 415 before extraction. The second account stayed at **zero processed/reserved pages, ten remaining, zero documents**.
- Direct requests for generic parsers, public API keys, integrations, manual reprocessing, splitting, archive import and bank review returned 404.

This run did not exhaust the hosted trial. Duplicate behavior with zero remaining pages is covered by the local guarded integration suite, not claimed as hosted acceptance here. The final mutating HTTP response completed at **08:28:16.755 UTC**; the separate worker test waited for prior activity to drain before preparing recovery.

### Hosted scheduled recovery and retention

The owner-authorized synthetic worker run passed all phases at deployment `1592e3b15295c98c810032f8a61035103181bb17`. The [combined sanitized receipt](evidence/paperwake-hosted-worker-2026-11-10.json) joins persisted application state with independently observed cron/HTTP responses from the Supabase SQL editor. Correlation screenshots and raw receipts remain private. **No manual worker wake was used in either phase.**

- **Recovery:** after the quiet interval, a disposable fixture was given a seeded expired `processing` lease at **08:33:26.826 UTC**. This simulates the persisted state left by interruption; no running process was killed. Cron succeeded at **08:34:00.111 UTC**, its worker request returned 202 without timeout, and the job completed at **08:34:11.866 UTC**, at attempt two with its lease cleared. The journal recorded `processing → queued → processing → needs_review`; extracted values matched the fixture.
- **Usage:** preparation made no provider request. Recovery made exactly **one reported-priced provider call**, estimated at **USD 0.004400250**, producing one extraction run and exactly one committed page reservation/debit, with zero reserved pages or unknown-cost attempts. This is token-pricing evidence, not a settled invoice.
- **Retention:** with the existing 30-day setting unchanged, only that synthetic document's creation time was backdated 31 days at **08:38:13.115 UTC**. Cron succeeded at **08:39:00.021 UTC**, its worker request returned 202 without timeout, and completion was observed at **08:39:04.229 UTC**. The document and its one extraction run were absent; no file-deletion intent remained. An authenticated original-file check returned `NoSuchKey` (HTTP 400), confirming object absence rather than relying on an expired signed URL.
- **Preservation:** the committed page reservation, one page debit and priced AI-attempt record/cost remained unchanged after deletion. The fixture had zero corrections, approvals and exports before retention, so this run does **not** prove deletion of those absent artifact types.
- **Original demo unaffected:** the final read-only check at **08:42:12.965 UTC** verified the same deployed revision, healthy readiness and the original demo invoice still approved. Its private PDF and approved CSV were byte-identical; its workspace remained at one processed page, zero reserved, nine remaining and one document. This check added no accounts or AI calls.

This verifies one bounded synthetic expired-lease recovery and retention path, not every failure mode, an actual process-kill experiment, backup restoration of the live service or universal invoice accuracy. [The worker procedure](PAPERWAKE-HOSTED-WORKER-VERIFICATION.md) records the executed variant and its limits.

### Billing boundary release and hosted readback

Deployed application revision `7dbbd644036874fa89571dc024f81c6dedae4962` was verified on the stable preview at **19:06–19:07 UTC on 10 November**. Its [sanitized release receipt](evidence/paperwake-billing-release-2026-11-10.json) records the local, CI, migration and hosted checks separately.

- Applied migration `049_paperwake_reservation_billing_mode.sql` to the hosted project and both isolated local databases. Hosted verification confirmed **40 applied migrations**, the new reservation billing-mode column, and unchanged denial of watchdog access to both runtime roles. No role or privilege changes were made.
- New paid work must match the active billing mode. Workers check the saved reservation and live lease before source access and provider dispatch. Valid accepted paid work retains its original reservation and operation-bound paid AI cap after cancellation or renewal; unrelated trial work cannot borrow that grant.
- Checkout now validates an active cancellation-enabled portal before creating billing state and requires explicit tax-exclusive pricing. Cancellation-only access remains available when signup pricing changes or is archived. These are controlled provider tests, not live Stripe acceptance.
- Hosted health/readiness returned 200 with database, storage and restore gate OK. Unauthenticated worker/diagnostics requests returned 401; authorized read-only diagnostics showed empty queues.
- The existing demo remained approved; its PDF and corrected CSV were byte-identical, and its usage remained unchanged. Private preview, mock billing and unconfigured signup policies remained in place. This readback created no accounts or extractions and did not wake the worker or call the AI provider.

The earlier browser, scheduled recovery and retention evidence remains tied to its recorded revisions above; it was not rerun on this release. Healthy readiness does not establish an operational backup.

### Actual hosted-source backup and inactive restore

After explicit owner approval, the root agent captured the actual Paperwake database and private originals into an encrypted local archive, then restored and verified it in a fresh dedicated database on the existing local PostgreSQL 17 test server. This used a Unix socket; no new server cluster was created and no existing local database was modified. The [sanitized receipt](evidence/paperwake-hosted-restore-2026-11-10.json) distinguishes this from the controlled CI fixture drills.

- Maintenance ran from **20:02:51 to 20:08:14 UTC on 10 November**. Only Paperwake's named worker schedule and two runtime connection limits were temporarily changed. Both runtime pooler connections returned the expected role-limit denial. Two idle runtime sessions were drained; all tracked writers and upload capabilities were absent, followed by a 310-second drain window exceeding the configured 300-second hosted function limit.
- Full capture included **64 tables, 99 rows, 40 migrations, one original PDF and the integration-encryption key**. Two optional object references were already absent; no staging-exclusion option was used and no unreferenced objects were omitted.
- The encrypted archive authenticated successfully. Restore and subsequent inactive verification passed at **20:08:48 UTC**, including binary table data, original-file bytes, permissions, row-level security, constraints and triggers. The pending restore marker remains; no restored application or worker was started or activated.
- Both runtime connection limits and the original cron active state were restored exactly. Separate checks verified both application users could reconnect, health/readiness were 200, the original demo remained approved, and its PDF matched the previous byte hash. These checks observed source revision `991682f8fb667e92c1d305ecc538b8c8661a4814`. No new extraction or AI call was made.

This proves a one-off recovery of the actual hosted synthetic dataset. The encrypted archive and recovery identity remain on this Mac; independent offsite storage, key custody, a backup schedule, retention and failure notifications remain outstanding. It does not prove a production failover, scale recovery or a recurring operational backup arrangement.

## Controlled automated checks

Focused backend, usage, account and frontend tests cover concurrent fixed-invoice setup, invalid input rejection, per-workspace isolation, saved revision conflicts, exact decimals/identifiers, formula-safe CSV, upload ownership/hash binding, quotas, retry accounting and billing period handling. Provider and storage doubles used by those unit/integration tests are distinct from the real-provider browser check above.

The dated local invoice-release manifest passed **468 tests**, with zero failures or skips, on the separate `paperwake_test` database. The subsequent hosted-bootstrap guard correction passed 13/13 PostgreSQL isolation checks; CI address-guard coverage increased the boundary group to 50/50. Typecheck and the Vercel package/isolated-bundle checks also passed locally. Broader Folio tests that assert unavailable products remain historical and must not be presented as current Paperwake release acceptance.

[GitHub CI for `e6e97f4`](https://github.com/rory-hayes/paperwake/actions/runs/42778974759) completed successfully on 10 November: **474/474 release tests, zero failures or skips**, typecheck/production packaging, isolated runtime/decoder checks, and the managed encrypted backup/restore drill all passed. The [sanitized CI receipt](evidence/paperwake-ci-2026-11-10.json) records the exact revision and scope. The restore drill used its own temporary PostgreSQL cluster and controlled storage; it does not establish production backup scheduling or a restore from the live service.

The subsequent [signup-policy release at `b0d5166`](https://github.com/rory-hayes/paperwake/actions/runs/42781567154) also passed the complete CI run: **480/480 tests, zero failures or skips**, production packaging, isolated runtime/decoder checks and all **29 named assertions** in the controlled managed restore drill. Its [separate sanitized receipt](evidence/paperwake-ci-signup-policy-2026-11-10.json) preserves the earlier release record. The six added tests cover the default application's configured signup policy, absent/invalid configuration, current acceptance and persisted/queued policy snapshots. This implements the runtime configuration path; no owner-approved terms were invented, installed or verified on the hosted app.

The [billing boundary release at `7dbbd64`](https://github.com/rory-hayes/paperwake/actions/runs/42881516039) passed **498/498 tests, zero failures or skips**, locally and in CI. Typecheck, production packaging and isolated runtime/decoder checks passed in both environments. CI also passed all **29 controlled managed restore assertions**. Added coverage checks billing-mode isolation, reservation and lease authority, cancellation/renewal continuity, operation-bound AI budgets, cancellation portal validation and explicit tax-exclusive pricing. This remains controlled-provider and controlled-restore evidence, not actual Stripe lifecycle or deployed-service backup acceptance.

## Stripe test connection, 10 November 2026

Deployment `dpl_ENfvGRwLjsn27DJFryb6PGpZp35M` used source `bf380c9c739e08bdc814bb072e4b0a4dca9659f1` and the isolated Paperwake testing sandbox. Read-only checks verified the owner account, active EUR 49/month tax-exclusive price, cancellation-enabled Portal, webhook configuration and hosted readiness. Private invitations remain required; mock billing is disabled.

An actual hosted browser Checkout completed a simulated payment. The signed webhook was processed by the worker and the synthetic account received `standard` / `test` with 500 pages available for **10 November 2026 21:09:36–10 December 2026 21:09:36 UTC**. The Portal initially scheduled cancellation for the period end; at that stage Stripe remained active and the allowance remained available. This did not activate live billing or charge real money. [Canonical Stripe test record](PAPERWAKE-STRIPE-TEST-2026-11-10.md).

Stripe redelivered the actual `checkout.session.completed` event at **21:22:40 UTC**. The endpoint returned HTTP 202 with `{received:true,duplicate:true}`; before/after readback showed unchanged plan, usage, subscription and event processing/count. The scheduled-cancellation update event completed at **21:23:01 UTC**. Final readback at **21:23:34 UTC** found all four fixture events completed, bound to the correct workspace and without errors; the current 500-page allowance remained available.

### Follow-on lifecycle, 10 November 2026

The same subscription was resumed through the Portal. A paid EUR 49 renewal rolled the app to the exact 10 December–10 January period. The next renewal failed (`past_due`, open invoice with EUR 49 due and zero paid), and the app removed the paid plan. Paying that same invoice restored Standard/test with a 500-page limit and the exact 10 January–10 February period at **21:38:40 UTC**. Advancing through scheduled cancellation ended the subscription at simulated 10 February 2027 21:09:36 UTC; the final **21:40:13.550 UTC** readback showed the stored subscription canceled and the app on Explore with ten previously unused lifetime evaluation pages. All 16 received events completed. [Ten-assertion lifecycle receipt](evidence/paperwake-stripe-lifecycle-2026-11-10.json).

The fixture consumed zero pages, so the hosted check proves period rollover, not spent-quota reset. The latter retains controlled-test coverage. Future paid periods correctly remained unavailable against real database time; database time and entitlements were not manually changed. Approved terms capture, tax behavior and live payment collection remain unverified. The global test-clock setting was removed at 21:40:51 UTC; replacement deployment `dpl_223TmN7E8e7wHa9HTbLQHAz79dBx` on the same source passed nine configuration, health and readiness checks at 21:43:00.260 UTC. The existing clock and canceled fixture were preserved. Prior invoice, account-boundary, recovery, retention and backup evidence remains tied to its separately recorded revisions.

## In progress / not yet proved

- Verified transactional email delivery for signup, verification and password recovery.
- Approved signup/Checkout terms capture, chosen tax behavior and correctly configured live billing. Test Checkout, signed-webhook reconciliation, period rollover, failed-renewal/same-invoice recovery, terminal cancellation and actual event replay are verified above; spent-quota reset remains controlled-test coverage only.
- Actual operator/support/policy configuration; no fictional business identity or tax registrations supplied.
- Commercially eligible hosting before paid pilots: the current Vercel account uses Hobby, which [Vercel limits to personal, non-commercial use](https://vercel.com/docs/plans/hobby). A suitable plan or hosting choice is required; no upgrade or purchase has been authorized or performed.
- Operational backup scheduling, independent offsite storage/key custody, retention and failure notifications. The one-off deployed-source restore is now verified above.
- Permissioned real customer samples, which the user will source.

## Release decision

Not yet paid-launch ready. The hosted preview's synthetic invoice workflow, account boundaries, duplicate accounting, seeded expired-lease recovery and document/run/original retention path are verified within the limits above. Actual Stripe test Checkout and the bounded renewal/failure/recovery/cancellation lifecycle now pass. Live/tax configuration, approved terms capture and unverified account-email delivery still prevent a complete paid-launch claim. Commercial hosting eligibility, operator-approved policies and operational backup acceptance also remain open. Do not start charging customers or describe the complete hosted service as ready until those checks pass. No customer outreach was sent.

## Operator safeguards

Private signup now works independently of mock billing. A separate atomic provider-cost circuit breaker accounts for failed and unknown attempts, independent of customer page allowance. It may pause work for operator review before all page credits are used. See `PAPERWAKE-ECONOMICS.md` for scope and limits.
