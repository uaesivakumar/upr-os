-- ============================================================================
-- Migration 023: Enhanced Scenario Traceability
-- ============================================================================
-- Makes scenarios fully traceable with:
-- - Complete scenario context (company, contact, signals)
-- - Run-level scenario snapshots
-- - Result tracking per scenario per run
-- - Easy reprocessing support
--
-- Solo founder friendly: All data in one place, clear relationships.
-- ============================================================================

-- ============================================================================
-- 1. ADD CONTEXT FIELDS TO SCENARIOS
-- ============================================================================
-- Full scenario context for traceability and reprocessing

ALTER TABLE sales_bench.sales_scenarios
    ADD COLUMN IF NOT EXISTS scenario_data JSONB,          -- Full scenario definition
    ADD COLUMN IF NOT EXISTS company_profile JSONB,        -- Target company details
    ADD COLUMN IF NOT EXISTS contact_profile JSONB,        -- Target contact details
    ADD COLUMN IF NOT EXISTS signal_context JSONB,         -- Detected signals
    ADD COLUMN IF NOT EXISTS persona_context JSONB,        -- Salesperson persona
    ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),     -- Hash of all content
    ADD COLUMN IF NOT EXISTS source VARCHAR(100),          -- Where scenario came from
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(100),       -- ID in source system
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),      -- Who created it
    ADD COLUMN IF NOT EXISTS tags TEXT[];                  -- For organization

-- Index for source lookups
CREATE INDEX IF NOT EXISTS idx_scenarios_source ON sales_bench.sales_scenarios(source, source_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_content_hash ON sales_bench.sales_scenarios(content_hash);

-- ============================================================================
-- 2. RUN-SCENARIO RESULTS (Per-scenario tracking within runs)
-- ============================================================================
-- Links runs to specific scenarios with individual results

CREATE TABLE IF NOT EXISTS sales_bench_run_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES sales_bench_runs(id) ON DELETE CASCADE,
    scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),

    -- Sequence within run
    sequence_order INTEGER NOT NULL,

    -- Scenario snapshot (frozen at run time for reproducibility)
    scenario_hash VARCHAR(64) NOT NULL,
    scenario_snapshot JSONB,           -- Full scenario at time of run

    -- Execution result
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'SKIPPED')
    ),

    -- CRS scores (if scored)
    crs_scores JSONB,                   -- All 8 dimension scores
    crs_overall DECIMAL(5,4),           -- Weighted CRS

    -- Outcome match
    expected_outcome VARCHAR(10),       -- PASS, FAIL, BLOCK
    actual_outcome VARCHAR(10),         -- PASS, FAIL, BLOCK
    outcome_match BOOLEAN,              -- expected == actual

    -- Execution details
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    conversation_turns INTEGER,
    tokens_used INTEGER,
    cost_usd DECIMAL(10,6),

    -- Error tracking
    error_message TEXT,
    error_type VARCHAR(50),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(run_id, scenario_id)
);

CREATE INDEX idx_run_scenarios_run ON sales_bench_run_scenarios(run_id);
CREATE INDEX idx_run_scenarios_scenario ON sales_bench_run_scenarios(scenario_id);
CREATE INDEX idx_run_scenarios_status ON sales_bench_run_scenarios(status);
CREATE INDEX idx_run_scenarios_outcome ON sales_bench_run_scenarios(outcome_match);

-- ============================================================================
-- 3. SCENARIO LINEAGE (Track where scenarios come from)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench_scenario_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),

    -- Source information
    source_type VARCHAR(50) NOT NULL,   -- MANUAL, GENERATED, IMPORTED, CLONED
    source_reference TEXT,               -- URL, file path, etc.
    source_metadata JSONB,               -- Additional source info

    -- For cloned scenarios
    parent_scenario_id UUID REFERENCES sales_bench.sales_scenarios(id),
    modification_notes TEXT,

    -- Who/when
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lineage_scenario ON sales_bench_scenario_lineage(scenario_id);
CREATE INDEX idx_lineage_parent ON sales_bench_scenario_lineage(parent_scenario_id);

-- ============================================================================
-- 4. REPROCESSING LOG
-- ============================================================================
-- Track when scenarios are reprocessed (for debugging/audit)

CREATE TABLE IF NOT EXISTS sales_bench_reprocess_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was reprocessed
    reprocess_type VARCHAR(20) NOT NULL CHECK (
        reprocess_type IN ('SCENARIO', 'RUN', 'SUITE')
    ),
    target_id UUID NOT NULL,             -- scenario_id, run_id, or suite_id

    -- Why
    reason TEXT,
    triggered_by VARCHAR(100),

    -- Results
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')
    ),
    result_summary JSONB,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_reprocess_target ON sales_bench_reprocess_log(target_id);
CREATE INDEX idx_reprocess_status ON sales_bench_reprocess_log(status);

-- ============================================================================
-- 5. VIEW: Scenario Traceability Summary
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench_scenario_trace AS
SELECT
    s.id AS scenario_id,
    s.hash,
    s.content_hash,
    s.vertical,
    s.sub_vertical,
    s.region,
    s.path_type,
    s.expected_outcome,
    s.source,
    s.source_id,
    s.created_at,
    s.created_by,
    s.tags,
    (SELECT COUNT(*) FROM sales_bench_suite_scenarios ss WHERE ss.scenario_id = s.id) AS suite_count,
    (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id) AS run_count,
    (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id AND rs.outcome_match = true) AS pass_count,
    (SELECT COUNT(*) FROM sales_bench_human_scores hs WHERE hs.scenario_id = s.id) AS human_score_count,
    sl.source_type AS lineage_type,
    sl.parent_scenario_id
FROM sales_bench.sales_scenarios s
LEFT JOIN sales_bench_scenario_lineage sl ON sl.scenario_id = s.id
WHERE s.is_active = true;

-- ============================================================================
-- 6. VIEW: Run-Scenario Details
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench_run_scenario_details AS
SELECT
    rs.*,
    s.hash AS scenario_hash_original,
    s.vertical,
    s.sub_vertical,
    s.path_type,
    s.expected_outcome AS scenario_expected,
    r.suite_key,
    r.run_number,
    r.status AS run_status
FROM sales_bench_run_scenarios rs
JOIN sales_bench.sales_scenarios s ON s.id = rs.scenario_id
JOIN sales_bench_runs r ON r.id = rs.run_id;

-- ============================================================================
-- 7. HELPER FUNCTION: Compute content hash
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench_compute_content_hash(p_scenario_id UUID)
RETURNS VARCHAR(64) AS $$
DECLARE
    v_content TEXT;
BEGIN
    SELECT COALESCE(scenario_data::text, '') ||
           COALESCE(company_profile::text, '') ||
           COALESCE(contact_profile::text, '') ||
           COALESCE(signal_context::text, '') ||
           COALESCE(persona_context::text, '')
    INTO v_content
    FROM sales_bench.sales_scenarios
    WHERE id = p_scenario_id;

    RETURN encode(sha256(v_content::bytea), 'hex');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGER: Auto-compute content hash on insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench_scenario_content_hash_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_hash := sales_bench_compute_content_hash(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS trg_scenario_content_hash ON sales_bench.sales_scenarios;

CREATE TRIGGER trg_scenario_content_hash
    BEFORE INSERT OR UPDATE OF scenario_data, company_profile, contact_profile, signal_context, persona_context
    ON sales_bench.sales_scenarios
    FOR EACH ROW
    WHEN (NEW.content_hash IS DISTINCT FROM OLD.content_hash OR OLD.content_hash IS NULL)
    EXECUTE FUNCTION sales_bench_scenario_content_hash_trigger();

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE sales_bench_run_scenarios IS 'Per-scenario results within a run - enables granular traceability';
COMMENT ON TABLE sales_bench_scenario_lineage IS 'Tracks origin and history of each scenario';
COMMENT ON TABLE sales_bench_reprocess_log IS 'Audit log for reprocessing operations';
COMMENT ON VIEW sales_bench_scenario_trace IS 'Summary view of scenario usage and performance across runs';
COMMENT ON VIEW sales_bench_run_scenario_details IS 'Detailed view joining runs with their scenarios';
