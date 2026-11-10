-- Prepared for the owned Paperwake Supabase project only. Review before applying.
-- Run as the Supabase SQL Editor migration identity AFTER Paperwake migrations.
-- Private schema: paperwake; runtime roles: paperwake_backend, paperwake_tenant.
-- Install only after the matching runtime is deployed and its authenticated worker is reachable.
-- This installs a conditional watchdog, not an always-on worker or paid service.
-- Create these two Vault secrets first (never commit values to this file):
--   paperwake_worker_url     https://<stable-deployment-host>/api/internal/worker
--   paperwake_worker_secret  same >=32-character random value as FOLIO_WORKER_SECRET
-- If deployment protection is enabled, permit this authenticated endpoint or use
-- a deployment protection bypass configured separately; a 401/403 must be fixed.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Refuse a partial rollout: the predicate requires every current queue column.
DO $paperwake_watchdog_schema$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM paperwake.schema_migrations WHERE name='049_paperwake_reservation_billing_mode.sql') THEN
  RAISE EXCEPTION 'Apply the reviewed Paperwake migrations through 049 before installing this watchdog.';
 END IF;
END $paperwake_watchdog_schema$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION paperwake.worker_has_runnable_work()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog AS $paperwake_work$
 -- Waking is a hint. The worker independently enforces FIFO, live authorization,
 -- attempt limits, leases and the shared concurrency cap before claiming work.
 WITH processing AS (
  SELECT workspace_id,count(*) running FROM (
   SELECT workspace_id FROM paperwake.jobs WHERE state='processing'
   UNION ALL SELECT workspace_id FROM paperwake.schema_suggestions WHERE state='processing'
   UNION ALL SELECT workspace_id FROM paperwake.split_suggestions WHERE state='processing'
  ) active GROUP BY workspace_id
 ), runnable AS (
  SELECT workspace_id FROM paperwake.jobs
   WHERE state='queued' AND NOT waiting_for_schema AND available_at<=now() AND attempts<max_attempts
  UNION ALL SELECT workspace_id FROM paperwake.schema_suggestions
   WHERE state='queued' AND available_at<=now() AND attempts<max_attempts
  UNION ALL SELECT workspace_id FROM paperwake.split_suggestions
   WHERE state='queued' AND available_at<=now() AND attempts<max_attempts AND expires_at>now()
    AND (write_until IS NULL OR write_until<=now())
 )
 SELECT
 EXISTS(SELECT 1 FROM runnable r JOIN paperwake.workspaces w ON w.id=r.workspace_id
   LEFT JOIN processing p ON p.workspace_id=r.workspace_id
   WHERE coalesce(p.running,0)<coalesce((w.plan->>'maxConcurrent')::int,2))
 OR EXISTS(SELECT 1 FROM paperwake.jobs WHERE state='processing' AND lease_until<now())
 OR EXISTS(SELECT 1 FROM paperwake.schema_suggestions WHERE state='processing' AND lease_until<now())
 OR EXISTS(SELECT 1 FROM paperwake.split_suggestions WHERE state='processing' AND lease_until<now())
 OR EXISTS(SELECT 1 FROM paperwake.webhook_deliveries d LEFT JOIN paperwake.integrations i ON i.id=d.integration_id
   WHERE (d.status='delivering' AND d.lease_until<now() AND (i.enabled OR d.attempts>=5))
   OR (i.enabled AND d.attempts<5 AND d.status IN ('queued','retry') AND d.next_attempt_at<=now()))
 OR EXISTS(SELECT 1 FROM paperwake.approvals a JOIN paperwake.extraction_runs r ON r.id=a.run_id
   JOIN paperwake.documents d ON d.id=r.document_id
   JOIN paperwake.integrations i ON i.workspace_id=a.workspace_id AND (i.parser_id IS NULL OR i.parser_id=d.parser_id)
   WHERE i.enabled AND a.created_at>=i.created_at
   AND (i.kind='google_sheets' OR (i.kind='webhook' AND
    (NOT (i.config ? 'events') OR (jsonb_typeof(i.config->'events')='array' AND (i.config->'events') ? 'document.approved'))))
   AND NOT EXISTS(SELECT 1 FROM paperwake.webhook_deliveries sent WHERE sent.integration_id=i.id AND sent.event_key='approval:'||a.id::text))
 -- Failure notifications are immutable journal episodes, not the document's
 -- current state. Match the worker's subscriptions and usable event identities;
 -- an already queued episode must not cause repeated idle wakes.
 OR EXISTS(SELECT 1 FROM paperwake.document_events e
   JOIN paperwake.documents d ON d.id=e.document_id AND d.workspace_id=e.workspace_id
   JOIN paperwake.integrations i ON i.workspace_id=e.workspace_id AND (i.parser_id IS NULL OR i.parser_id=d.parser_id)
   WHERE e.state='failed' AND e.operation_id IS NOT NULL
   AND (e.phase='processing' OR (e.phase='export'
    AND e.details->>'format' IN ('csv','xlsx','json')
    AND e.details->>'runId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND e.details->>'approvalId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
   AND i.enabled AND i.kind='webhook' AND e.created_at>=i.created_at
   AND jsonb_typeof(i.config->'events')='array'
   AND (i.config->'events') ? (CASE e.phase WHEN 'processing' THEN 'document.extraction_failed' WHEN 'export' THEN 'document.export_failed' END)
   AND NOT EXISTS(SELECT 1 FROM paperwake.webhook_deliveries sent WHERE sent.integration_id=i.id AND sent.event_key='document-event:'||e.id::text))
 -- Wake hints do not enable billing. The worker independently enforces mock
 -- configuration and the signed event's test/live mode before provider work.
 OR EXISTS(SELECT 1 FROM paperwake.provider_events p WHERE
   ((p.status='processing' AND p.lease_until<now()) OR
    (p.attempts<5 AND p.status IN ('queued','retry') AND p.next_attempt_at<=now())))
 OR EXISTS(SELECT 1 FROM paperwake.file_deletions WHERE status='pending' AND available_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.documents d JOIN paperwake.workspaces w ON w.id=d.workspace_id
   WHERE d.created_at<now()-((w.settings->>'retentionDays')::integer*interval '1 day')
   AND NOT EXISTS(SELECT 1 FROM paperwake.jobs j WHERE j.document_id=d.id AND j.state IN ('queued','processing')))
 OR EXISTS(SELECT 1 FROM paperwake.intake_files i WHERE lease_expires_at<now()-interval '1 hour'
   AND ((split_attempt_id IS NULL AND archive_attempt_id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM paperwake.file_deletions f WHERE f.workspace_id=i.workspace_id AND f.storage_key=i.storage_key)))
 OR EXISTS(SELECT 1 FROM paperwake.direct_uploads WHERE state<>'cleaned' AND cleanup_after<now()
   AND (finalize_lease_until IS NULL OR finalize_lease_until<now()))
 -- Source cleanup also runs for cancelled/ready/failed suggestions. Live writers
 -- and processing leases protect their objects until the applicable lease ends.
 OR EXISTS(SELECT 1 FROM paperwake.split_suggestions
   WHERE ((source_storage_key IS NOT NULL AND (expires_at<=now() OR state='cancelled'))
    OR (staging_storage_key IS NOT NULL AND staging_expires_at<=now()))
   AND (write_until IS NULL OR write_until<=now()) AND (lease_until IS NULL OR lease_until<=now()))
 -- Registration/verification/recovery request rows must survive a failed wake.
 -- Expired requests are included because the email lane performs their cleanup.
 OR EXISTS(SELECT 1 FROM paperwake.account_registration_requests)
 OR EXISTS(SELECT 1 FROM paperwake.email_verification_requests)
 OR EXISTS(SELECT 1 FROM paperwake.account_recovery_requests)
 OR EXISTS(SELECT 1 FROM paperwake.account_email_outbox
   WHERE (state='pending' AND available_at<=now()) OR (state='sending' AND lease_until<=now())
    OR (state IN ('pending','sending') AND expires_at<=now()) OR finished_at<now()-interval '7 days')
 OR EXISTS(SELECT 1 FROM paperwake.invitation_email_outbox
   WHERE (state='pending' AND available_at<=now()) OR (state='sending' AND lease_until<=now())
    OR (state IN ('pending','sending') AND expires_at<=now()))
 OR EXISTS(SELECT 1 FROM paperwake.invitation_email_outbox old
   WHERE old.finished_at<now()-interval '7 days'
    AND EXISTS(SELECT 1 FROM paperwake.invitation_email_outbox newer
     WHERE newer.invitation_id=old.invitation_id AND newer.created_at>old.created_at))
 OR EXISTS(SELECT 1 FROM paperwake.account_recovery_tokens WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.email_verification_tokens WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.account_registration_limits WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.email_verification_limits WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.account_recovery_limits WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.invitation_email_limits WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM paperwake.account_security_events WHERE created_at<now()-interval '90 days');
$paperwake_work$;
REVOKE ALL ON FUNCTION paperwake.worker_has_runnable_work() FROM PUBLIC,paperwake_tenant,paperwake_backend;

-- Named scheduling is idempotent: re-running updates this job, not a duplicate.
SELECT cron.schedule('paperwake-worker-watchdog','* * * * *',$paperwake_cron$
 SELECT net.http_post(
   url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='paperwake_worker_url'),
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
     (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='paperwake_worker_secret')),
   body:='{}'::jsonb,
   timeout_milliseconds:=15000
 ) WHERE paperwake.worker_has_runnable_work()
 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='paperwake_worker_url' AND decrypted_secret ~ '^https://[^/]+/api/internal/worker$')
 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='paperwake_worker_secret' AND length(decrypted_secret)>=32);
$paperwake_cron$);
COMMIT;

-- Verification (does not display decrypted secrets):
-- SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='paperwake-worker-watchdog';
-- SELECT status,return_message,start_time,end_time FROM cron.job_run_details
--   WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='paperwake-worker-watchdog') ORDER BY start_time DESC LIMIT 5;
-- SELECT id,status_code,timed_out,error_msg,created FROM net._http_response ORDER BY created DESC LIMIT 5;
-- SELECT paperwake.worker_has_runnable_work();
-- A successful cron SQL invocation alone does not prove the HTTP response or queue recovery.
-- Rollback scheduler only (preserves queue/data):
-- SELECT cron.unschedule('paperwake-worker-watchdog');
