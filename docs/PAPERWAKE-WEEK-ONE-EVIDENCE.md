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
- Installed the one-minute scheduler with its two required private Vault entries. Two idle ticks were observed with no runnable work. **This does not prove recovery of queued/expired work or retention execution.** Worker 202 also proves acceptance of background work, not its completion.

The browser receipt, read-only probe receipt and screenshot remain private local artifacts. No account identifiers, credentials or personal data are published here. Hosted tenant-boundary, duplicate-accounting, scheduled recovery and retention acceptance remain separate unfinished checks.

## Controlled automated checks

Focused backend, usage, account and frontend tests cover concurrent fixed-invoice setup, invalid input rejection, per-workspace isolation, saved revision conflicts, exact decimals/identifiers, formula-safe CSV, upload ownership/hash binding, quotas, retry accounting and billing period handling. Provider and storage doubles used by those unit/integration tests are distinct from the real-provider browser check above.

The dated local invoice-release manifest passed **468 tests**, with zero failures or skips, on the separate `paperwake_test` database. The subsequent hosted-bootstrap guard correction passed 13/13 PostgreSQL isolation checks; CI address-guard coverage increased the boundary group to 50/50. Typecheck and the Vercel package/isolated-bundle checks also passed locally. Broader Folio tests that assert unavailable products remain historical and must not be presented as current Paperwake release acceptance.

[GitHub CI for `e6e97f4`](https://github.com/rory-hayes/paperwake/actions/runs/42778974759) completed successfully on 10 November: **474/474 release tests, zero failures or skips**, typecheck/production packaging, isolated runtime/decoder checks, and the managed encrypted backup/restore drill all passed. The [sanitized CI receipt](evidence/paperwake-ci-2026-11-10.json) records the exact revision and scope. The restore drill used its own temporary PostgreSQL cluster and controlled storage; it does not establish production backup scheduling or a restore from the live service.

## In progress / not yet proved

- Hosted account-boundary and duplicate/page-accounting checks beyond the single-invoice browser path.
- Actual scheduled recovery of interrupted extraction and hosted retention/original-file deletion. See [the prepared worker verification procedure](PAPERWAKE-HOSTED-WORKER-VERIFICATION.md); preparation is not execution evidence.
- Verified transactional email delivery for signup, verification and password recovery.
- Stripe test checkout/webhooks/cancellation/renewal, then correctly configured live billing.
- Actual operator/support/policy configuration; no fictional business identity or tax registrations supplied.
- Operational backup scheduling and recovery evidence for the deployed service.
- Permissioned real customer samples, which the user will source.

## Release decision

Not yet paid-launch ready. The hosted preview's upload → actual extraction → saved corrections → explicit approval → CSV path is verified for a synthetic invoice. Mock billing and disabled email delivery do not establish customer account delivery or payment collection. Do not start charging customers or describe the complete hosted service as ready until the remaining operational and commercial checks pass. No customer outreach was sent.

## Operator safeguards

Private signup now works independently of mock billing. A separate atomic provider-cost circuit breaker accounts for failed and unknown attempts, independent of customer page allowance. It may pause work for operator review before all page credits are used. See `PAPERWAKE-ECONOMICS.md` for scope and limits.
