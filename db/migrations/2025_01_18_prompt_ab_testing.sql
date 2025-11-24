-- ═══════════════════════════════════════════════════════════════
-- Sprint 32 - Task 2: Prompt Optimization System (A/B Testing)
-- ═══════════════════════════════════════════════════════════════
-- Adds tables and indexes for tracking prompt performance and A/B tests
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. PROMPT EXECUTIONS TABLE
-- ───────────────────────────────────────────────────────────────
-- Tracks every prompt execution for performance analysis

CREATE TABLE IF NOT EXISTS prompt_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  -- Input/Output tracking
  input_variables JSONB DEFAULT '{}',
  output_data JSONB,
  output_quality_score NUMERIC(5,2),

  -- Conversion tracking (for outreach prompts)
  message_sent BOOLEAN DEFAULT false,
  message_opened BOOLEAN DEFAULT false,
  message_responded BOOLEAN DEFAULT false,

  -- Metadata
  user_id TEXT,
  company_id TEXT,
  contact_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (prompt_name, prompt_version)
    REFERENCES prompt_versions(name, version)
    ON DELETE CASCADE
);

-- Indexes for performance queries
CREATE INDEX IF NOT EXISTS idx_prompt_executions_name_version
  ON prompt_executions(prompt_name, prompt_version, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_executions_created
  ON prompt_executions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_executions_company
  ON prompt_executions(company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 2. A/B TEST CONFIGURATIONS TABLE
-- ───────────────────────────────────────────────────────────────
-- Manages active A/B tests with specific configurations

CREATE TABLE IF NOT EXISTS prompt_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name TEXT NOT NULL UNIQUE,

  -- Test configuration
  test_enabled BOOLEAN DEFAULT true,
  traffic_split JSONB DEFAULT '{}', -- {"v1.0": 0.5, "v2.0": 0.5}
  min_sample_size INTEGER DEFAULT 100,
  confidence_threshold NUMERIC(3,2) DEFAULT 0.95,

  -- Test status
  status TEXT DEFAULT 'RUNNING', -- RUNNING, PAUSED, COMPLETED, WINNER_DECLARED
  winning_version TEXT,
  winner_declared_at TIMESTAMPTZ,

  -- Metadata
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_ab_tests_enabled
  ON prompt_ab_tests(prompt_name, test_enabled)
  WHERE test_enabled = true;

-- ───────────────────────────────────────────────────────────────
-- 3. PROMPT PERFORMANCE MATERIALIZED VIEW
-- ───────────────────────────────────────────────────────────────
-- Aggregated performance metrics per prompt version (refreshed periodically)

CREATE MATERIALIZED VIEW IF NOT EXISTS prompt_performance_metrics AS
SELECT
  prompt_name,
  prompt_version,

  -- Execution metrics
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE success = true) as successful_executions,
  ROUND(AVG(execution_time_ms)::numeric, 2) as avg_execution_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as p50_execution_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time_ms,

  -- Quality metrics
  ROUND(AVG(output_quality_score)::numeric, 2) as avg_quality_score,

  -- Conversion metrics (for outreach prompts)
  COUNT(*) FILTER (WHERE message_sent = true) as messages_sent,
  COUNT(*) FILTER (WHERE message_opened = true) as messages_opened,
  COUNT(*) FILTER (WHERE message_responded = true) as messages_responded,

  -- Conversion rates
  CASE
    WHEN COUNT(*) FILTER (WHERE message_sent = true) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE message_opened = true)::numeric /
                COUNT(*) FILTER (WHERE message_sent = true) * 100), 2)
    ELSE 0
  END as open_rate,

  CASE
    WHEN COUNT(*) FILTER (WHERE message_sent = true) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE message_responded = true)::numeric /
                COUNT(*) FILTER (WHERE message_sent = true) * 100), 2)
    ELSE 0
  END as response_rate,

  -- Success rate
  ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / COUNT(*) * 100), 2) as success_rate,

  -- Time window
  MIN(created_at) as first_execution,
  MAX(created_at) as last_execution

FROM prompt_executions
GROUP BY prompt_name, prompt_version;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_perf_metrics_name_version
  ON prompt_performance_metrics(prompt_name, prompt_version);

-- ───────────────────────────────────────────────────────────────
-- 4. HELPER FUNCTIONS
-- ───────────────────────────────────────────────────────────────

-- Function to refresh performance metrics
CREATE OR REPLACE FUNCTION refresh_prompt_performance_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY prompt_performance_metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to declare A/B test winner
CREATE OR REPLACE FUNCTION declare_ab_test_winner(
  p_prompt_name TEXT,
  p_winning_version TEXT
)
RETURNS void AS $$
BEGIN
  -- Update A/B test status
  UPDATE prompt_ab_tests
  SET
    status = 'WINNER_DECLARED',
    winning_version = p_winning_version,
    winner_declared_at = NOW(),
    updated_at = NOW()
  WHERE prompt_name = p_prompt_name;

  -- Deactivate losing versions
  UPDATE prompt_versions
  SET active = false
  WHERE name = p_prompt_name
    AND version != p_winning_version
    AND active = true;

  RAISE NOTICE 'Winner declared: % version %', p_prompt_name, p_winning_version;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────
-- 5. AUTOMATIC METRICS REFRESH (Optional - use external scheduler)
-- ───────────────────────────────────────────────────────────────

-- NOTE: In production, refresh metrics periodically via cron or Cloud Scheduler
-- For development, refresh on-demand: SELECT refresh_prompt_performance_metrics();

-- ───────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ A/B Testing infrastructure installed';
  RAISE NOTICE '   - prompt_executions table created';
  RAISE NOTICE '   - prompt_ab_tests table created';
  RAISE NOTICE '   - prompt_performance_metrics view created';
  RAISE NOTICE '   - Helper functions installed';
END $$;
