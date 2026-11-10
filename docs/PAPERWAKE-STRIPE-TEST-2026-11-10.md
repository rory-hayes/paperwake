# Paperwake Stripe test connection

Verified 10 November 2026. **Actual Stripe sandbox billing is connected; live payments remain disabled.** This replaces the preview's mock billing. It does not establish paid-launch readiness.

## Configuration

The owner authorized use of the signed-in Stripe account to configure Paperwake's pricing and connection. A separate **Paperwake testing** sandbox was created under the owner's account; unrelated accounts and live billing objects were untouched.

- One active Standard price: **EUR 49/month**, tax-exclusive, quantity one; **500 processed pages** per subscription period. The existing ten one-time evaluation pages remain application-managed. No metered overage or Stripe trial was added.
- Customer Portal: payment-method updates, invoice history and cancellation enabled; plan/quantity changes disabled. Cancellation is scheduled for period end.
- Signed snapshot webhook: `https://paperwake-gamma.vercel.app/api/billing/webhook`, pinned to `2026-08-26.dahlia` to match the installed Stripe SDK contract. The ten supported Checkout, subscription and invoice events are registered.
- Server secrets and object IDs installed in Paperwake's Vercel Production environment and the private local hosted configuration. Private invitation and preview remain enabled, Stripe mode is `test`, and mock billing is disabled. Automatic tax is disabled in this sandbox; this is not an assertion about the seller's tax obligations.
- A dedicated test clock was configured for the disposable fixture. It was not advanced during the initial Checkout/replay acceptance; the follow-on lifecycle below advanced it. The global `STRIPE_TEST_CLOCK_ID` setting was subsequently removed from Vercel Production and the private local hosted environment. The existing clock and canceled fixture remain preserved. Test clocks are never valid in live mode.

Deployment `dpl_ENfvGRwLjsn27DJFryb6PGpZp35M` reused source `bf380c9c739e08bdc814bb072e4b0a4dca9659f1` (application code remains `7dbbd644036874fa89571dc024f81c6dedae4962`). No application code, schema or role changes were required. Provider configuration, deployed revision, health and readiness checks passed.

## Observed customer flow

The existing disposable synthetic boundary account started with zero documents, zero processed pages and ten evaluation pages. The original demo account was not used for billing.

1. Opened Paperwake's Billing screen and selected **Test checkout**. Stripe displayed the Sandbox badge, Paperwake Standard and EUR 49 per month.
2. Used Stripe's documented test card with a synthetic name and the fixture's non-deliverable email. Checkout completed; Stripe's readback reported `complete`, `paid`, EUR 49 total and a paid invoice. No real funds moved.
3. Stripe delivered signed events; Paperwake's durable worker reconciled the actual subscription. The rendered UI, authenticated usage endpoint and database all showed **Standard / test / 500 pages available** for the exact Stripe period: **10 November 2026 21:09:36 UTC to 10 December 2026 21:09:36 UTC**. Returning from Checkout alone was not used as proof.
4. Opened the actual customer Portal from Paperwake and scheduled cancellation. The Portal displayed service ending 10 December. Stripe remained `active` and used an explicit `cancel_at` equal to the period end; `cancel_at_period_end` itself was false. Current-period access correctly remained at 500 pages.
5. Resent the actual completed Checkout event once through Stripe's Dashboard. The delivery at **21:22:40 UTC** returned **202** with `{ "received": true, "duplicate": true }`. Before/after readbacks showed unchanged plan, usage, subscription, event count and event processing; no duplicate allowance was granted.

At the initial acceptance's final **21:23:34 UTC** observation, all four received events were completed and workspace-bound, with no remaining recorded error: subscription created, invoice paid, Checkout completed and subscription updated. The invoice event completed on attempt two. The cancellation update completed on attempt one at 21:23:01, about 109 seconds after receipt; the exact cause of that asynchronous delay was not diagnosed. No manual worker wake or direct entitlement/database update was used.

The [sanitized acceptance receipt](evidence/paperwake-stripe-test-2026-11-10.json) records the checks without credentials, customer identifiers or session URLs. Detailed private readbacks remain in ignored `.local/stripe-test/`; screenshots remain in the chat's visualization directory. The initial snapshot taken while cancellation was still queued is retained privately and is not presented as completed acceptance.

## Follow-on lifecycle, 10 November 2026

The same subscription was resumed through the Portal, then the dedicated Stripe clock exercised renewal, a failed renewal, recovery of that same invoice and terminal cancellation. The [separate lifecycle receipt](evidence/paperwake-stripe-lifecycle-2026-11-10.json) records ten passing assertions on the same source/deployment; the initial receipt above remains unchanged.

| Observed UTC | Stripe result | Hosted Paperwake result |
| --- | --- | --- |
| 21:36:24 | New EUR 49 renewal invoice paid; period 10 December 2026–10 January 2027 | Standard/test, 500-page limit and exact new period; unavailable because the period is in the future |
| 21:37:36 | Next renewal `past_due`; open invoice, EUR 49 due and zero paid | Explore with the fixture's ten previously unused lifetime evaluation pages |
| 21:38:40 | Original test payment method paid that same invoice; subscription active | Standard/test, 500-page limit and exact 10 January–10 February 2027 period; still unavailable against real time |
| 21:40:13.550 | Subscription canceled and ended at simulated 10 February 2027 21:09:36 UTC | Stored subscription canceled; Explore with the same unused ten evaluation pages |

All 16 received events completed. The fixture retained zero documents, processed pages and reservations throughout: this proves period rollover, **not a spent-quota reset**. Spent-quota reset/preservation remains covered by controlled tests. Only Stripe simulated time advanced; database time and entitlements were not manually changed. Future periods correctly had `available:false` and zero currently remaining subscription pages. One automatic collection failure and explicit same-invoice recovery were tested; this is not exhaustive retry, authentication, refund, dispute or tax coverage. No real money moved.

At **21:40:51 UTC**, only the global `STRIPE_TEST_CLOCK_ID` setting was removed; remote environment-name readback confirmed its absence. Replacement deployment **`dpl_223TmN7E8e7wHa9HTbLQHAz79dBx`** reused source `bf380c9c739e08bdc814bb072e4b0a4dca9659f1`, reached READY and serves the stable alias. Nine configuration, health and readiness checks passed at **21:43:00.260 UTC**, with private preview, Stripe test mode and mock billing disabled preserved. The lifecycle receipt includes this cleanup. No new Checkout or customer was created for this configuration-only readback; the earlier lifecycle remains tied to its acceptance deployment.

## Remaining before live customers

- Owner-approved operator details and signup/Checkout policies, including actual terms-acceptance evidence. The operator name remains blank as requested; the sandbox Checkout did not capture approved terms.
- Chosen tax behavior and matching live configuration. The completed lifecycle is sandbox evidence; spent-quota reset/preservation has controlled-test coverage only.
- Dedicated sender configuration and actual signup/recovery email delivery. Resend shows `maintainflow.io` as Verified; support remains `roryh1@gmail.com`. Domain verification alone is not account-email acceptance.
- Commercially eligible hosting and recurring/offsite backup arrangements. Paid upgrades remain explicitly on hold.
- Permissioned real-invoice samples; synthetic success is not universal extraction-accuracy evidence.
- Matching live Stripe objects/keys and activated seller/payout configuration, followed by an explicit paid-launch decision. No live charge was made or authorized by this setup.

The prior 498-test CI/build result remains tied to its existing release. No product code changed here, so that suite and invoice extraction were not rerun. Validation for this change was actual provider readback and the hosted sandbox customer flow above.
