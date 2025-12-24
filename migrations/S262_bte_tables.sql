/**
 * S262: BEHAVIORAL TELEMETRY ENGINE (BTE) v1 - Tables
 * Sprint: S262
 * Authorization: BTE/User Management Implementation Plan
 *
 * Creates tables for BTE signal storage and threshold configuration:
 * - bte_signals: Computed behavioral signals (18-month retention)
 * - bte_thresholds: Super Admin controlled thresholds
 *
 * GUARDRAILS:
 * - BTE is READ-ONLY for core tables (business_events, user_actions, workspace_state)
 * - bte_signals is computed output only
 * - bte_thresholds is Super Admin controlled only
 * - No auto-learning, no runtime mutation
 */

-- ============================================================
-- BTE_SIGNALS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS bte_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  -- Composite uniqueness for signal recomputation
  CONSTRAINT bte_signals_unique_signal UNIQUE (entity_type, entity_id, signal_type, version)
);

-- Indexes for efficient querying
CREATE INDEX idx_bte_signals_entity ON bte_signals(entity_type, entity_id);
CREATE INDEX idx_bte_signals_type ON bte_signals(signal_type);
CREATE INDEX idx_bte_signals_computed ON bte_signals(computed_at);
CREATE INDEX idx_bte_signals_entity_type_time ON bte_signals(entity_type, entity_id, signal_type, computed_at DESC);

-- Comments
COMMENT ON TABLE bte_signals IS 'Computed behavioral signals from BTE. 18-month retention. Recomputable from raw events.';
COMMENT ON COLUMN bte_signals.entity_type IS 'Type of entity (workspace, user, enterprise)';
COMMENT ON COLUMN bte_signals.entity_id IS 'UUID of the entity';
COMMENT ON COLUMN bte_signals.signal_type IS 'Signal type (decision_latency, idle_decay, nba_adoption_rate, etc.)';
COMMENT ON COLUMN bte_signals.signal_value IS 'Computed signal value';
COMMENT ON COLUMN bte_signals.version IS 'Signal computation version (for recomputation tracking)';

-- ============================================================
-- BTE_THRESHOLDS TABLE (Super Admin Only)
-- ============================================================

CREATE TABLE IF NOT EXISTS bte_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_key TEXT NOT NULL UNIQUE,
  value NUMERIC NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for key lookup
CREATE INDEX idx_bte_thresholds_key ON bte_thresholds(threshold_key);

-- Comments
COMMENT ON TABLE bte_thresholds IS 'BTE threshold configuration. Super Admin only. No auto-learning. All changes audited.';
COMMENT ON COLUMN bte_thresholds.threshold_key IS 'Unique threshold identifier (e.g., idle_decay_warning, nba_ignore_critical)';
COMMENT ON COLUMN bte_thresholds.value IS 'Threshold value';
COMMENT ON COLUMN bte_thresholds.version IS 'Version for tracking changes';
COMMENT ON COLUMN bte_thresholds.updated_by IS 'Super Admin who made the change';

-- ============================================================
-- DEFAULT THRESHOLDS (Initial Configuration)
-- ============================================================

INSERT INTO bte_thresholds (threshold_key, value, description, updated_by) VALUES
  -- Temporal thresholds
  ('decision_latency_warning_hours', 24, 'Warning threshold for decision latency (hours)', '00000000-0000-0000-0000-000000000000'),
  ('decision_latency_critical_hours', 72, 'Critical threshold for decision latency (hours)', '00000000-0000-0000-0000-000000000000'),
  ('idle_decay_warning_days', 3, 'Warning threshold for idle decay (days)', '00000000-0000-0000-0000-000000000000'),
  ('idle_decay_critical_days', 7, 'Critical threshold for idle decay (days)', '00000000-0000-0000-0000-000000000000'),

  -- Execution thresholds
  ('nba_adoption_warning_rate', 0.5, 'Warning threshold for NBA adoption rate', '00000000-0000-0000-0000-000000000000'),
  ('nba_adoption_critical_rate', 0.3, 'Critical threshold for NBA adoption rate', '00000000-0000-0000-0000-000000000000'),
  ('follow_through_warning_rate', 0.6, 'Warning threshold for follow-through rate', '00000000-0000-0000-0000-000000000000'),
  ('hesitation_index_warning', 3.0, 'Warning threshold for hesitation index', '00000000-0000-0000-0000-000000000000'),

  -- Demo thresholds
  ('demo_inactivity_expire_days', 14, 'Days of inactivity before demo expires', '00000000-0000-0000-0000-000000000000'),
  ('demo_nba_ignore_expire_rate', 0.8, 'NBA ignore rate that triggers demo expiry', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (threshold_key) DO NOTHING;

-- ============================================================
-- VALIDATION QUERIES (Run after migration)
-- ============================================================

-- A) Confirm tables exist:
--    \d+ bte_signals
--    \d+ bte_thresholds

-- B) Confirm thresholds seeded:
--    SELECT threshold_key, value FROM bte_thresholds ORDER BY threshold_key;

-- C) Confirm indexes exist:
--    \di *bte_signals*
--    \di *bte_thresholds*
