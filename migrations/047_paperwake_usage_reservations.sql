-- Processing reserves capacity; only a saved reviewable candidate debits pages.
CREATE TABLE usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  job_id uuid UNIQUE REFERENCES jobs(id) ON DELETE SET NULL,
  pages integer NOT NULL CHECK (pages > 0),
  allowance_key text NOT NULL,
  allowance_kind text NOT NULL CHECK (allowance_kind IN ('trial','subscription')),
  period_start timestamptz,
  period_end timestamptz,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','committed','released')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((allowance_kind='trial' AND period_start IS NULL AND period_end IS NULL)
    OR (allowance_kind='subscription' AND period_start IS NOT NULL AND period_end > period_start))
);
CREATE INDEX usage_reservations_period ON usage_reservations(workspace_id,allowance_key,state);
CREATE INDEX usage_reservations_document ON usage_reservations(workspace_id,document_id) WHERE state='reserved';
ALTER TABLE usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON usage_reservations
  USING(workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid)
  WITH CHECK(workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON usage_reservations TO folio_app;
