# MaintainFlow implementation (formerly Paperwake)

This is the separate user-owned application repository, renamed from Paperwake to MaintainFlow by the owner on 13 November 2026, seeded from Folio commit c97df310b5813e7dd483259b848ff472e9592815. The directory, database identifiers and provider project names retain Paperwake for compatibility. The original Folio directory must remain unchanged. The sibling `paperwake` checkout is unlicensed Supastarter source and must not be reused.

## Current scope

- Preserve Folio's visual styling and useful review controls; brand the product MaintainFlow.
- Invoice-only MVP: English digital supplier-invoice PDF upload, actual extraction, editable header/line-item review, saved corrections, explicit approval and CSV download.
- Navigation: Invoices and Settings. No generic document chooser, parser builder, bank statements, incoming email, image formats, splits, integrations, public API or automatic approval at launch. Preserve future implementation helpers where useful, but enforce launch boundaries on the server as well as the UI.
- Proposed commercial offer: EUR 49/month excluding applicable VAT, 500 processed pages, ten one-time evaluation pages, no automatic overage. Confirm full-allowance economics before claiming readiness. All displayed and server-side prices/limits must agree.
- Proposed bounds: 10 PDFs/batch, 10 MB/file, 5 pages/file, one flat table with at most 100 rows. Reject unsupported inputs clearly; do not silently truncate or fabricate success.
- Preserve exact identifiers, monetary values and saved corrections in approved CSV. Make invoice revision checks mandatory. Failed internal retries must not produce duplicate page charges.

## Delivery and verification

- The user authorized connecting/configuring the new Paperwake Supabase and Vercel projects and using the supplied Desktop OpenAI key for tests. Use only Paperwake targets; no existing unrelated apps/data/deployments.
- Never print credentials, put secrets in Git, browser-visible code, screenshots, URLs or artifacts. Local credentials belong in ignored files with restrictive permissions.
- Do not claim mocks, static previews, test billing or synthetic success prove live paid readiness. Keep an honest evidence checklist and distinguish live from simulated checks.
- Use the CUA browser tools for rendered interaction checks; backend tests may use HTTP/database clients. Verify actual hosted upload → extraction → correction → approval → CSV, account boundaries, relevant failures and billing before marking the goal complete.
- No outreach to prospects or actual customer charges are authorized by this implementation task. Prepare the product and materials, not customer communications.
- Work is shared across agents. Edit only assigned areas, coordinate shared contracts, and never revert another agent's work. Main agent owns deployment, secrets, migrations and final release.

Product roadmap: `../parseur-product-blueprint-2026-11-08/PAPERWAKE-DELIVERY-ROADMAP.md`.
