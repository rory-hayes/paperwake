# MaintainFlow readiness follow-up

This is additional implementation and acceptance evidence, not a paid-launch declaration. Business/operator details remain blank at the owner's request; paid hosting purchases and live payment activation remain deferred.

## Hosted public invoice workflow

On deployed source `6d2f8c05cb3d2cbdfc32c3c76811c8e8095968ea`, one CC0 FileDone fictional supplier invoice passed 22 checks through the existing hosted test account at `https://maintainflow.io`. The normal signed upload went to the app's private Supabase bucket; the normal hosted worker completed extraction without a manual wake. All six rows and complete descriptions were retained under invoice prompt v2.

The missing ISO currency blocked approval. Test review explicitly selected INR from the source's rupee context and entered the artificial product code `000001` to test preservation; that code is a deliberate test correction, not a claim about the original invoice. Saved corrections survived reload, a stale revision was rejected, approval succeeded, and downloaded CSV contained the reviewed currency and exact leading-zero code across six rows. Replayed finalization returned the original job/document; repeated CSV bytes were identical. Exactly one evaluation page was consumed, no reservation remained, and reported additional model cost was USD 0.00660075. No email, real payment or account creation occurred.

This covers one complete hosted HTTP workflow, not new-signup/email delivery or broad invoice accuracy. Its original v2 evidence is kept distinct from the subsequent [v3 language assessment](MAINTAINFLOW-INVOICE-LANGUAGE-ASSESSMENT-2026-11-13.md). Private source/result and mutation-intent records are in `.local/maintainflow-hosted-sample-20261113/`.

## Protection for unsaved invoice corrections

The invoice review now asks before leaving a changed draft through internal navigation, browser history or sign-out. A successful save or loading the latest saved values removes protection; failed actions preserve it. A native `beforeunload` warning covers user-initiated reload/closing when supported by the browser. Draft values are not added to persistent browser storage.

React Router's supported data-router wrapper enables navigation blocking around the existing route tree. Sign-out requests are deferred until the user confirms. The native unload guard is released only after successful logout, immediately before the existing hard navigation. Bulk CSV wording now explicitly says it applies to approved invoices on the current page.

Eighteen focused tests passed, including dirty/clean comparisons, exact identifier/decimal scale, stale/saved revisions, internal and history navigation, unload behavior, and sign-out success/failure ordering. Local Chrome verification with an existing synthetic account confirmed:

- Keep editing retained the draft after sidebar navigation and Back.
- Chrome's actual Reload toolbar button displayed its native warning; Cancel retained the draft. The automation reload API did not surface that warning and was not used as evidence of user-initiated reload protection.
- Cancelling sign-out retained the account and draft; confirming discard completed sign-out with no second native warning.
- Explicit discard navigated and did not save the discarded text.
- A successful correction save allowed navigation without a warning.
- An invalid numeric draft could be saved for further review, but approval was blocked. The original valid value was restored; this was not misreported as a failed-save test.

Failed-save/failed-logout and stale-server cases retain controlled-test evidence; the browser check did not deliberately break the hosted network or modify another user's data. No browser console errors were observed. Local evidence is in `.local/maintainflow-readiness-20261113/`.

## Backup tooling

[Backup PR 1](https://github.com/rory-hayes/paperwake/pull/1), exact head `27983a3`, passed [CI run 43500154753](https://github.com/rory-hayes/paperwake/actions/runs/43500154753), including the v3 required-original-only capture and exact inactive restore against controlled private-storage transport. The PR is ready for review and remains unmerged. Existing unrelated working-tree backup changes were not included in this application release.

This proves the bounded tooling fixture, not recurring offsite protection. No schedule, independent destination/key custody, retention or missed-run alert has been activated.

## Still required before paid launch

Actual operator/policy details and tax decisions, commercially eligible hosting, operational backups and independent key custody, controlled live billing acceptance, and permissioned representative customer invoices remain open. The application stays invitation-only with Stripe test mode. No prospect outreach is authorized or sent.
