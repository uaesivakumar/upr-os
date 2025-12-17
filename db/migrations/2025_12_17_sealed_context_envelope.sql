-- ============================================================================
-- PRD v1.2 §2: Sealed Context Envelope - Database Schema
-- Created: 2025-12-17
--
-- This migration creates the audit log table for sealed context envelopes.
-- Per PRD §2.3: "Envelope hash is stored with audit logs"
-- ============================================================================

-- Envelope Audit Log: Track all SIVA invocations with envelope context
CREATE TABLE IF NOT EXISTS envelope_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Envelope identification
  envelope_hash VARCHAR(64) NOT NULL,  -- SHA256 hash of envelope
  envelope_version VARCHAR(20) NOT NULL,

  -- Context
  tenant_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  persona_id VARCHAR(10) NOT NULL,

  -- Sales context
  vertical VARCHAR(100) NOT NULL,
  sub_vertical VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL,

  -- Request context
  endpoint VARCHAR(255),
  method VARCHAR(10),
  correlation_id VARCHAR(100),

  -- Replay support (PRD §7)
  interaction_id UUID DEFAULT gen_random_uuid(),  -- For replay API
  evidence_snapshot_id UUID,  -- Reference to evidence snapshot
  output_hash VARCHAR(64),  -- Hash of SIVA output for replay verification

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_envelope_audit_hash ON envelope_audit_log(envelope_hash);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_tenant ON envelope_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_user ON envelope_audit_log(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_persona ON envelope_audit_log(persona_id);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_created ON envelope_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_interaction ON envelope_audit_log(interaction_id);
CREATE INDEX IF NOT EXISTS idx_envelope_audit_correlation ON envelope_audit_log(correlation_id);

-- Evidence Snapshots: Store evidence state for replay (PRD §7)
CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to envelope
  envelope_hash VARCHAR(64) NOT NULL,

  -- Snapshot content
  evidence_data JSONB NOT NULL,  -- Full evidence state at time of call
  evidence_ids TEXT[],  -- Array of evidence IDs included

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_snapshot_hash ON evidence_snapshots(envelope_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshot_created ON evidence_snapshots(created_at DESC);

-- Replay Log: Track replay attempts (PRD §7)
CREATE TABLE IF NOT EXISTS replay_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Original interaction
  original_interaction_id UUID NOT NULL,
  original_envelope_hash VARCHAR(64) NOT NULL,
  original_output_hash VARCHAR(64),

  -- Replay results
  replay_output_hash VARCHAR(64),
  outputs_match BOOLEAN,  -- Did replay produce same output?
  policy_gates_hit JSONB,  -- Which policy gates were triggered

  -- Metadata
  replayed_at TIMESTAMPTZ DEFAULT NOW(),
  replayed_by VARCHAR(100),
  replay_reason VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_replay_log_interaction ON replay_log(original_interaction_id);
CREATE INDEX IF NOT EXISTS idx_replay_log_envelope ON replay_log(original_envelope_hash);
CREATE INDEX IF NOT EXISTS idx_replay_log_match ON replay_log(outputs_match);

-- Comments
COMMENT ON TABLE envelope_audit_log IS 'PRD v1.2 §2.3: Stores envelope hash with audit logs for every SIVA invocation';
COMMENT ON TABLE evidence_snapshots IS 'PRD v1.2 §7: Stores evidence state for deterministic replay';
COMMENT ON TABLE replay_log IS 'PRD v1.2 §7: Tracks replay attempts and output verification';

COMMENT ON COLUMN envelope_audit_log.envelope_hash IS 'SHA256 hash of sealed envelope - used for integrity verification';
COMMENT ON COLUMN envelope_audit_log.interaction_id IS 'Unique ID for replay API: /replay/{interaction_id}';
COMMENT ON COLUMN envelope_audit_log.output_hash IS 'Hash of SIVA output for replay verification';

-- ============================================================================
-- End of Migration
-- ============================================================================
