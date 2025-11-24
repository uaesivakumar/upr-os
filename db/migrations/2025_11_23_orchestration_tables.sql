-- Orchestration Hardening Migration
-- Sprint 69: Orchestration Hardening & Fail-Safe
--
-- Tables for pipeline state persistence and dead letter queue

-- ==================================================================
-- 1. Pipeline Executions Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS pipeline_executions (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Pipeline state
  state VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Configuration and results
  config JSONB DEFAULT '{}',
  results JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  errors JSONB DEFAULT '[]',

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_exec_tenant ON pipeline_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_exec_state ON pipeline_executions(state);
CREATE INDEX IF NOT EXISTS idx_pipeline_exec_started ON pipeline_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_exec_tenant_state ON pipeline_executions(tenant_id, state);

-- ==================================================================
-- 2. Dead Letter Queue Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Reference to original pipeline
  pipeline_id VARCHAR(100),
  step_name VARCHAR(50) NOT NULL,

  -- Error details
  error_message TEXT,
  error_stack TEXT,

  -- Original configuration for retry
  config JSONB DEFAULT '{}',

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Processing status
  processed_at TIMESTAMPTZ,
  processed_result JSONB,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON dead_letter_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_pipeline ON dead_letter_queue(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_dlq_step ON dead_letter_queue(step_name);
CREATE INDEX IF NOT EXISTS idx_dlq_unprocessed ON dead_letter_queue(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_created ON dead_letter_queue(created_at);

-- ==================================================================
-- 3. Circuit Breaker State Table (for distributed systems)
-- ==================================================================

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  service_name VARCHAR(50) NOT NULL,

  -- State
  state VARCHAR(20) NOT NULL DEFAULT 'closed',
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,

  -- Timing
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,

  -- Configuration
  failure_threshold INTEGER DEFAULT 5,
  success_threshold INTEGER DEFAULT 2,
  timeout_ms INTEGER DEFAULT 30000,
  reset_timeout_ms INTEGER DEFAULT 60000,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, service_name)
);

CREATE INDEX IF NOT EXISTS idx_cb_state_tenant ON circuit_breaker_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cb_state_service ON circuit_breaker_state(service_name);
CREATE INDEX IF NOT EXISTS idx_cb_state_state ON circuit_breaker_state(state);

-- ==================================================================
-- 4. Pipeline Templates Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Template definition
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Configuration
  mode VARCHAR(50) NOT NULL DEFAULT 'full',
  steps JSONB DEFAULT '[]',
  config JSONB DEFAULT '{}',

  -- Usage tracking
  execution_count INTEGER DEFAULT 0,
  last_execution_at TIMESTAMPTZ,
  avg_duration_ms INTEGER,
  success_rate DECIMAL(5,2),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,

  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_tmpl_tenant ON pipeline_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_tmpl_name ON pipeline_templates(name);
CREATE INDEX IF NOT EXISTS idx_pipeline_tmpl_active ON pipeline_templates(is_active);

-- ==================================================================
-- 5. Pipeline Metrics Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS pipeline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Reference
  pipeline_id VARCHAR(100),
  step_name VARCHAR(50),

  -- Metrics
  duration_ms INTEGER,
  memory_used_mb INTEGER,
  cpu_time_ms INTEGER,

  -- Results
  input_count INTEGER,
  output_count INTEGER,
  error_count INTEGER,

  -- Quality metrics
  data_quality_score DECIMAL(5,2),

  -- Timing
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_tenant ON pipeline_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_pipeline ON pipeline_metrics(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_step ON pipeline_metrics(step_name);
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_recorded ON pipeline_metrics(recorded_at);

-- ==================================================================
-- 6. Helper Functions
-- ==================================================================

-- Get unprocessed items from dead letter queue
CREATE OR REPLACE FUNCTION get_dlq_items(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  pipeline_id VARCHAR,
  step_name VARCHAR,
  error_message TEXT,
  config JSONB,
  retry_count INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dlq.id,
    dlq.pipeline_id,
    dlq.step_name,
    dlq.error_message,
    dlq.config,
    dlq.retry_count,
    dlq.created_at
  FROM dead_letter_queue dlq
  WHERE dlq.tenant_id = p_tenant_id
    AND dlq.processed_at IS NULL
    AND (dlq.max_retries IS NULL OR dlq.retry_count < dlq.max_retries)
  ORDER BY dlq.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pipeline execution stats
CREATE OR REPLACE FUNCTION get_pipeline_stats(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'completed', COUNT(*) FILTER (WHERE state = 'completed'),
    'failed', COUNT(*) FILTER (WHERE state = 'failed'),
    'running', COUNT(*) FILTER (WHERE state = 'running'),
    'avg_duration_ms', AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER
  ) INTO v_result
  FROM pipeline_executions
  WHERE tenant_id = p_tenant_id
    AND started_at >= NOW() - (p_days || ' days')::INTERVAL;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- 7. Insert Default Pipeline Templates
-- ==================================================================

INSERT INTO pipeline_templates (tenant_id, name, description, mode, steps, config, is_system) VALUES
('00000000-0000-0000-0000-000000000001', 'full_pipeline', 'Complete discovery-to-outreach pipeline', 'full',
 '[{"name":"discovery","type":"discovery"},{"name":"enrichment","type":"enrichment"},{"name":"scoring","type":"scoring"},{"name":"ranking","type":"ranking"},{"name":"outreach","type":"outreach"}]',
 '{"includeOutreach": true}', true),
('00000000-0000-0000-0000-000000000001', 'discovery_only', 'Signal discovery only', 'discovery',
 '[{"name":"discovery","type":"discovery"}]',
 '{}', true),
('00000000-0000-0000-0000-000000000001', 'score_and_rank', 'Score and rank existing entities', 'score',
 '[{"name":"scoring","type":"scoring"},{"name":"ranking","type":"ranking"}]',
 '{}', true),
('00000000-0000-0000-0000-000000000001', 'enrichment_pipeline', 'Enrich and score entities', 'enrich',
 '[{"name":"enrichment","type":"enrichment"},{"name":"scoring","type":"scoring"},{"name":"ranking","type":"ranking"}]',
 '{}', true)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ==================================================================
-- 8. Row Level Security
-- ==================================================================

ALTER TABLE pipeline_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_exec_tenant_isolation ON pipeline_executions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY dlq_tenant_isolation ON dead_letter_queue
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY cb_state_tenant_isolation ON circuit_breaker_state
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY pipeline_tmpl_tenant_isolation ON pipeline_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY pipeline_metrics_tenant_isolation ON pipeline_metrics
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ==================================================================
-- 9. Comments
-- ==================================================================

COMMENT ON TABLE pipeline_executions IS 'Sprint 69: Pipeline execution state persistence';
COMMENT ON TABLE dead_letter_queue IS 'Sprint 69: Failed pipeline steps for retry';
COMMENT ON TABLE circuit_breaker_state IS 'Sprint 69: Circuit breaker state for distributed deployments';
COMMENT ON TABLE pipeline_templates IS 'Sprint 69: Reusable pipeline configurations';
COMMENT ON TABLE pipeline_metrics IS 'Sprint 69: Pipeline performance metrics';
