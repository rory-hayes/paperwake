# Paperwake account-email acceptance

Verified on 11 November 2026. **The dedicated Resend sender is configured, and all four expected account emails reached the authorized Gmail inbox.** Signup verification, resend and password-reset behavior passed within the scope below. This does not establish paid-launch readiness.

## Configuration and authorized scope

The owner approved a dedicated **Sending access** key restricted to the already-verified `maintainflow.io` domain, the sender `accounts@maintainflow.io`, and up to six signup/reset messages to their Gmail inbox and dedicated Paperwake aliases. The app renders the sender as `Paperwake <accounts@maintainflow.io>`. Credentials remain server-only and private; unrelated keys and DNS records were unchanged.

Account mail and required verification for new signups are enabled. Deployment `dpl_8hWBL6YcF47BzjMHnKHYUkkUvsPm` uses source `d9753f37046cea443b5ba057682ef83d232c58f9` at the existing stable preview URL. Private invitations and Stripe test billing remain in place. The current sender has no Reply-To header; the separately displayed support email is not an automatic reply destination.

Before enabling delivery, the read-only preflight at **19:02:55 UTC** found all seven aggregate counts empty: outstanding account-mail states, registration/recovery/verification requests and legacy invitation-mail states. Acceptance uses one fresh synthetic account and one explicitly permitted Gmail alias. It does not send to existing synthetic preview accounts.

## Observed flow

- Fresh-account initialization and queued signup passed. Signup returned 202 without a session; a read-only check then confirmed that the newly created account required verification and remained unverified.
- Correct-password sign-in was rejected while unverified. Verification resend was requested after the cooldown.
- Both verification messages reached the Gmail inbox, at **19:08:04** and **19:10:04 UTC**.
- The received resend link was successfully used through the authenticated-origin HTTP flow. Verified sign-in succeeded; both the earlier verification link and the consumed resend link were rejected afterward.
- The reset message reached the inbox at **19:12:03 UTC**. The user completed the reset separately at **19:12:40.768 UTC**. Read-only account evidence recorded one completed reset, one revoked session and one invalidated token; the automatic changed-password notice reached the inbox at **19:13:02 UTC**.
- The scripted reset stopped before its mutation intent because the old session had already been revoked. That failed attempt is preserved; it is not reported as an automated reset success.
- Subsequent reconciliation passed at **19:17:02.711 UTC**: the old session and old password returned 401, the user-supplied current password signed in successfully, the consumed reset token returned 400, and the test session was logged out. The negative token check reused the supplied current password and generated no new email.
- Final observation at **19:17:03.971 UTC** reported the completed flow, exactly four provider-accepted messages, and zero outstanding request rows, fixture sessions or fixture tokens. Gmail independently showed all four messages in the inbox, with SPF, DKIM and DMARC passing for each.

The [sanitized acceptance receipt](evidence/paperwake-email-acceptance-2026-11-11.json) records twelve passing checks without credentials, recipient addresses, account/message identifiers or token URLs. Received email links, credentials, private HTTP traces and Gmail evidence remain in ignored owner-only files. Agent verification and reconciliation actions used HTTP; the password reset itself was completed separately by the user. The browser separately rendered both received link screens, removed their token fragments and rejected the consumed verification link. The agent did not observe the user’s reset submission or complete the entire journey through rendered browser forms. A later browser sign-in using the updated password reached the Invoice workspace, and the verification screen displayed “Your email address is verified.”

### Local copy follow-on

After the acceptance above, three inherited API-key references were removed from the verification/reset screens because Paperwake does not expose API-key management at launch. Sixteen focused UI tests and the production build passed locally; the full release suite was not rerun locally for this copy correction. This is a local follow-on awaiting its own release record; no new deployed revision or repeated hosted acceptance is implied here.

## Scope and remaining gates

The flow used **four messages within the six-message authorization**: initial verification, verification resend, password reset and the automatic changed-password notice. The helper journals email-producing requests before dispatch and never automatically retries an ambiguous response; the separately triggered notice was reconciled into the same four-message accounting. Provider API acceptance and actual Gmail inbox delivery were observed separately. The helper used read-only database observations and normal account HTTP routes, without direct SQL writes, manual worker wakes, extractions or AI calls.

The hosted configuration acceptance required no product-code or schema changes, live payment activation or customer outreach. The later local copy correction is recorded separately above. Expired-link behavior retains controlled-test coverage; the hosted run did not wait for token expiry or prove deliverability to other mail providers. Required verification applies to newly created accounts and does not retroactively relabel earlier preview accounts. Operator identity and approved policies, live/tax setup, commercially eligible hosting, recurring/offsite backups and permissioned real-invoice samples remain open. Earlier invoice, Stripe, recovery, retention and backup evidence retains its original revisions.
