-- ============================================================
-- S267: AUDIT & SAFETY (GDPR)
-- ============================================================
-- Migration for comprehensive audit logging, soft delete,
-- hard purge, and replay safety.
--
-- NON-NEGOTIABLES:
-- - Audit every authority mutation
-- - Soft delete first, hard purge later
-- - Purge must not break replay
-- - Least visibility (no raw logs by default)
-- - No behavior change (audit ≠ control)
-- ============================================================

-- ============================================================
-- F1: AUDIT LOG (AUTHORITATIVE)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO: Actor identity
  actor_user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ENTERPRISE_ADMIN', 'USER', 'SYSTEM')),
  enterprise_id UUID,  -- NULL for SUPER_ADMIN cross-enterprise actions

  -- WHAT: Action details
  action TEXT NOT NULL,  -- CREATE_USER, DISABLE_USER, BIND_PERSONA, etc.
  target_type TEXT NOT NULL,  -- user, persona, demo, threshold, etc.
  target_id UUID,  -- NULL for aggregate operations

  -- RESULT
  success BOOLEAN NOT NULL,
  reason TEXT,  -- Denial reason or success notes

  -- CONTEXT
  metadata JSONB DEFAULT '{}',  -- Additional context (intent, IP, etc.)

  -- WHEN
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for actor queries (who did what)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id, timestamp DESC);

-- Index for target queries (what happened to X)
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id, timestamp DESC);

-- Index for enterprise scoping
CREATE INDEX IF NOT EXISTS idx_audit_log_enterprise ON audit_log(enterprise_id, timestamp DESC);

-- Index for action type queries
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, timestamp DESC);

-- Index for success/failure filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_success ON audit_log(success, timestamp DESC);

-- ============================================================
-- F2: DELETION SEMANTICS - Status Extensions
-- ============================================================

-- Add deleted_at columns for soft delete tracking
-- These are ADDED to existing tables, not replacing status

ALTER TABLE os_user_identities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE enterprises
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Purge configuration table
CREATE TABLE IF NOT EXISTS purge_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

-- Insert default purge configurations
INSERT INTO purge_config (config_key, config_value, description) VALUES
  ('soft_delete_window_days', '90', 'Days before soft-deleted records can be hard purged'),
  ('bte_signal_retention_months', '18', 'Months to retain BTE signals before purge'),
  ('audit_log_retention_months', '84', 'Months to retain audit logs (7 years for compliance)'),
  ('purge_batch_size', '1000', 'Records per purge batch to avoid long locks'),
  ('purge_enabled', 'false', 'Master switch for hard purge jobs')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- F2: DELETION TRIGGERS - Deny Access After Soft Delete
-- ============================================================

-- Function to check if entity is soft-deleted
CREATE OR REPLACE FUNCTION check_not_deleted()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify deleted record: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to os_user_identities (prevent updates to deleted records)
DROP TRIGGER IF EXISTS prevent_deleted_user_update ON os_user_identities;
CREATE TRIGGER prevent_deleted_user_update
  BEFORE UPDATE ON os_user_identities
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL)
  EXECUTE FUNCTION check_not_deleted();

-- SOFT DELETE SEMANTICS:
-- - deleted_at IS NOT NULL = soft deleted (authoritative marker)
-- - Status is NOT changed (avoids enum issues)
-- - All access checks MUST filter: WHERE deleted_at IS NULL
-- - deleted_by tracks who initiated the deletion

-- ============================================================
-- F2: PURGE JOB TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS purge_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,  -- 'user', 'bte_signals', 'workspace'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  records_processed INTEGER DEFAULT 0,
  records_purged INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'DRY_RUN_COMPLETE')),
  error_message TEXT,
  initiated_by UUID NOT NULL,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_purge_jobs_status ON purge_jobs(status, started_at DESC);

-- ============================================================
-- F3: EXPORT TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS export_requests (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL,
  enterprise_id UUID,  -- Scoped exports
  export_type TEXT NOT NULL,  -- 'user_data', 'audit_log', 'bte_signals'
  intent TEXT NOT NULL,  -- Why this export is needed
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'COMPLETED', 'EXPIRED')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  record_count INTEGER,
  file_path TEXT,  -- Encrypted storage location
  expires_at TIMESTAMPTZ,  -- Auto-expire downloads
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_requests_requester ON export_requests(requester_id, created_at DESC);

-- ============================================================
-- F3: RATE LIMITING FOR SENSITIVE READS
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,  -- 'drill_down', 'export', 'bulk_read'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  allowed BOOLEAN NOT NULL,
  limit_config TEXT  -- Which limit was applied
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_user_action ON rate_limit_log(user_id, action, timestamp DESC);

-- Cleanup old rate limit entries (keep 24 hours)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_log WHERE timestamp < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- F4: REPLAY SAFETY - Immutable business_events Protection
-- ============================================================

-- Ensure business_events can NEVER be deleted
CREATE OR REPLACE FUNCTION prevent_business_events_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'business_events are IMMUTABLE and cannot be deleted. This is a GDPR-compliant audit trail.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_business_events_delete ON business_events;
CREATE TRIGGER protect_business_events_delete
  BEFORE DELETE ON business_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_business_events_delete();

-- Ensure business_events cannot be updated
CREATE OR REPLACE FUNCTION prevent_business_events_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'business_events are IMMUTABLE and cannot be updated.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_business_events_update ON business_events;
CREATE TRIGGER protect_business_events_update
  BEFORE UPDATE ON business_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_business_events_update();

-- ============================================================
-- COMPLETE
-- ============================================================

-- Migration complete message
DO $$
BEGIN
  RAISE NOTICE 'S267 Migration Complete: Audit & Safety (GDPR)';
  RAISE NOTICE '  - audit_log table created';
  RAISE NOTICE '  - Soft delete columns added';
  RAISE NOTICE '  - Purge configuration initialized';
  RAISE NOTICE '  - Export tracking enabled';
  RAISE NOTICE '  - Rate limiting infrastructure ready';
  RAISE NOTICE '  - business_events protected from deletion';
END $$;
