-- Migration: Source Performance Tracking
-- Sprint 19, Task 3: Source Prioritization Engine
-- Date: 2025-11-12
--
-- Purpose: Track source performance metrics for dynamic priority calculation
-- ============================================================================

-- ============================================================================
-- Table: source_performance_metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_performance_metrics (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(50) NOT NULL,

  -- Performance metrics
  total_executions INTEGER DEFAULT 0,
  successful_executions INTEGER DEFAULT 0,
  failed_executions INTEGER DEFAULT 0,
  success_rate NUMERIC(5,4) DEFAULT 0.0000,  -- 0.0000-1.0000

  -- Timing metrics
  avg_execution_time_ms INTEGER DEFAULT 0,
  min_execution_time_ms INTEGER DEFAULT 0,
  max_execution_time_ms INTEGER DEFAULT 0,

  -- Signal quality metrics
  total_signals_discovered INTEGER DEFAULT 0,
  avg_signals_per_execution NUMERIC(10,2) DEFAULT 0.00,
  high_quality_signals INTEGER DEFAULT 0,
  quality_rate NUMERIC(5,4) DEFAULT 0.0000,  -- 0.0000-1.0000

  -- Priority calculation
  calculated_priority NUMERIC(3,2) DEFAULT 0.50,  -- 0.00-1.00
  manual_priority_override NUMERIC(3,2) DEFAULT NULL,  -- NULL = use calculated
  effective_priority NUMERIC(3,2) DEFAULT 0.50,  -- Final priority used

  -- Timestamps
  last_execution_at TIMESTAMP DEFAULT NULL,
  metrics_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT source_performance_metrics_source_id_unique UNIQUE (source_id),
  CONSTRAINT success_rate_range CHECK (success_rate >= 0 AND success_rate <= 1),
  CONSTRAINT quality_rate_range CHECK (quality_rate >= 0 AND quality_rate <= 1),
  CONSTRAINT calculated_priority_range CHECK (calculated_priority >= 0 AND calculated_priority <= 1),
  CONSTRAINT manual_priority_range CHECK (manual_priority_override IS NULL OR (manual_priority_override >= 0 AND manual_priority_override <= 1)),
  CONSTRAINT effective_priority_range CHECK (effective_priority >= 0 AND effective_priority <= 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_source_performance_source_id ON source_performance_metrics(source_id);
CREATE INDEX IF NOT EXISTS idx_source_performance_priority ON source_performance_metrics(effective_priority DESC);
CREATE INDEX IF NOT EXISTS idx_source_performance_success_rate ON source_performance_metrics(success_rate DESC);

-- Comments
COMMENT ON TABLE source_performance_metrics IS 'Tracks source performance metrics for dynamic priority calculation (Sprint 19 Task 3)';
COMMENT ON COLUMN source_performance_metrics.calculated_priority IS 'Automatically calculated priority based on performance metrics';
COMMENT ON COLUMN source_performance_metrics.manual_priority_override IS 'Manual priority override (NULL = use calculated)';
COMMENT ON COLUMN source_performance_metrics.effective_priority IS 'Final priority used (manual override if set, otherwise calculated)';

-- ============================================================================
-- Function: update_source_performance
-- ============================================================================

CREATE OR REPLACE FUNCTION update_source_performance(
  p_source_id VARCHAR(50),
  p_execution_time_ms INTEGER,
  p_success BOOLEAN,
  p_signals_count INTEGER DEFAULT 0,
  p_high_quality_count INTEGER DEFAULT 0
) RETURNS VOID AS $$
DECLARE
  v_metrics RECORD;
  v_new_total INTEGER;
  v_new_successful INTEGER;
  v_new_failed INTEGER;
  v_new_success_rate NUMERIC(5,4);
  v_new_avg_time INTEGER;
  v_new_total_signals INTEGER;
  v_new_avg_signals NUMERIC(10,2);
  v_new_quality_rate NUMERIC(5,4);
  v_new_calculated_priority NUMERIC(3,2);
BEGIN
  -- Get current metrics or initialize
  SELECT * INTO v_metrics FROM source_performance_metrics WHERE source_id = p_source_id;

  IF NOT FOUND THEN
    -- Initialize new source
    INSERT INTO source_performance_metrics (source_id) VALUES (p_source_id);
    SELECT * INTO v_metrics FROM source_performance_metrics WHERE source_id = p_source_id;
  END IF;

  -- Calculate new metrics
  v_new_total := v_metrics.total_executions + 1;
  v_new_successful := v_metrics.successful_executions + (CASE WHEN p_success THEN 1 ELSE 0 END);
  v_new_failed := v_metrics.failed_executions + (CASE WHEN p_success THEN 0 ELSE 1 END);
  v_new_success_rate := ROUND(v_new_successful::NUMERIC / v_new_total::NUMERIC, 4);

  -- Calculate average execution time
  v_new_avg_time := ROUND(
    (v_metrics.avg_execution_time_ms * v_metrics.total_executions + p_execution_time_ms) / v_new_total::NUMERIC
  );

  -- Calculate signal metrics
  v_new_total_signals := v_metrics.total_signals_discovered + p_signals_count;
  v_new_avg_signals := ROUND(v_new_total_signals::NUMERIC / v_new_total::NUMERIC, 2);

  -- Calculate quality rate
  IF v_new_total_signals > 0 THEN
    v_new_quality_rate := ROUND(
      (v_metrics.high_quality_signals + p_high_quality_count)::NUMERIC / v_new_total_signals::NUMERIC,
      4
    );
  ELSE
    v_new_quality_rate := 0.0000;
  END IF;

  -- Calculate dynamic priority (weighted formula)
  -- Formula: (success_rate * 0.4) + (quality_rate * 0.3) + (avg_signals_normalized * 0.2) + (speed_score * 0.1)
  -- Speed score: 1.0 if avg_time < 10s, decreases linearly to 0.0 at 30s
  DECLARE
    v_speed_score NUMERIC(3,2);
    v_signals_normalized NUMERIC(3,2);
  BEGIN
    -- Speed score (0.0-1.0): faster is better
    v_speed_score := GREATEST(0.0, LEAST(1.0, 1.0 - ((v_new_avg_time - 10000.0) / 20000.0)));

    -- Normalize signals (0.0-1.0): assume 50 signals = 1.0
    v_signals_normalized := LEAST(1.0, v_new_avg_signals / 50.0);

    -- Weighted priority calculation
    v_new_calculated_priority := ROUND(
      (v_new_success_rate * 0.4) +
      (v_new_quality_rate * 0.3) +
      (v_signals_normalized * 0.2) +
      (v_speed_score * 0.1),
      2
    );
  END;

  -- Update metrics
  UPDATE source_performance_metrics SET
    total_executions = v_new_total,
    successful_executions = v_new_successful,
    failed_executions = v_new_failed,
    success_rate = v_new_success_rate,
    avg_execution_time_ms = v_new_avg_time,
    min_execution_time_ms = LEAST(COALESCE(min_execution_time_ms, 999999), p_execution_time_ms),
    max_execution_time_ms = GREATEST(COALESCE(max_execution_time_ms, 0), p_execution_time_ms),
    total_signals_discovered = v_new_total_signals,
    avg_signals_per_execution = v_new_avg_signals,
    high_quality_signals = high_quality_signals + p_high_quality_count,
    quality_rate = v_new_quality_rate,
    calculated_priority = v_new_calculated_priority,
    effective_priority = COALESCE(manual_priority_override, v_new_calculated_priority),
    last_execution_at = CURRENT_TIMESTAMP,
    metrics_updated_at = CURRENT_TIMESTAMP
  WHERE source_id = p_source_id;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_source_performance IS 'Updates source performance metrics and recalculates dynamic priority';

-- ============================================================================
-- View: source_priority_rankings
-- ============================================================================

CREATE OR REPLACE VIEW source_priority_rankings AS
SELECT
  source_id,
  effective_priority,
  calculated_priority,
  manual_priority_override,
  success_rate,
  quality_rate,
  avg_signals_per_execution,
  avg_execution_time_ms,
  total_executions,
  successful_executions,
  failed_executions,
  last_execution_at,
  CASE
    WHEN manual_priority_override IS NOT NULL THEN 'MANUAL'
    WHEN calculated_priority >= 0.80 THEN 'EXCELLENT'
    WHEN calculated_priority >= 0.60 THEN 'GOOD'
    WHEN calculated_priority >= 0.40 THEN 'FAIR'
    ELSE 'POOR'
  END as priority_tier,
  RANK() OVER (ORDER BY effective_priority DESC) as priority_rank
FROM source_performance_metrics
ORDER BY effective_priority DESC, success_rate DESC;

COMMENT ON VIEW source_priority_rankings IS 'Source priority rankings with performance tiers (Sprint 19 Task 3)';

-- ============================================================================
-- Initial seed data
-- ============================================================================

INSERT INTO source_performance_metrics (source_id, manual_priority_override, effective_priority) VALUES
  ('news', 0.80, 0.80),
  ('linkedin', 0.70, 0.70),
  ('jobs', 0.60, 0.60),
  ('social', 0.50, 0.50)
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Source performance tracking tables created';
  RAISE NOTICE '✅ Performance calculation function created';
  RAISE NOTICE '✅ Priority rankings view created';
  RAISE NOTICE '✅ Initial source priorities seeded';
  RAISE NOTICE '';
  RAISE NOTICE 'Priority Formula: (success_rate * 0.4) + (quality_rate * 0.3) + (signals * 0.2) + (speed * 0.1)';
  RAISE NOTICE 'Priority Tiers: EXCELLENT (0.80+), GOOD (0.60+), FAIR (0.40+), POOR (<0.40)';
END $$;
