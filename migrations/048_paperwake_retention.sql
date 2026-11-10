-- New Paperwake accounts keep source documents for at most 30 days.
ALTER TABLE workspaces ALTER COLUMN settings SET DEFAULT '{"retentionDays":30,"notifications":false}'::jsonb;
UPDATE workspaces SET settings=jsonb_set(settings,'{retentionDays}','30'::jsonb) WHERE (settings->>'retentionDays')::integer>30;
