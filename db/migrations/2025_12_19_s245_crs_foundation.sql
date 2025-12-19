-- ============================================================================
-- S245: CRS Foundation
-- PRD v1.3 Appendix §4
--
-- Creates CRS (Conversion Readiness Score) schema:
-- - crs_scores: Individual score records
-- - Dimension scoring with fixed weights
-- - Calibration tracking
--
-- CRITICAL: CRS is ADVISORY ONLY. It never alters SIVA runtime behavior.
-- ============================================================================

-- ============================================================================
-- crs_scores: Individual CRS score records
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.crs_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES sales_bench.scenario_runs(id),
  scenario_id UUID NOT NULL REFERENCES sales_bench.sales_scenarios(id),

  -- Overall weighted score (0-1)
  overall_score NUMERIC(5,4) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),

  -- Individual dimension scores with evidence
  dimension_scores JSONB NOT NULL,
  dimension_evidence JSONB NOT NULL DEFAULT '{}',

  -- Calibration tracking (S248)
  is_calibrated BOOLEAN NOT NULL DEFAULT false,
  calibrated_by VARCHAR(100),
  calibrated_at TIMESTAMPTZ,
  calibration_adjustments JSONB,
  original_score_id UUID REFERENCES sales_bench.crs_scores(id),

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Vertical for query filtering (PRD v1.3 §7.3)
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50) NOT NULL
);

-- Indexes for crs_scores
CREATE INDEX IF NOT EXISTS idx_crs_run
  ON sales_bench.crs_scores(run_id);

CREATE INDEX IF NOT EXISTS idx_crs_scenario
  ON sales_bench.crs_scores(scenario_id);

CREATE INDEX IF NOT EXISTS idx_crs_vertical
  ON sales_bench.crs_scores(vertical, sub_vertical);

CREATE INDEX IF NOT EXISTS idx_crs_overall_score
  ON sales_bench.crs_scores(overall_score);

CREATE INDEX IF NOT EXISTS idx_crs_calibrated
  ON sales_bench.crs_scores(is_calibrated) WHERE is_calibrated = true;

CREATE INDEX IF NOT EXISTS idx_crs_computed_at
  ON sales_bench.crs_scores(computed_at DESC);

COMMENT ON TABLE sales_bench.crs_scores IS 'CRS scores - ADVISORY ONLY (PRD v1.3 §4, §8.1)';
COMMENT ON COLUMN sales_bench.crs_scores.overall_score IS 'Weighted composite of 8 dimensions (0-1)';
COMMENT ON COLUMN sales_bench.crs_scores.dimension_scores IS 'Individual dimension scores with weights and ratings';
COMMENT ON COLUMN sales_bench.crs_scores.is_calibrated IS 'Whether human-calibrated (S248)';

-- ============================================================================
-- CRS dimension reference table (fixed weights per PRD v1.3 §4.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.crs_dimension_reference (
  dimension_key VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  weight NUMERIC(4,3) NOT NULL CHECK (weight > 0 AND weight <= 1),
  category VARCHAR(50) NOT NULL,
  evaluation_criteria TEXT NOT NULL
);

-- Seed fixed dimensions and weights
INSERT INTO sales_bench.crs_dimension_reference (dimension_key, name, description, weight, category, evaluation_criteria)
VALUES
  ('qualification', 'Qualification', 'Properly qualifying the prospect', 0.15, 'Discovery', 'Did SIVA identify decision-maker status, budget authority, timeline, and business need?'),
  ('needs_discovery', 'Needs Discovery', 'Uncovering true needs', 0.15, 'Discovery', 'Did SIVA uncover pain points, goals, and requirements beyond surface-level needs?'),
  ('value_articulation', 'Value Articulation', 'Communicating value clearly', 0.15, 'Positioning', 'Did SIVA connect features to specific benefits and business outcomes?'),
  ('objection_handling', 'Objection Handling', 'Addressing concerns effectively', 0.15, 'Positioning', 'Did SIVA acknowledge concerns, provide evidence, and resolve objections?'),
  ('process_adherence', 'Process Adherence', 'Following sales methodology', 0.10, 'Compliance', 'Did SIVA follow appropriate sales stage progression and methodology?'),
  ('compliance', 'Compliance', 'Regulatory/policy compliance', 0.10, 'Compliance', 'Did SIVA avoid compliance violations, inappropriate promises, or policy breaches?'),
  ('relationship_build', 'Relationship Building', 'Building rapport and trust', 0.10, 'Relationship', 'Did SIVA establish rapport, show empathy, and build trust through interaction?'),
  ('next_step_secured', 'Next Step Secured', 'Advancing the deal', 0.10, 'Closing', 'Did SIVA secure a concrete next step or appropriate outcome?')
ON CONFLICT (dimension_key) DO NOTHING;

COMMENT ON TABLE sales_bench.crs_dimension_reference IS 'Fixed CRS dimensions and weights (PRD v1.3 §4.2)';

-- ============================================================================
-- View: CRS scores with run and scenario context
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_crs_scores AS
SELECT
  c.id as score_id,
  c.run_id,
  c.scenario_id,
  c.overall_score,
  c.is_calibrated,
  c.computed_at,
  c.vertical,
  c.sub_vertical,
  r.hard_outcome as run_outcome,
  r.seed as run_seed,
  s.path_type,
  s.expected_outcome,
  s.success_condition
FROM sales_bench.crs_scores c
JOIN sales_bench.scenario_runs r ON c.run_id = r.id
JOIN sales_bench.sales_scenarios s ON c.scenario_id = s.id;

COMMENT ON VIEW sales_bench.v_crs_scores IS 'CRS scores with run and scenario context';

-- ============================================================================
-- View: CRS aggregates by vertical (for dashboards)
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_crs_aggregates AS
SELECT
  vertical,
  sub_vertical,
  COUNT(*) as score_count,
  AVG(overall_score) as avg_score,
  MIN(overall_score) as min_score,
  MAX(overall_score) as max_score,
  STDDEV(overall_score) as std_dev,
  SUM(CASE WHEN overall_score >= 0.8 THEN 1 ELSE 0 END) as excellent_count,
  SUM(CASE WHEN overall_score >= 0.6 AND overall_score < 0.8 THEN 1 ELSE 0 END) as good_count,
  SUM(CASE WHEN overall_score >= 0.4 AND overall_score < 0.6 THEN 1 ELSE 0 END) as needs_improvement_count,
  SUM(CASE WHEN overall_score < 0.4 THEN 1 ELSE 0 END) as poor_count,
  SUM(CASE WHEN is_calibrated THEN 1 ELSE 0 END) as calibrated_count
FROM sales_bench.crs_scores
GROUP BY vertical, sub_vertical;

COMMENT ON VIEW sales_bench.v_crs_aggregates IS 'CRS aggregate statistics by vertical (PRD v1.3 §7.3 compliant)';

-- ============================================================================
-- Function: Assert CRS is advisory only
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench.assert_crs_advisory()
RETURNS TRIGGER AS $$
BEGIN
  -- CRS scores should never have runtime_modification flag
  IF NEW.dimension_scores ? 'runtime_modification' THEN
    RAISE EXCEPTION 'CRS is advisory only - cannot include runtime_modification (PRD v1.3 §8.1)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crs_advisory_only ON sales_bench.crs_scores;
CREATE TRIGGER trigger_crs_advisory_only
  BEFORE INSERT ON sales_bench.crs_scores
  FOR EACH ROW
  EXECUTE FUNCTION sales_bench.assert_crs_advisory();

COMMENT ON FUNCTION sales_bench.assert_crs_advisory IS 'Enforces CRS advisory-only rule (PRD v1.3 §8.1)';

-- ============================================================================
-- Migration complete
-- ============================================================================

SELECT 'S245: CRS Foundation migration complete' as status,
       'crs_scores table created' as scores_status,
       'crs_dimension_reference seeded' as dimensions_status,
       'advisory-only trigger active' as trigger_status;
