-- Migration: 032_sales_bench_trace_columns.sql
-- Purpose: Add trace/provenance columns to sales_bench_run_results for Trust Layer
-- Guardrail: All trace fields are APPEND-ONLY (no updates after insert)
--
-- This enables:
-- 1. Full provenance chain: envelope → persona → policy → tools → evidence → decision
-- 2. Deterministic replay with deviation detection
-- 3. Regulatory audit trail
-- 4. Founder trust ("prove it's SIVA-under-OS, not raw LLM")

BEGIN;

-- ============================================================================
-- PHASE 1: Add trace columns to sales_bench_run_results
-- ============================================================================

-- Interaction identity (for replay)
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS interaction_id UUID DEFAULT gen_random_uuid();

-- Envelope provenance (request hash)
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS envelope_sha256 VARCHAR(64);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS envelope_version VARCHAR(20) DEFAULT '1.0.0';

-- Authority chain
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS persona_id UUID;

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS persona_version VARCHAR(20);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS policy_version VARCHAR(20);

-- Model routing
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS model_slug VARCHAR(50);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS model_provider VARCHAR(50);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS routing_decision JSONB DEFAULT '{}';
-- Structure: { model_selected, reason, alternatives_considered[], routing_score }

-- Tool execution trace
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS tools_allowed JSONB DEFAULT '[]';
-- Structure: ["tool_name", ...]

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS tools_used JSONB DEFAULT '[]';
-- Structure: [{ tool_name, input_hash, output_hash, duration_ms, success, error? }, ...]

-- Policy gates trace
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS policy_gates_hit JSONB DEFAULT '[]';
-- Structure: [{ gate_name, triggered, reason, action_taken }, ...]

-- Evidence trace (data provenance)
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS evidence_used JSONB DEFAULT '[]';
-- Structure: [{ source, content_hash, ttl_seconds, fetched_at }, ...]

-- Token and cost tracking
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS tokens_in INTEGER;

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS tokens_out INTEGER;

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC(10,6);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS cost_actual NUMERIC(10,6);

-- Cache and performance
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false;

-- Risk and safety
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS risk_score NUMERIC(3,2);

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS escalation_triggered BOOLEAN DEFAULT false;

-- Tamper detection
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS signature VARCHAR(128);
-- HMAC-SHA256 of (interaction_id + envelope_sha256 + outcome)

-- Replay status (populated on replay, not initial run)
ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS replay_of_interaction_id UUID;

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS replay_status VARCHAR(20);
-- Values: NULL (original), 'EXACT', 'EQUIVALENT', 'DEVIATED'

ALTER TABLE sales_bench_run_results
ADD COLUMN IF NOT EXISTS replay_deviation_reason TEXT;

-- ============================================================================
-- PHASE 2: Create indexes for trace queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_results_interaction_id
ON sales_bench_run_results(interaction_id);

CREATE INDEX IF NOT EXISTS idx_results_envelope_sha256
ON sales_bench_run_results(envelope_sha256);

CREATE INDEX IF NOT EXISTS idx_results_persona_id
ON sales_bench_run_results(persona_id);

CREATE INDEX IF NOT EXISTS idx_results_model_slug
ON sales_bench_run_results(model_slug);

CREATE INDEX IF NOT EXISTS idx_results_replay_of
ON sales_bench_run_results(replay_of_interaction_id)
WHERE replay_of_interaction_id IS NOT NULL;

-- ============================================================================
-- PHASE 3: Append-only protection trigger
-- ============================================================================

-- List of trace columns that cannot be updated after insert
-- "Wrong but immutable beats corrected but mutable"

CREATE OR REPLACE FUNCTION prevent_trace_field_updates()
RETURNS TRIGGER AS $$
DECLARE
    immutable_fields TEXT[] := ARRAY[
        'interaction_id',
        'envelope_sha256',
        'envelope_version',
        'persona_id',
        'persona_version',
        'policy_version',
        'model_slug',
        'model_provider',
        'routing_decision',
        'tools_allowed',
        'tools_used',
        'policy_gates_hit',
        'evidence_used',
        'tokens_in',
        'tokens_out',
        'cost_estimate',
        'cache_hit',
        'risk_score',
        'escalation_triggered',
        'signature'
    ];
    field_name TEXT;
BEGIN
    -- Check each immutable field
    FOREACH field_name IN ARRAY immutable_fields
    LOOP
        -- Only block if the field was previously set (not NULL) and is being changed
        EXECUTE format(
            'SELECT CASE WHEN $1.%I IS DISTINCT FROM $2.%I AND $1.%I IS NOT NULL THEN TRUE ELSE FALSE END',
            field_name, field_name, field_name
        ) INTO STRICT found USING OLD, NEW;

        IF found THEN
            RAISE EXCEPTION 'IMMUTABLE_TRACE_FIELD: Cannot update trace field "%" after insert. Trace data is append-only for audit integrity.', field_name;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Variable declaration fix
CREATE OR REPLACE FUNCTION prevent_trace_field_updates()
RETURNS TRIGGER AS $$
DECLARE
    immutable_fields TEXT[] := ARRAY[
        'interaction_id',
        'envelope_sha256',
        'envelope_version',
        'persona_id',
        'persona_version',
        'policy_version',
        'model_slug',
        'model_provider',
        'routing_decision',
        'tools_allowed',
        'tools_used',
        'policy_gates_hit',
        'evidence_used',
        'tokens_in',
        'tokens_out',
        'cost_estimate',
        'cache_hit',
        'risk_score',
        'escalation_triggered',
        'signature'
    ];
    field_name TEXT;
    is_changed BOOLEAN;
BEGIN
    FOREACH field_name IN ARRAY immutable_fields
    LOOP
        EXECUTE format(
            'SELECT CASE WHEN $1.%I IS DISTINCT FROM $2.%I AND $1.%I IS NOT NULL THEN TRUE ELSE FALSE END',
            field_name, field_name, field_name
        ) INTO is_changed USING OLD, NEW;

        IF is_changed THEN
            RAISE EXCEPTION 'IMMUTABLE_TRACE_FIELD: Cannot update trace field "%" after insert. Trace data is append-only for audit integrity.', field_name;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS tr_prevent_trace_updates ON sales_bench_run_results;

CREATE TRIGGER tr_prevent_trace_updates
BEFORE UPDATE ON sales_bench_run_results
FOR EACH ROW
EXECUTE FUNCTION prevent_trace_field_updates();

-- ============================================================================
-- PHASE 4: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN sales_bench_run_results.interaction_id IS
'Unique ID for this interaction. Used for deterministic replay. Immutable after insert.';

COMMENT ON COLUMN sales_bench_run_results.envelope_sha256 IS
'SHA256 hash of the request envelope. Proves request integrity. Immutable after insert.';

COMMENT ON COLUMN sales_bench_run_results.persona_id IS
'ID of the persona that governed this decision. Links to os_personas. Immutable after insert.';

COMMENT ON COLUMN sales_bench_run_results.tools_used IS
'JSONB array of tool calls: [{tool_name, input_hash, output_hash, duration_ms, success}]. Immutable.';

COMMENT ON COLUMN sales_bench_run_results.policy_gates_hit IS
'JSONB array of policy gates triggered: [{gate_name, triggered, reason, action_taken}]. Immutable.';

COMMENT ON COLUMN sales_bench_run_results.evidence_used IS
'JSONB array of evidence sources: [{source, content_hash, ttl_seconds, fetched_at}]. Immutable.';

COMMENT ON COLUMN sales_bench_run_results.replay_status IS
'Replay result: NULL=original, EXACT=identical, EQUIVALENT=same routing, DEVIATED=different outcome';

COMMENT ON COLUMN sales_bench_run_results.signature IS
'HMAC-SHA256(interaction_id + envelope_sha256 + outcome) for tamper detection. Immutable.';

COMMENT ON TRIGGER tr_prevent_trace_updates ON sales_bench_run_results IS
'Enforces append-only semantics for trace fields. Audit integrity requires immutability.';

-- ============================================================================
-- PHASE 5: Create view for trace queries
-- ============================================================================

CREATE OR REPLACE VIEW v_sales_bench_trace AS
SELECT
    rr.id,
    rr.interaction_id,
    rr.run_id,
    rr.scenario_id,
    r.suite_key,
    r.run_number,
    rr.execution_order,
    rr.path_type,
    rr.outcome,
    rr.expected_outcome,
    rr.outcome_correct,
    -- Envelope provenance
    rr.envelope_sha256,
    rr.envelope_version,
    -- Authority chain
    rr.persona_id,
    p.key AS persona_key,
    rr.persona_version,
    rr.policy_version,
    -- Model routing
    rr.model_slug,
    rr.model_provider,
    rr.routing_decision,
    -- Tool trace
    rr.tools_allowed,
    rr.tools_used,
    jsonb_array_length(COALESCE(rr.tools_used, '[]'::jsonb)) AS tool_call_count,
    -- Policy trace
    rr.policy_gates_hit,
    jsonb_array_length(COALESCE(rr.policy_gates_hit, '[]'::jsonb)) AS gates_hit_count,
    -- Evidence trace
    rr.evidence_used,
    jsonb_array_length(COALESCE(rr.evidence_used, '[]'::jsonb)) AS evidence_count,
    -- Performance
    rr.latency_ms,
    rr.tokens_in,
    rr.tokens_out,
    rr.cost_estimate,
    rr.cost_actual,
    rr.cache_hit,
    -- Risk
    rr.risk_score,
    rr.escalation_triggered,
    -- Replay
    rr.replay_of_interaction_id,
    rr.replay_status,
    rr.replay_deviation_reason,
    -- Integrity
    rr.signature,
    -- Timestamps
    rr.executed_at
FROM sales_bench_run_results rr
JOIN sales_bench_runs r ON r.id = rr.run_id
LEFT JOIN os_personas p ON p.id = rr.persona_id;

COMMENT ON VIEW v_sales_bench_trace IS
'Complete trace view for Sales-Bench results. Shows full provenance chain for each scenario result.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to verify migration)
-- ============================================================================

-- Check new columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'sales_bench_run_results'
-- AND column_name IN ('interaction_id', 'envelope_sha256', 'tools_used', 'policy_gates_hit');

-- Test immutability (should fail):
-- UPDATE sales_bench_run_results SET envelope_sha256 = 'test' WHERE id = (SELECT id FROM sales_bench_run_results LIMIT 1);

-- Check trace view:
-- SELECT * FROM v_sales_bench_trace LIMIT 5;
