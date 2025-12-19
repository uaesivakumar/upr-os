-- ============================================================================
-- SALES-BENCH GOVERNANCE SCHEMA
-- ============================================================================
-- Authority: OS (execution + evaluation)
-- Visibility: Super Admin (read-only + trigger)
--
-- This schema enables:
-- - Permanent benchmark suite registry
-- - Longitudinal SIVA tracking per vertical/sub-vertical/region
-- - Immutable scenario storage
-- - Human validation gating
-- - Audit timeline
-- ============================================================================

-- ============================================================================
-- 1. BENCHMARK SUITES (Registry)
-- ============================================================================
-- Suites are grouped by vertical → sub-vertical → region
-- Each suite represents a specific evaluation context (e.g., EB/UAE Pre-Entry)

CREATE TABLE IF NOT EXISTS sales_bench_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Suite identification
    suite_key VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'banking-eb-uae-pre-entry'
    name VARCHAR(255) NOT NULL,               -- Human-readable name
    description TEXT,

    -- Context binding (STRICT - no cross-aggregation allowed)
    vertical_id UUID NOT NULL REFERENCES os_verticals(id),
    sub_vertical_id UUID NOT NULL REFERENCES os_sub_verticals(id),
    region_code VARCHAR(10) NOT NULL,         -- e.g., 'UAE', 'IND', 'US'

    -- Stage classification
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('PRE_ENTRY', 'POST_ENTRY')),

    -- Current scenario manifest (hash of scenario IDs + their content hashes)
    scenario_manifest_hash VARCHAR(64),       -- SHA-256 of manifest
    scenario_count INTEGER DEFAULT 0,

    -- Status flags
    is_active BOOLEAN DEFAULT true,
    is_frozen BOOLEAN DEFAULT false,          -- Once frozen, scenarios cannot change
    frozen_at TIMESTAMPTZ,
    frozen_by VARCHAR(100),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    -- Constraints
    CONSTRAINT valid_region CHECK (region_code ~ '^[A-Z]{2,10}$')
);

CREATE INDEX idx_suites_vertical ON sales_bench_suites(vertical_id);
CREATE INDEX idx_suites_sub_vertical ON sales_bench_suites(sub_vertical_id);
CREATE INDEX idx_suites_region ON sales_bench_suites(region_code);
CREATE INDEX idx_suites_key ON sales_bench_suites(suite_key);

-- ============================================================================
-- 2. SUITE STATUS (Validation Gating)
-- ============================================================================
-- Tracks validation status per suite
-- A suite must pass both system AND human validation for GA approval

CREATE TABLE IF NOT EXISTS sales_bench_suite_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES sales_bench_suites(id) ON DELETE CASCADE,

    -- Status progression: DRAFT → SYSTEM_VALIDATED → HUMAN_VALIDATED → GA_APPROVED
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'SYSTEM_VALIDATED', 'HUMAN_VALIDATED', 'GA_APPROVED', 'DEPRECATED')
    ),

    -- System validation (SIVA-only)
    system_validated_at TIMESTAMPTZ,
    system_validation_run_id UUID,            -- Reference to the run that passed
    system_metrics JSONB,                     -- Key metrics at validation time

    -- Human validation (RM calibration)
    human_validated_at TIMESTAMPTZ,
    human_validation_run_id UUID,
    human_sample_n INTEGER,                   -- Number of human evaluators
    spearman_rho DECIMAL(4,3),                -- Correlation coefficient
    icc_score DECIMAL(4,3),                   -- Inter-rater reliability
    human_metrics JSONB,

    -- GA Approval
    ga_approved_at TIMESTAMPTZ,
    approved_by VARCHAR(100),                 -- Must be CALIBRATION_ADMIN role
    approval_notes TEXT,

    -- Deprecation
    deprecated_at TIMESTAMPTZ,
    deprecated_by VARCHAR(100),
    deprecation_reason TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT one_status_per_suite UNIQUE (suite_id)
);

-- ============================================================================
-- 3. BENCHMARK RUNS (Execution History)
-- ============================================================================
-- Every run is immutable and permanently stored
-- Enables longitudinal tracking and drift detection

CREATE TABLE IF NOT EXISTS sales_bench_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Suite binding
    suite_id UUID NOT NULL REFERENCES sales_bench_suites(id),
    suite_key VARCHAR(100) NOT NULL,          -- Denormalized for fast queries

    -- Run identification
    run_number INTEGER NOT NULL,              -- Sequential within suite
    run_mode VARCHAR(20) NOT NULL CHECK (run_mode IN ('FULL', 'FOUNDER', 'QUICK')),

    -- Version tracking (CRITICAL for reproducibility)
    scenario_manifest_hash VARCHAR(64) NOT NULL,  -- Must match suite manifest
    siva_version VARCHAR(50) NOT NULL,            -- SIVA release version
    model_id UUID,                                -- LLM model used
    model_slug VARCHAR(100),                      -- e.g., 'claude-3-5-sonnet'
    code_commit_sha VARCHAR(40) NOT NULL,         -- Git commit

    -- Environment
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('PRODUCTION', 'STAGING', 'LOCAL')),
    triggered_by VARCHAR(100) NOT NULL,           -- User or system
    trigger_source VARCHAR(50),                   -- 'SUPER_ADMIN', 'CLI', 'SCHEDULED'

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Results summary (denormalized for fast queries)
    scenario_count INTEGER NOT NULL,
    golden_count INTEGER,
    kill_count INTEGER,

    -- Hard outcomes
    pass_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    block_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,

    -- Computed metrics
    golden_pass_rate DECIMAL(5,2),            -- Percentage
    kill_containment_rate DECIMAL(5,2),       -- Percentage
    cohens_d DECIMAL(6,3),                    -- CRS separation

    -- Full metrics (JSONB for flexibility)
    metrics JSONB,                            -- All computed metrics

    -- Artifact pointers
    artifact_path VARCHAR(500),               -- Path to artifact bundle
    artifact_hash VARCHAR(64),                -- SHA-256 of artifact bundle

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (
        status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_run_number UNIQUE (suite_id, run_number)
);

CREATE INDEX idx_runs_suite ON sales_bench_runs(suite_id);
CREATE INDEX idx_runs_suite_key ON sales_bench_runs(suite_key);
CREATE INDEX idx_runs_started ON sales_bench_runs(started_at DESC);
CREATE INDEX idx_runs_status ON sales_bench_runs(status);

-- ============================================================================
-- 4. RUN RESULTS (Detailed Scenario Outcomes)
-- ============================================================================
-- Per-scenario results for each run

CREATE TABLE IF NOT EXISTS sales_bench_run_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES sales_bench_runs(id) ON DELETE CASCADE,

    -- Scenario binding (references sales_bench schema)
    scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),
    scenario_hash VARCHAR(64) NOT NULL,       -- Content hash at execution time

    -- Execution details
    path_type VARCHAR(10) NOT NULL CHECK (path_type IN ('GOLDEN', 'KILL')),
    execution_order INTEGER NOT NULL,

    -- Outcome
    outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'BLOCK', 'ERROR')),
    expected_outcome VARCHAR(10) NOT NULL,
    outcome_correct BOOLEAN GENERATED ALWAYS AS (outcome = expected_outcome) STORED,

    -- CRS scores (8 dimensions)
    crs_qualification DECIMAL(3,2),
    crs_needs_discovery DECIMAL(3,2),
    crs_value_articulation DECIMAL(3,2),
    crs_objection_handling DECIMAL(3,2),
    crs_process_adherence DECIMAL(3,2),
    crs_compliance DECIMAL(3,2),
    crs_relationship_building DECIMAL(3,2),
    crs_next_step_secured DECIMAL(3,2),
    crs_weighted DECIMAL(4,3),                -- Weighted average

    -- Response data
    siva_response TEXT,                       -- Full SIVA response
    response_tokens INTEGER,
    latency_ms INTEGER,

    -- Policy tracking
    policy_violations JSONB,
    adversarial_contained BOOLEAN,

    -- Metadata
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_run ON sales_bench_run_results(run_id);
CREATE INDEX idx_results_scenario ON sales_bench_run_results(scenario_id);
CREATE INDEX idx_results_outcome ON sales_bench_run_results(outcome);

-- ============================================================================
-- 5. AUDIT LOG (Governance Timeline)
-- ============================================================================
-- Chronological log of all governance events
-- Super Admin reads this for visibility

CREATE TABLE IF NOT EXISTS sales_bench_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event context
    suite_id UUID REFERENCES sales_bench_suites(id),
    run_id UUID REFERENCES sales_bench_runs(id),
    scenario_id UUID REFERENCES sales_bench.sales_scenarios(id),

    -- Event details
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT NOT NULL,

    -- Actor
    actor VARCHAR(100) NOT NULL,              -- User or system
    actor_role VARCHAR(50),                   -- CALIBRATION_ADMIN, SYSTEM, etc.

    -- Data snapshot
    before_state JSONB,
    after_state JSONB,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_audit_suite ON sales_bench_audit_log(suite_id);
CREATE INDEX idx_audit_created ON sales_bench_audit_log(created_at DESC);
CREATE INDEX idx_audit_type ON sales_bench_audit_log(event_type);

-- Event types:
-- SUITE_CREATED, SUITE_FROZEN, SUITE_DEPRECATED
-- SCENARIO_CREATED, SCENARIO_ARCHIVED
-- RUN_STARTED, RUN_COMPLETED, RUN_FAILED
-- SYSTEM_VALIDATION_PASSED, SYSTEM_VALIDATION_FAILED
-- HUMAN_CALIBRATION_STARTED, HUMAN_CALIBRATION_COMPLETED
-- GA_APPROVED, GA_REVOKED

-- ============================================================================
-- 6. HUMAN CALIBRATION SESSIONS
-- ============================================================================
-- Tracks human evaluation sessions for correlation analysis

CREATE TABLE IF NOT EXISTS sales_bench_human_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES sales_bench_suites(id),

    -- Session details
    session_name VARCHAR(100),
    evaluator_count INTEGER NOT NULL,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Results
    scenarios_evaluated INTEGER,
    icc_score DECIMAL(4,3),                   -- Inter-rater reliability
    status VARCHAR(20) DEFAULT 'IN_PROGRESS' CHECK (
        status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')
    ),

    -- Metadata
    created_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS sales_bench_human_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sales_bench_human_sessions(id) ON DELETE CASCADE,

    -- Evaluator (anonymized)
    evaluator_id VARCHAR(20) NOT NULL,        -- EVAL_1, EVAL_2, etc.
    evaluator_role VARCHAR(50),               -- RM, SALES_MANAGER, etc.
    years_experience INTEGER,

    -- Scenario binding (references sales_bench schema)
    scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),
    path_type VARCHAR(10) NOT NULL,

    -- CRS scores (1-5 Likert)
    crs_qualification INTEGER CHECK (crs_qualification BETWEEN 1 AND 5),
    crs_needs_discovery INTEGER CHECK (crs_needs_discovery BETWEEN 1 AND 5),
    crs_value_articulation INTEGER CHECK (crs_value_articulation BETWEEN 1 AND 5),
    crs_objection_handling INTEGER CHECK (crs_objection_handling BETWEEN 1 AND 5),
    crs_process_adherence INTEGER CHECK (crs_process_adherence BETWEEN 1 AND 5),
    crs_compliance INTEGER CHECK (crs_compliance BETWEEN 1 AND 5),
    crs_relationship_building INTEGER CHECK (crs_relationship_building BETWEEN 1 AND 5),
    crs_next_step_secured INTEGER CHECK (crs_next_step_secured BETWEEN 1 AND 5),
    crs_weighted DECIMAL(4,3),

    -- Additional assessment
    would_pursue VARCHAR(10) CHECK (would_pursue IN ('YES', 'NO', 'MAYBE')),
    confidence INTEGER CHECK (confidence BETWEEN 1 AND 5),
    notes TEXT,

    -- Metadata
    scored_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_human_scores_session ON sales_bench_human_scores(session_id);
CREATE INDEX idx_human_scores_scenario ON sales_bench_human_scores(scenario_id);

-- ============================================================================
-- 7. CORRELATION RESULTS
-- ============================================================================
-- Stores computed correlations between SIVA and human scores

CREATE TABLE IF NOT EXISTS sales_bench_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Binding
    suite_id UUID NOT NULL REFERENCES sales_bench_suites(id),
    siva_run_id UUID NOT NULL REFERENCES sales_bench_runs(id),
    human_session_id UUID NOT NULL REFERENCES sales_bench_human_sessions(id),

    -- Correlation metrics
    paired_count INTEGER NOT NULL,            -- n (must be >= 30)
    spearman_rho DECIMAL(5,4) NOT NULL,       -- Spearman rank correlation
    spearman_p_value DECIMAL(10,8),
    is_significant BOOLEAN,                   -- p < 0.05

    -- Interpretation
    calibration_status VARCHAR(20) CHECK (
        calibration_status IN ('EXCELLENT', 'GOOD', 'ACCEPTABLE', 'INSUFFICIENT')
    ),

    -- Dimension-level correlations
    dimension_correlations JSONB,             -- Per-dimension rho values

    -- Computed at
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Get next run number for a suite
CREATE OR REPLACE FUNCTION sales_bench_next_run_number(p_suite_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(run_number) + 1 FROM sales_bench_runs WHERE suite_id = p_suite_id),
        1
    );
END;
$$ LANGUAGE plpgsql;

-- Compute manifest hash from scenario list
CREATE OR REPLACE FUNCTION sales_bench_compute_manifest_hash(p_suite_id UUID)
RETURNS VARCHAR(64) AS $$
DECLARE
    v_hash VARCHAR(64);
BEGIN
    SELECT encode(sha256(string_agg(scenario_id::text || ':' || content_hash, '|' ORDER BY scenario_id)::bytea), 'hex')
    INTO v_hash
    FROM sales_bench_suite_scenarios ss
    JOIN sales_bench.sales_scenarios s ON s.id = ss.scenario_id
    WHERE ss.suite_id = p_suite_id;

    RETURN v_hash;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. SUITE-SCENARIO MAPPING (Many-to-Many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench_suite_scenarios (
    suite_id UUID NOT NULL REFERENCES sales_bench_suites(id) ON DELETE CASCADE,
    scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),

    -- Order within suite
    sequence_order INTEGER NOT NULL,

    -- Selection metadata
    selected_at TIMESTAMPTZ DEFAULT NOW(),
    selected_by VARCHAR(100),
    selection_reason TEXT,

    PRIMARY KEY (suite_id, scenario_id)
);

-- ============================================================================
-- 10. VIEWS FOR SUPER ADMIN (READ-ONLY)
-- ============================================================================

-- Suite overview with latest run metrics
CREATE OR REPLACE VIEW v_sales_bench_suite_overview AS
SELECT
    s.id AS suite_id,
    s.suite_key,
    s.name AS suite_name,
    s.description,
    v.slug AS vertical,
    sv.key AS sub_vertical,
    s.region_code,
    s.stage,
    s.scenario_count,
    s.is_frozen,
    ss.status,
    ss.system_validated_at,
    ss.human_validated_at,
    ss.spearman_rho,
    ss.ga_approved_at,
    lr.run_number AS last_run_number,
    lr.started_at AS last_run_at,
    lr.golden_pass_rate,
    lr.kill_containment_rate,
    lr.cohens_d,
    CASE
        WHEN lr.golden_pass_rate > prev.golden_pass_rate THEN 'UP'
        WHEN lr.golden_pass_rate < prev.golden_pass_rate THEN 'DOWN'
        ELSE 'STABLE'
    END AS trend
FROM sales_bench_suites s
LEFT JOIN os_verticals v ON v.id = s.vertical_id
LEFT JOIN os_sub_verticals sv ON sv.id = s.sub_vertical_id
LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
LEFT JOIN LATERAL (
    SELECT * FROM sales_bench_runs
    WHERE suite_id = s.id AND status = 'COMPLETED'
    ORDER BY run_number DESC LIMIT 1
) lr ON true
LEFT JOIN LATERAL (
    SELECT * FROM sales_bench_runs
    WHERE suite_id = s.id AND status = 'COMPLETED' AND run_number < lr.run_number
    ORDER BY run_number DESC LIMIT 1
) prev ON true
WHERE s.is_active = true;

-- ============================================================================
-- INITIAL DATA: Create suite for current validation
-- ============================================================================

-- This will be populated by the archive script

COMMENT ON TABLE sales_bench_suites IS 'Benchmark suite registry. Authority: OS. Visibility: Super Admin.';
COMMENT ON TABLE sales_bench_runs IS 'Immutable run history. Authority: OS. Visibility: Super Admin.';
COMMENT ON TABLE sales_bench_audit_log IS 'Governance audit trail. Authority: OS. Visibility: Super Admin.';
