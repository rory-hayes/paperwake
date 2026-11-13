# MaintainFlow rename and billing preparation

Owner decision: reuse the existing `maintainflow.io` domain and rename Paperwake to MaintainFlow. Existing visual styling and invoice-only scope are retained. No domain purchase, subscription upgrade, outreach or customer charge is part of this release.

## Application and domain

- Customer-facing website, navigation, authentication, review/export messaging, pricing and new account email templates use MaintainFlow.
- Account email remains `MaintainFlow <accounts@maintainflow.io>`, with the existing monitored reply-to. The approved HTML design and plain-text alternative are retained. Previously queued messages retain their original payloads for retry compatibility.
- `maintainflow.io` is attached to the existing invoice application project and verified. The application origin is set to `https://maintainflow.io` for the next deployment. No nameservers or unrelated DNS records were changed.
- Old web-page GET/HEAD requests on `paperwake-gamma.vercel.app` redirect to the same path/query on the canonical domain. API routes remain reachable at the legacy host for callback/monitor compatibility. Users sign in again on the new domain because sessions are host-scoped. Cookie/CORS protections are not widened.
- Repository name, package name, database IDs, saved parser/mapping IDs and legacy environment variable names remain unchanged. The original Folio checkout is untouched.
- Operator/business details remain blank at the owner's request. Existing preview/signup and live-checkout gates are retained.

## Stripe

- An isolated live **MaintainFlow Invoices** product has a **EUR 49/month** price, tax-exclusive, for **500 processed pages**. Existing unrelated products/prices are unchanged. There is no automatic overage or Stripe trial.
- The owner approved a restricted application key. The initial UI clipboard copy returned empty, so it was not usable. The owner separately approved replacing only that new unused key with identical permissions and immediate expiry. The replacement was saved privately with owner-only permissions and verified against the intended account.
- Read-only Stripe verification reports account details submitted, charges enabled and payouts enabled. This is account configuration evidence, not proof of a successful app payment.
- Dedicated live portal and webhook objects are prepared. The webhook is verified **disabled**. Live credentials/configuration are staged privately and are **not installed in the active application**.
- The existing sandbox product/price labels, portal return URL and test webhook URL use MaintainFlow and the canonical domain. Amounts, subscription/customer data and test clocks are unchanged.
- Hosted application billing remains **Stripe test mode**. No live Checkout, customer payment, refund or payout was performed. Operator policies, tax configuration decision and controlled live activation remain separate work.

## Invoice sample evidence

See [public corpus](MAINTAINFLOW-PUBLIC-INVOICE-CORPUS-2026-11-13.md) and [benchmark](MAINTAINFLOW-SAMPLE-BENCHMARK-2026-11-13.md). Fifteen public sample PDFs cover 11 English digital invoices, two scans and two negative/unsupported examples. Actual extraction exposed description omissions, partial tax selection and a currency-prefix issue. Fixed provider guidance addresses these cases; three targeted final examples matched 61/61 labelled fields, with required human review still present. Total estimated AI cost was USD 0.1326885.

This is a small, repetitive corpus and a focused retest, not a general accuracy guarantee or new hosted upload-to-CSV acceptance run. English-only scope is not a deterministic language gate. Permissioned customer invoices and spreadsheet requirements remain necessary for pilot fit.

## Verification boundary

Before release: 149 account/email tests, 58 billing tests, 31 controlled invoice/provider tests and frontend checks passed. Production packaging and isolated runtime checks are required again after final routing changes. Desktop and 390-pixel mobile branding were visually inspected; phone viewport width and scroll width both measured 390 pixels. No fresh account email was sent for the rename.

Final deployed revision, CI result and hosted checks are recorded in the private release receipt after deployment. Prior hosted invoice lifecycle, recovery and billing evidence retain their original revisions. Do not claim this rename makes the service paid-launch ready: operator/policy decisions, commercial hosting, operational backup/offsite arrangements, live billing acceptance and permissioned customer samples remain distinct gates.
