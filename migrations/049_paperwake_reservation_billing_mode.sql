-- Preserve the billing environment that admitted a paid processing job.
-- Historical paid reservations remain unknown and cannot authorize dispatch.
ALTER TABLE usage_reservations
  ADD COLUMN billing_mode text CHECK (billing_mode IN ('mock','test','live')),
  ADD CONSTRAINT usage_reservations_billing_mode_kind
    CHECK (allowance_kind='subscription' OR billing_mode IS NULL);
