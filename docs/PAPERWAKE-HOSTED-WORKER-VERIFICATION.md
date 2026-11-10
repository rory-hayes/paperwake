# Hosted worker acceptance — verified synthetic run

Target: `https://paperwake-gamma.vercel.app`; private schema `paperwake`. The owner-authorized run completed on 10 November 2026 at revision `1592e3b15295c98c810032f8a61035103181bb17`. Always verify the actual deployed commit before any later procedure. This document is not permission to change platform functions, database roles, unrelated data or billing.

## Executed result and precise scope

The [sanitized combined receipt](evidence/paperwake-hosted-worker-2026-11-10.json) records the passed application-state checks and independently observed scheduler/HTTP correlation. The bounded fixture began with one synthetic document, no extraction run and zero page/AI usage. A private acceptance harness seeded an expired job lease; it did not kill a running process. After waiting out earlier invocations, cron recovered the job at attempt two without a manual wake. Exactly one priced provider request produced one run and one page debit, at an estimated USD 0.004400250.

Retention then backdated only that document by 31 days while keeping the 30-day retention setting. A separately correlated cron invocation removed the document, its one run and its original object; an authenticated check returned `NoSuchKey`. Page reservations/debits and the AI-attempt/cost record remained. No corrections, approvals or exports existed in this fixture, so their deletion was not demonstrated. Raw receipts and correlation screenshots stay private; no account identifiers or secrets are published.

A final read-only check verified that the earlier approved demo invoice, its original PDF and approved CSV were unchanged, including byte comparisons and its one-page usage balance. The deletion evidence is limited to the disposable fixture.

The manual SQL preparation template below starts from a previously completed upload and would add a second run/debit. It is an alternative procedure, not the exact initialization used in the accepted one-request fixture. Its guard conditions remain useful; do not read its expected counts as the measured result. The recorded run does not establish live-service backup recovery, email delivery, payments, all interruption modes or general extraction accuracy.

## What each check proves

- `/api/health`: app identity and deployed revision, not dependency health.
- `/api/ready`: database/schema, private storage and restore gate; cached up to 15 seconds.
- Authenticated `/api/internal/diagnostics`: bounded queue snapshot. Its `heartbeatVerified:false` and `queueEligibilityVerified:false` are intentional; it does not establish worker execution.
- Authenticated `POST /api/internal/worker`: `202 {accepted:true}` means Vercel accepted a `waitUntil` task, not that it finished. The task has a 210-second budget and reserves time before further claims.
- Cron SQL success is not HTTP success. Check the corresponding `net._http_response` status and fixture state.

The worker endpoint drains installation-wide queues and runs maintenance; it has **no workspace selector**. Run the mutation portions only in the private pre-customer deployment, after confirming no unrelated eligible work or expiring documents. Do not use this as a production chaos test. SQL preparation below addresses one named disposable workspace and one synthetic document; never substitute a customer account. Stop if unrelated work appears. Do not relax permissions or change global worker settings to make a check pass.

## 1. HTTP authentication and dependency probes

Supply `PAPERWAKE_PROBE_WORKER_SECRET` through the private execution environment. A monitor-only secret can instead be supplied as `PAPERWAKE_PROBE_MONITOR_SECRET` for checks without `--wake`. No secrets go into arguments, URLs, output, screenshots or this document. The script does not load environment files and fixes its destination to the owned host.

```sh
node scripts/probe-paperwake-hosted.mjs --probe --expected-revision=1592e3b
```

After the unrelated-work preflight, test the authenticated endpoint once if needed:

```sh
node scripts/probe-paperwake-hosted.mjs --probe --expected-revision=1592e3b --wake --ack-global-worker
```

Both commands verify unauthenticated worker and diagnostic requests return 401. They make no signup, billing or document mutations. The second command wakes the real global worker once. There is no automatic retry. A Vercel protection redirect/HTML response is a failure to resolve separately; never forward secrets to a redirected host.

## 2. Scheduler preflight (read-only, migration identity)

Install `deploy/paperwake-worker.sql` separately only after the endpoint works and its two Vault entries are configured. Inspect names/presence and lengths only; never select decrypted values or HTTP request headers.

```sql
SELECT jobid,jobname,schedule,active FROM cron.job
WHERE jobname='paperwake-worker-watchdog';
SELECT name,length(decrypted_secret)>=32 AS sufficient_length
FROM vault.decrypted_secrets WHERE name='paperwake_worker_secret';
SELECT name,decrypted_secret='https://paperwake-gamma.vercel.app/api/internal/worker' AS target_matches
FROM vault.decrypted_secrets WHERE name='paperwake_worker_url';
SELECT paperwake.worker_has_runnable_work() AS has_work;
SELECT has_function_privilege('paperwake_backend','paperwake.worker_has_runnable_work()','EXECUTE') AS backend,
       has_function_privilege('paperwake_tenant','paperwake.worker_has_runnable_work()','EXECUTE') AS tenant;
```

Expect one active one-minute job, the expected URL, a sufficient secret, and both runtime execution privileges false. With idle queues, no new HTTP request should appear solely because cron ran. Before adding the test job, require `has_work=false` and no customer workspaces/data. A predicate containing historical lanes is intentional: it is the reviewed durable-work predicate, while launch routes prevent creation of those unsupported workflows.

## 3. Recover a disposable interrupted extraction without a browser wake

Create a new account through normal signup, named exactly `Paperwake worker probe <unique nonce>`; save the exact workspace ID and name. Use only the built-in synthetic invoice button. Wait for its initial extraction to finish. This account must contain exactly one document, named `paperwake-synthetic-invoice.pdf`, with native text `SYNTHETIC EXAMPLE - NOT A REAL INVOICE`. Use no real customer data. Record its document ID, completed job ID, original storage key, SHA-256, page usage and AI attempt totals.

Close the app/browser tab and stop all mutation probes. Allow any already acknowledged hosted invocation to finish (up to its 210-second budget). Read-only GET/SQL observations do not wake workers. Confirm idle again, then prepare **one new job**; do not reset/reuse a completed job because its extraction run is immutable and `job_id` is unique.

Run this template once in the owned project's SQL Editor, replacing all four placeholders with the disposable fixture values and a new job UUID. It intentionally rejects placeholders/incorrect identity. It preserves the original successful run and creates a synthetic interrupted attempt using that job's exact saved config.

```sql
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
DO $owned_probe$
DECLARE
 w uuid:='REPLACE_WORKSPACE_UUID'; d uuid:='REPLACE_DOCUMENT_UUID';
 j uuid:='REPLACE_NEW_JOB_UUID'; expected_name text:='REPLACE_EXACT_PROBE_WORKSPACE_NAME';
 source_job paperwake.jobs%ROWTYPE; doc paperwake.documents%ROWTYPE; plan jsonb;
 used_pages integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text,0));
 SELECT x.plan INTO plan FROM paperwake.workspaces x
 WHERE x.id=w AND x.name=expected_name AND x.name LIKE 'Paperwake worker probe %'
   AND x.created_at>now()-interval '24 hours' FOR UPDATE;
 IF NOT FOUND OR plan->>'id'<>'explore' THEN RAISE EXCEPTION 'Not the fresh disposable trial workspace'; END IF;
 IF (SELECT count(*) FROM paperwake.documents WHERE workspace_id=w)<>1
 OR EXISTS(SELECT 1 FROM paperwake.jobs WHERE workspace_id=w AND state IN ('queued','processing'))
 THEN RAISE EXCEPTION 'Fixture is not one idle synthetic document'; END IF;
 SELECT * INTO doc FROM paperwake.documents WHERE id=d AND workspace_id=w
   AND name='paperwake-synthetic-invoice.pdf' AND mime_type='application/pdf' AND page_count=1
   AND source_text::text LIKE '%SYNTHETIC EXAMPLE - NOT A REAL INVOICE%' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Wrong synthetic document'; END IF;
 SELECT * INTO source_job FROM paperwake.jobs WHERE workspace_id=w AND document_id=d
   AND state='completed' ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initial real extraction has not completed'; END IF;
 SELECT coalesce(sum(pages),0) INTO used_pages FROM paperwake.usage_reservations
 WHERE workspace_id=w AND allowance_key='trial' AND state IN ('reserved','committed');
 IF used_pages+1>(plan->>'monthlyPages')::integer THEN RAISE EXCEPTION 'No trial capacity for owned retry'; END IF;
 INSERT INTO paperwake.jobs(id,workspace_id,document_id,schema_version_id,config,state,attempts,max_attempts,available_at,lease_owner,lease_until)
 VALUES(j,w,d,source_job.schema_version_id,source_job.config,'processing',1,2,now(),'paperwake-owned-recovery-probe',now()-interval '1 minute');
 INSERT INTO paperwake.usage_reservations(workspace_id,document_id,job_id,pages,allowance_key,allowance_kind)
 VALUES(w,d,j,1,'trial','trial');
 UPDATE paperwake.documents SET status='processing',error=NULL,updated_at=now() WHERE id=d AND workspace_id=w;
 INSERT INTO paperwake.audit_events(workspace_id,action,entity_id,metadata)
 VALUES(w,'operator.synthetic_recovery_probe',j,jsonb_build_object('documentId',d,'syntheticOnly',true));
END $owned_probe$;
COMMIT;
```

Do **not** send a manual worker wake now: that would weaken proof of cron recovery. The seed marks attempt one as synthetic and sets `max_attempts=2`, leaving at most one real provider attempt; a failure must not automatically admit a third attempt. Poll only the exact job/document, every 15 seconds for at most five minutes. The expected sequence is expired `processing` → `queued` → `processing` → `completed`, although polling may miss transient states. Require terminal `completed`, `attempts=2`, no live lease, exactly one new extraction run for the new job, exactly one committed reservation/debit, and a priced AI attempt for `(job,attempt=2)`. Success adds one synthetic page and one real provider request; the normal cost guard still applies. If the attempt fails or has unknown cost, stop and inspect; do not repeatedly resubmit or raise the budget.

Read-only evidence queries (replace the exact IDs):

```sql
SELECT id,state,attempts,error,lease_owner,lease_until,updated_at FROM paperwake.jobs
WHERE id='REPLACE_NEW_JOB_UUID' AND workspace_id='REPLACE_WORKSPACE_UUID';
SELECT id,job_id,model,created_at FROM paperwake.extraction_runs
WHERE job_id='REPLACE_NEW_JOB_UUID' AND workspace_id='REPLACE_WORKSPACE_UUID';
SELECT pages,state FROM paperwake.usage_reservations
WHERE job_id='REPLACE_NEW_JOB_UUID' AND workspace_id='REPLACE_WORKSPACE_UUID';
SELECT attempt,outcome,usage_state,cost_usd FROM paperwake.ai_usage_attempts
WHERE operation_id='REPLACE_NEW_JOB_UUID' AND workspace_id='REPLACE_WORKSPACE_UUID';
SELECT status,return_message,start_time,end_time FROM cron.job_run_details
WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='paperwake-worker-watchdog')
ORDER BY start_time DESC LIMIT 5;
SELECT id,status_code,timed_out,error_msg,created FROM net._http_response
ORDER BY created DESC LIMIT 5;
```

Require a correlated cron run and HTTP 202 after the synthetic intent timestamp; HTTP 401/403 or timeout is a failure even if cron SQL itself succeeded. Worker logs provide `core_worker_attempt` job ID/attempt/stage timing without invoice content. `202` and logs alone do not replace persisted result checks.

## 4. Retention and original-file removal

After successful recovery, record the synthetic document's **exact original storage key** again. Keep the normal 30-day retention setting. In one guarded transaction, require the same fresh named workspace, exact synthetic document, and no queued/processing jobs; backdate only that document's `created_at` to `now()-interval '31 days'`. Do not backdate the workspace, users, usage ledger, AI ledger, other documents or jobs, and do not change any global retention setting.

Wait for cron using read-only observations. Require all of the following:

- The exact document and every artifact type that existed in its recorded pre-retention snapshot are absent. An already-empty correction/approval/export table cannot prove deletion of that artifact type.
- No outstanding `file_deletions` row remains for that workspace and exact original key. A missing document row alone is insufficient.
- The exact key is absent from the private storage bucket; verify through authenticated object metadata/download or the owned Storage dashboard. An expired signed download link is not proof of deletion. Never delete an object manually to make acceptance pass.
- All previously committed page reservations/debits and corresponding AI attempt rows remain (their `document_id` can become null). The executed fixture had one committed page; the alternative two-extraction procedure would have two. Retention must not refund consumed pages or reset provider spend.

Retention runs at most one eligible document per hosted maintenance invocation. A storage deletion retry can need a later cron wake. If the five-minute observation window expires, record pending state and inspect private diagnostics rather than mutating unrelated data.

Leave the disposable account and its audit/usage receipts in place for evidence. No workspace-wide cleanup or deletion is part of this procedure. Record deployed commit, times, exact owned IDs, HTTP statuses, final job/reservation state, storage-absence verification and limitations. This proves synthetic hosted recovery/retention; it does not prove backup restore, email delivery, paid checkout or all real-invoice accuracy.
