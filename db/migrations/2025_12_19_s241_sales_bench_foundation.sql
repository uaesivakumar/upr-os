-- ============================================================================
-- S241: Sales-Bench Foundation
-- PRD v1.3 Appendix Aligned
--
-- Creates isolated sales_bench schema with:
-- - sales_scenarios table (immutable)
-- - scenario_runs table (append-only)
-- - Authority invariance through schema isolation
-- ============================================================================

-- Create isolated schema for Sales-Bench
-- This prevents any accidental cross-contamination with production tables
CREATE SCHEMA IF NOT EXISTS sales_bench;

COMMENT ON SCHEMA sales_bench IS 'Isolated schema for Sales-Bench v1 (PRD v1.3). No foreign keys to production tables.';

-- ============================================================================
-- sales_scenarios: Immutable scenario definitions
-- PRD v1.3 §2.1
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.sales_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  hash VARCHAR(64) NOT NULL,

  -- Context (PRD v1.3 §2.1)
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50) NOT NULL,
  region VARCHAR(20) NOT NULL,

  -- Scenario definition
  entry_intent VARCHAR(100) NOT NULL,
  buyer_bot_id UUID NOT NULL,  -- References sales_bench.buyer_bots (created in S243)
  constraints JSONB NOT NULL DEFAULT '{}',
  success_condition VARCHAR(50) NOT NULL CHECK (
    success_condition IN ('next_step_committed', 'qualified_handoff', 'correct_refusal')
  ),

  -- Path type (PRD v1.3 §6)
  path_type VARCHAR(10) NOT NULL CHECK (path_type IN ('GOLDEN', 'KILL')),
  expected_outcome VARCHAR(10) NOT NULL CHECK (expected_outcome IN ('PASS', 'FAIL', 'BLOCK')),

  -- Tolerances
  tolerances JSONB NOT NULL DEFAULT '{
    "max_turns": 10,
    "max_latency_ms": 5000,
    "max_cost_usd": 0.10
  }',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Immutability: hash must be unique (prevents duplicate scenarios)
  CONSTRAINT scenario_hash_unique UNIQUE (hash)
);

-- Index for vertical-scoped queries (PRD v1.3 §7.3: no cross-vertical aggregation)
CREATE INDEX IF NOT EXISTS idx_scenarios_vertical
  ON sales_bench.sales_scenarios(vertical, sub_vertical, region);

CREATE INDEX IF NOT EXISTS idx_scenarios_path_type
  ON sales_bench.sales_scenarios(path_type);

CREATE INDEX IF NOT EXISTS idx_scenarios_active
  ON sales_bench.sales_scenarios(is_active) WHERE is_active = true;

COMMENT ON TABLE sales_bench.sales_scenarios IS 'Immutable scenario definitions for Sales-Bench (PRD v1.3 §2.1)';
COMMENT ON COLUMN sales_bench.sales_scenarios.hash IS 'SHA256 hash of scenario content for immutability verification';
COMMENT ON COLUMN sales_bench.sales_scenarios.path_type IS 'GOLDEN = positive path, KILL = adversarial refusal path (PRD v1.3 §6)';

-- ============================================================================
-- scenario_runs: Append-only execution log
-- PRD v1.3 §3.1
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.scenario_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),
  buyer_bot_id UUID NOT NULL,  -- Denormalized for query efficiency
  buyer_bot_variant_id UUID,

  -- Deterministic seed for replay (Clarification #2)
  seed INTEGER NOT NULL,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Outcome (PRD v1.3 §3.1)
  hard_outcome VARCHAR(10) CHECK (hard_outcome IN ('PASS', 'FAIL', 'BLOCK')),
  outcome_reason TEXT,

  -- Conversation log (full audit trail)
  conversation JSONB NOT NULL DEFAULT '[]',

  -- Metrics
  metrics JSONB NOT NULL DEFAULT '{
    "total_turns": 0,
    "total_latency_ms": 0,
    "total_tokens": 0,
    "total_cost_usd": 0,
    "policy_gates_hit": [],
    "failure_triggers_fired": []
  }',

  -- CRS reference (populated after CRS computation in S245)
  crs_score_id UUID,

  -- Replay support
  is_replay BOOLEAN NOT NULL DEFAULT false,
  original_run_id UUID REFERENCES sales_bench.scenario_runs(id),

  -- Vertical denormalized for query filtering without join
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50) NOT NULL,
  region VARCHAR(20) NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_runs_scenario
  ON sales_bench.scenario_runs(scenario_id);

CREATE INDEX IF NOT EXISTS idx_runs_outcome
  ON sales_bench.scenario_runs(hard_outcome) WHERE hard_outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runs_vertical
  ON sales_bench.scenario_runs(vertical, sub_vertical, region);

CREATE INDEX IF NOT EXISTS idx_runs_started
  ON sales_bench.scenario_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_seed
  ON sales_bench.scenario_runs(seed);

COMMENT ON TABLE sales_bench.scenario_runs IS 'Append-only execution log for Sales-Bench (PRD v1.3 §3.1)';
COMMENT ON COLUMN sales_bench.scenario_runs.seed IS 'Deterministic seed for Buyer Bot behavior - enables exact replay';
COMMENT ON COLUMN sales_bench.scenario_runs.hard_outcome IS 'BLOCK > FAIL > PASS precedence (PRD v1.3 §3.1)';

-- ============================================================================
-- Trigger: Prevent scenario modification (immutability)
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench.prevent_scenario_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Sales scenarios are immutable (PRD v1.3 §2.1). Create a new version instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scenario_immutability ON sales_bench.sales_scenarios;
CREATE TRIGGER trigger_scenario_immutability
  BEFORE UPDATE ON sales_bench.sales_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION sales_bench.prevent_scenario_modification();

-- ============================================================================
-- Trigger: Prevent run modification after completion (append-only)
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench.prevent_completed_run_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Completed scenario runs cannot be modified (append-only)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_run_append_only ON sales_bench.scenario_runs;
CREATE TRIGGER trigger_run_append_only
  BEFORE UPDATE ON sales_bench.scenario_runs
  FOR EACH ROW
  EXECUTE FUNCTION sales_bench.prevent_completed_run_modification();

-- ============================================================================
-- Function: Assert single vertical for queries (PRD v1.3 §7.3)
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench.assert_single_vertical(verticals TEXT[])
RETURNS VOID AS $$
BEGIN
  IF array_length(verticals, 1) > 1 THEN
    RAISE EXCEPTION 'Cross-vertical aggregation forbidden (PRD v1.3 §7.3)';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sales_bench.assert_single_vertical IS 'Enforces single-vertical queries (PRD v1.3 §7.3)';

-- ============================================================================
-- View: Active scenarios by vertical
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_active_scenarios AS
SELECT
  s.id,
  s.version,
  s.vertical,
  s.sub_vertical,
  s.region,
  s.entry_intent,
  s.path_type,
  s.expected_outcome,
  s.success_condition,
  s.constraints,
  s.tolerances,
  s.created_at,
  (SELECT COUNT(*) FROM sales_bench.scenario_runs r WHERE r.scenario_id = s.id) as run_count
FROM sales_bench.sales_scenarios s
WHERE s.is_active = true;

COMMENT ON VIEW sales_bench.v_active_scenarios IS 'Active scenarios with run counts';

-- ============================================================================
-- View: Run summary by vertical (for non-cross-vertical analytics)
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_run_summary AS
SELECT
  r.vertical,
  r.sub_vertical,
  r.region,
  r.hard_outcome,
  COUNT(*) as run_count,
  AVG((r.metrics->>'total_latency_ms')::numeric) as avg_latency_ms,
  AVG((r.metrics->>'total_cost_usd')::numeric) as avg_cost_usd,
  AVG((r.metrics->>'total_turns')::numeric) as avg_turns
FROM sales_bench.scenario_runs r
WHERE r.completed_at IS NOT NULL
GROUP BY r.vertical, r.sub_vertical, r.region, r.hard_outcome;

COMMENT ON VIEW sales_bench.v_run_summary IS 'Run summary grouped by vertical (PRD v1.3 §7.3 compliant)';

-- ============================================================================
-- Grant permissions (isolated from production roles)
-- ============================================================================

-- Sales-Bench specific role (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sales_bench_app') THEN
    GRANT USAGE ON SCHEMA sales_bench TO sales_bench_app;
    GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA sales_bench TO sales_bench_app;
    -- Note: No UPDATE or DELETE on scenarios (immutable)
    -- Limited UPDATE on runs (only before completion)
  END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

SELECT 'S241: Sales-Bench Foundation migration complete' as status,
       'sales_bench schema created' as schema_status,
       'sales_scenarios table created' as scenarios_status,
       'scenario_runs table created' as runs_status,
       'immutability triggers active' as triggers_status;
