-- Migration: Orchestration Runs Table
-- Sprint 19, Task 1: Multi-Source Orchestration
-- Date: 2025-11-12
--
-- Purpose: Track multi-source orchestration executions for monitoring and analytics

-- ============================================================================
-- Table: orchestration_runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration_runs (
  id SERIAL PRIMARY KEY,
  orchestration_id TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES users(id),

  -- Execution details
  sources TEXT[] NOT NULL,                    -- Array of source IDs executed (e.g., ['news', 'linkedin'])
  signals_discovered INTEGER DEFAULT 0,       -- Total signals found
  successful_sources INTEGER DEFAULT 0,       -- Number of sources that succeeded
  failed_sources INTEGER DEFAULT 0,           -- Number of sources that failed
  execution_time_ms INTEGER NOT NULL,         -- Total execution time

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Indexes
  CONSTRAINT orchestration_runs_orchestration_id_key UNIQUE (orchestration_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_tenant_id
  ON orchestration_runs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_created_at
  ON orchestration_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_sources
  ON orchestration_runs USING GIN(sources);

-- Comments
COMMENT ON TABLE orchestration_runs IS 'Tracks multi-source signal discovery orchestration executions';
COMMENT ON COLUMN orchestration_runs.orchestration_id IS 'Unique identifier for orchestration run (e.g., orch_1699876543_abc123)';
COMMENT ON COLUMN orchestration_runs.sources IS 'Array of source IDs that were executed in this run';
COMMENT ON COLUMN orchestration_runs.signals_discovered IS 'Total number of signals discovered across all sources';
COMMENT ON COLUMN orchestration_runs.execution_time_ms IS 'Total time taken to execute all sources in milliseconds';

-- ============================================================================
-- Table: source_health
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_health (
  id SERIAL PRIMARY KEY,
  source_id TEXT UNIQUE NOT NULL,
  source_name TEXT NOT NULL,

  -- Health metrics
  enabled BOOLEAN DEFAULT true,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  avg_execution_time_ms INTEGER DEFAULT 0,
  last_success_at TIMESTAMP,
  last_failure_at TIMESTAMP,

  -- Circuit breaker state
  circuit_breaker_state TEXT DEFAULT 'CLOSED',  -- CLOSED, OPEN, HALF_OPEN
  failure_count INTEGER DEFAULT 0,

  -- Performance metrics
  signals_per_run DECIMAL(10, 2) DEFAULT 0,
  uptime_percentage DECIMAL(5, 2) DEFAULT 100.0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_health_source_id
  ON source_health(source_id);

CREATE INDEX IF NOT EXISTS idx_source_health_enabled
  ON source_health(enabled);

-- Comments
COMMENT ON TABLE source_health IS 'Tracks health and performance metrics for each signal discovery source';
COMMENT ON COLUMN source_health.circuit_breaker_state IS 'Circuit breaker state: CLOSED (healthy), OPEN (failing), HALF_OPEN (testing)';
COMMENT ON COLUMN source_health.uptime_percentage IS 'Percentage of successful runs (successful_runs / total_runs * 100)';

-- ============================================================================
-- Initial source health records
-- ============================================================================

INSERT INTO source_health (source_id, source_name, enabled) VALUES
  ('news', 'News Scraping (SerpAPI)', true),
  ('linkedin', 'LinkedIn Company Updates', true),
  ('jobs', 'Job Boards (Indeed, LinkedIn Jobs)', false),
  ('social', 'Social Media (Twitter/X)', false)
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================================
-- Function: Update source health after run
-- ============================================================================

CREATE OR REPLACE FUNCTION update_source_health(
  p_source_id TEXT,
  p_success BOOLEAN,
  p_execution_time_ms INTEGER,
  p_signals_count INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE source_health
  SET
    total_runs = total_runs + 1,
    successful_runs = CASE WHEN p_success THEN successful_runs + 1 ELSE successful_runs END,
    failed_runs = CASE WHEN NOT p_success THEN failed_runs + 1 ELSE failed_runs END,
    avg_execution_time_ms = (avg_execution_time_ms * total_runs + p_execution_time_ms) / (total_runs + 1),
    last_success_at = CASE WHEN p_success THEN NOW() ELSE last_success_at END,
    last_failure_at = CASE WHEN NOT p_success THEN NOW() ELSE last_failure_at END,
    failure_count = CASE WHEN p_success THEN 0 ELSE failure_count + 1 END,
    circuit_breaker_state = CASE
      WHEN p_success THEN 'CLOSED'
      WHEN failure_count + 1 >= 3 THEN 'OPEN'
      ELSE circuit_breaker_state
    END,
    signals_per_run = CASE
      WHEN p_success THEN (signals_per_run * successful_runs + p_signals_count) / (successful_runs + 1)
      ELSE signals_per_run
    END,
    uptime_percentage = (successful_runs::DECIMAL / NULLIF(total_runs, 0)) * 100,
    updated_at = NOW()
  WHERE source_id = p_source_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_source_health IS 'Updates source health metrics after each orchestration run';

-- ============================================================================
-- View: Orchestration analytics
-- ============================================================================

CREATE OR REPLACE VIEW orchestration_analytics AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_runs,
  SUM(signals_discovered) as total_signals,
  AVG(signals_discovered) as avg_signals_per_run,
  SUM(successful_sources) as total_successful_sources,
  SUM(failed_sources) as total_failed_sources,
  AVG(execution_time_ms) as avg_execution_time_ms,
  (SUM(successful_sources)::DECIMAL / NULLIF(SUM(successful_sources) + SUM(failed_sources), 0) * 100) as success_rate_percentage
FROM orchestration_runs
GROUP BY DATE(created_at)
ORDER BY date DESC;

COMMENT ON VIEW orchestration_analytics IS 'Daily aggregated orchestration performance metrics';

-- ============================================================================
-- Grant permissions
-- ============================================================================

-- Note: Adjust permissions based on your user roles
-- GRANT SELECT, INSERT, UPDATE ON orchestration_runs TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON source_health TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE orchestration_runs_id_seq TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE source_health_id_seq TO your_app_user;

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Verify tables created
SELECT
  'orchestration_runs' as table_name,
  COUNT(*) as row_count
FROM orchestration_runs
UNION ALL
SELECT
  'source_health' as table_name,
  COUNT(*) as row_count
FROM source_health;
