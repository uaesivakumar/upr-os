-- ============================================================================
-- SALES-BENCH TRACE PERSISTENCE (Phase 1.5 Critical)
-- ============================================================================
-- Authority: OS
-- Visibility: Super Admin + Governance
--
-- REQUIREMENT: Trace data must be persisted per scenario result.
-- An ephemeral trace is unacceptable for governance, audit, replay, or
-- future human validation. This is a hard blocker.
--
-- All fields are APPEND-ONLY - no updates allowed after initial insert.
-- ============================================================================

-- Add trace columns to sales_bench_run_results table
-- These columns store the complete audit trail for each scored scenario

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS interaction_id UUID,
ADD COLUMN IF NOT EXISTS envelope_sha256 VARCHAR(64),
ADD COLUMN IF NOT EXISTS envelope_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS persona_id UUID,
ADD COLUMN IF NOT EXISTS persona_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS policy_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS model_slug VARCHAR(100),
ADD COLUMN IF NOT EXISTS model_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS routing_decision JSONB,
ADD COLUMN IF NOT EXISTS capability_key VARCHAR(100),
ADD COLUMN IF NOT EXISTS router_decision JSONB,
ADD COLUMN IF NOT EXISTS tools_allowed JSONB,
ADD COLUMN IF NOT EXISTS tools_used JSONB,
ADD COLUMN IF NOT EXISTS policy_gates_evaluated JSONB,
ADD COLUMN IF NOT EXISTS policy_gates_hit JSONB,
ADD COLUMN IF NOT EXISTS evidence_used JSONB,
ADD COLUMN IF NOT EXISTS tokens_in INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_out INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_estimate DECIMAL(10,6) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS cost_actual DECIMAL(10,6),
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS risk_score DECIMAL(4,3),
ADD COLUMN IF NOT EXISTS escalation_triggered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS refusal_reason_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS decision_summary TEXT,
ADD COLUMN IF NOT EXISTS replay_of_interaction_id UUID,
ADD COLUMN IF NOT EXISTS replay_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS replay_deviation_reason TEXT,
ADD COLUMN IF NOT EXISTS signature VARCHAR(128),
ADD COLUMN IF NOT EXISTS signature_status VARCHAR(20) DEFAULT 'VALID',
ADD COLUMN IF NOT EXISTS code_commit_sha VARCHAR(40),
ADD COLUMN IF NOT EXISTS siva_version VARCHAR(50);

-- Create index on interaction_id for replay lookups
CREATE INDEX IF NOT EXISTS idx_run_results_interaction_id
ON sales_bench_run_results(interaction_id);

-- Create index on persona_id for persona-based queries
CREATE INDEX IF NOT EXISTS idx_run_results_persona_id
ON sales_bench_run_results(persona_id);

-- Create index on envelope_sha256 for integrity verification
CREATE INDEX IF NOT EXISTS idx_run_results_envelope_sha256
ON sales_bench_run_results(envelope_sha256);

-- Comment on columns for documentation
COMMENT ON COLUMN sales_bench_run_results.interaction_id IS 'Unique identifier for this interaction (for replay)';
COMMENT ON COLUMN sales_bench_run_results.envelope_sha256 IS 'SHA-256 hash of sealed context envelope';
COMMENT ON COLUMN sales_bench_run_results.persona_id IS 'OS persona UUID that governed this interaction';
COMMENT ON COLUMN sales_bench_run_results.capability_key IS 'SIVA capability invoked (e.g., score_company)';
COMMENT ON COLUMN sales_bench_run_results.router_decision IS 'Model router decision with outcome and reasoning';
COMMENT ON COLUMN sales_bench_run_results.tools_allowed IS 'Canonical list of 12 tools allowed for this persona';
COMMENT ON COLUMN sales_bench_run_results.tools_used IS 'Ordered list of tools executed with hashes and duration';
COMMENT ON COLUMN sales_bench_run_results.policy_gates_evaluated IS 'All policy gates that were evaluated';
COMMENT ON COLUMN sales_bench_run_results.policy_gates_hit IS 'Policy gates that triggered (blocked or modified outcome)';
COMMENT ON COLUMN sales_bench_run_results.evidence_used IS 'Data sources with content hashes and TTL';
COMMENT ON COLUMN sales_bench_run_results.refusal_reason_code IS 'If BLOCK, the specific reason code';
COMMENT ON COLUMN sales_bench_run_results.signature IS 'HMAC-SHA256 signature for tamper detection';
COMMENT ON COLUMN sales_bench_run_results.signature_status IS 'VALID or TAMPERED';
COMMENT ON COLUMN sales_bench_run_results.code_commit_sha IS 'Git commit SHA of running code';
COMMENT ON COLUMN sales_bench_run_results.siva_version IS 'SIVA release version';

-- ============================================================================
-- TRACE IMMUTABILITY TRIGGER
-- ============================================================================
-- Once trace data is written, it cannot be updated (append-only)

CREATE OR REPLACE FUNCTION prevent_trace_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updates to non-trace fields only
  -- Trace fields are immutable once set
  IF OLD.interaction_id IS NOT NULL AND NEW.interaction_id IS DISTINCT FROM OLD.interaction_id THEN
    RAISE EXCEPTION 'Cannot update trace.interaction_id - trace data is immutable';
  END IF;
  IF OLD.envelope_sha256 IS NOT NULL AND NEW.envelope_sha256 IS DISTINCT FROM OLD.envelope_sha256 THEN
    RAISE EXCEPTION 'Cannot update trace.envelope_sha256 - trace data is immutable';
  END IF;
  IF OLD.signature IS NOT NULL AND NEW.signature IS DISTINCT FROM OLD.signature THEN
    RAISE EXCEPTION 'Cannot update trace.signature - trace data is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS tr_prevent_trace_update ON sales_bench_run_results;
CREATE TRIGGER tr_prevent_trace_update
  BEFORE UPDATE ON sales_bench_run_results
  FOR EACH ROW
  EXECUTE FUNCTION prevent_trace_update();

-- ============================================================================
