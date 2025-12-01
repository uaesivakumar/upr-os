-- =====================================================
-- S70: Autonomous Observability
-- Sprint 70: Cost & Token Tracking + Performance Metrics
-- =====================================================

-- =====================================================
-- LLM USAGE METRICS
-- Track all LLM API calls with token counts and costs
-- =====================================================

CREATE TABLE IF NOT EXISTS llm_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical_slug VARCHAR(100),
  territory_id UUID,

  -- Source tracking
  service VARCHAR(100) NOT NULL,  -- 'auto-discovery', 'auto-outreach', 'journey-engine', etc.
  operation VARCHAR(100) NOT NULL,  -- 'enrich', 'classify', 'generate', 'embed', etc.
  correlation_id UUID,
  task_id UUID REFERENCES autonomous_task_queue(id),

  -- Provider details
  provider VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'google', etc.
  model VARCHAR(100) NOT NULL,  -- 'gpt-4', 'claude-3-opus', etc.
  model_version VARCHAR(50),

  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cached_tokens INTEGER DEFAULT 0,  -- For providers with caching

  -- Cost calculation (in USD, stored as microdollars for precision)
  input_cost_micros BIGINT NOT NULL DEFAULT 0,  -- Cost in microdollars (1 USD = 1,000,000)
  output_cost_micros BIGINT NOT NULL DEFAULT 0,
  total_cost_micros BIGINT GENERATED ALWAYS AS (input_cost_micros + output_cost_micros) STORED,

  -- Performance
  latency_ms INTEGER,
  request_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_timestamp TIMESTAMPTZ,

  -- Status
  success BOOLEAN NOT NULL DEFAULT true,
  error_code VARCHAR(50),
  error_message TEXT,

  -- Metadata
  request_metadata JSONB DEFAULT '{}',
  response_metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for LLM usage queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_service ON llm_usage_metrics(service);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage_metrics(provider);
CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage_metrics(model);
CREATE INDEX IF NOT EXISTS idx_llm_usage_vertical ON llm_usage_metrics(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_llm_usage_territory ON llm_usage_metrics(territory_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_correlation ON llm_usage_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_task ON llm_usage_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_success ON llm_usage_metrics(success);

-- =====================================================
-- MODEL PRICING TABLE
-- Store pricing for different models (updated periodically)
-- =====================================================

CREATE TABLE IF NOT EXISTS llm_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  model_version VARCHAR(50),

  -- Pricing per 1M tokens (in microdollars)
  input_price_per_million_micros BIGINT NOT NULL,  -- e.g., 15_000_000 for $15/1M tokens
  output_price_per_million_micros BIGINT NOT NULL,
  cached_input_price_per_million_micros BIGINT,  -- For cached tokens

  -- Metadata
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(provider, model, model_version, effective_from)
);

-- Insert default pricing for common models
INSERT INTO llm_model_pricing (provider, model, input_price_per_million_micros, output_price_per_million_micros) VALUES
  -- OpenAI
  ('openai', 'gpt-4o', 2_500_000, 10_000_000),  -- $2.50/$10 per 1M tokens
  ('openai', 'gpt-4o-mini', 150_000, 600_000),  -- $0.15/$0.60 per 1M tokens
  ('openai', 'gpt-4-turbo', 10_000_000, 30_000_000),
  ('openai', 'gpt-3.5-turbo', 500_000, 1_500_000),
  -- Anthropic
  ('anthropic', 'claude-3-5-sonnet', 3_000_000, 15_000_000),  -- $3/$15 per 1M tokens
  ('anthropic', 'claude-3-opus', 15_000_000, 75_000_000),
  ('anthropic', 'claude-3-haiku', 250_000, 1_250_000),
  -- Google
  ('google', 'gemini-1.5-pro', 3_500_000, 10_500_000),
  ('google', 'gemini-1.5-flash', 75_000, 300_000)
ON CONFLICT DO NOTHING;

-- =====================================================
-- AUTONOMOUS PERFORMANCE METRICS
-- Track success/failure, throughput, latency for autonomous operations
-- =====================================================

CREATE TABLE IF NOT EXISTS autonomous_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical_slug VARCHAR(100),
  territory_id UUID,

  -- Event identification
  service VARCHAR(100) NOT NULL,  -- 'auto-discovery', 'auto-outreach', 'autonomous-safety'
  operation VARCHAR(100) NOT NULL,  -- 'enrich', 'send_email', 'checkpoint_approve', etc.
  event_type VARCHAR(50) NOT NULL,  -- 'started', 'completed', 'failed', 'retried', 'cancelled'

  -- Correlation
  correlation_id UUID,
  task_id UUID,
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),

  -- Performance metrics
  duration_ms INTEGER,  -- Time taken for operation
  queue_wait_ms INTEGER,  -- Time spent in queue before processing

  -- Throughput indicators
  batch_size INTEGER DEFAULT 1,
  items_processed INTEGER DEFAULT 1,
  items_succeeded INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,

  -- Quality indicators
  confidence_score NUMERIC(5,4),  -- 0.0000 to 1.0000
  quality_score NUMERIC(5,4),

  -- Conversion indicators (for outreach)
  opened BOOLEAN,
  clicked BOOLEAN,
  replied BOOLEAN,
  converted BOOLEAN,

  -- Error tracking
  error_code VARCHAR(50),
  error_category VARCHAR(50),  -- 'rate_limit', 'timeout', 'invalid_data', 'provider_error', etc.
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Resource usage
  memory_mb NUMERIC(10,2),
  cpu_ms INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance queries
CREATE INDEX IF NOT EXISTS idx_perf_service ON autonomous_performance_metrics(service);
CREATE INDEX IF NOT EXISTS idx_perf_operation ON autonomous_performance_metrics(operation);
CREATE INDEX IF NOT EXISTS idx_perf_event_type ON autonomous_performance_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_perf_vertical ON autonomous_performance_metrics(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_perf_territory ON autonomous_performance_metrics(territory_id);
CREATE INDEX IF NOT EXISTS idx_perf_created ON autonomous_performance_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_perf_correlation ON autonomous_performance_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_perf_error_category ON autonomous_performance_metrics(error_category);

-- =====================================================
-- AUTONOMOUS DAILY SUMMARY
-- Pre-aggregated daily metrics for fast dashboard queries
-- =====================================================

CREATE TABLE IF NOT EXISTS autonomous_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Aggregation key
  summary_date DATE NOT NULL,
  vertical_slug VARCHAR(100),  -- NULL for global
  territory_id UUID,  -- NULL for global
  service VARCHAR(100) NOT NULL,

  -- LLM Usage
  total_llm_calls INTEGER DEFAULT 0,
  successful_llm_calls INTEGER DEFAULT 0,
  failed_llm_calls INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cost_micros BIGINT DEFAULT 0,
  avg_latency_ms NUMERIC(10,2),
  p95_latency_ms INTEGER,
  p99_latency_ms INTEGER,

  -- Performance
  total_operations INTEGER DEFAULT 0,
  successful_operations INTEGER DEFAULT 0,
  failed_operations INTEGER DEFAULT 0,
  retried_operations INTEGER DEFAULT 0,
  cancelled_operations INTEGER DEFAULT 0,

  -- Throughput
  total_items_processed INTEGER DEFAULT 0,
  total_items_succeeded INTEGER DEFAULT 0,
  total_items_failed INTEGER DEFAULT 0,
  avg_batch_size NUMERIC(10,2),
  avg_duration_ms NUMERIC(10,2),
  avg_queue_wait_ms NUMERIC(10,2),

  -- Quality
  avg_confidence_score NUMERIC(5,4),
  avg_quality_score NUMERIC(5,4),

  -- Conversion (outreach)
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  open_rate NUMERIC(5,4),
  click_rate NUMERIC(5,4),
  reply_rate NUMERIC(5,4),
  conversion_rate NUMERIC(5,4),

  -- Error breakdown
  error_counts JSONB DEFAULT '{}',  -- { "rate_limit": 5, "timeout": 3, ... }

  -- Kill switch
  kill_switch_activations INTEGER DEFAULT 0,
  checkpoint_approvals INTEGER DEFAULT 0,
  checkpoint_rejections INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(summary_date, vertical_slug, territory_id, service)
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON autonomous_daily_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_service ON autonomous_daily_summary(service);
CREATE INDEX IF NOT EXISTS idx_daily_vertical ON autonomous_daily_summary(vertical_slug);

-- =====================================================
-- VIEWS
-- =====================================================

-- Real-time cost view by service (last 24 hours)
CREATE OR REPLACE VIEW v_llm_cost_24h AS
SELECT
  service,
  provider,
  model,
  COUNT(*) as call_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_micros) / 1000000.0 as total_cost_usd,
  AVG(latency_ms) as avg_latency_ms,
  COUNT(*) FILTER (WHERE NOT success) as failed_calls
FROM llm_usage_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY service, provider, model
ORDER BY total_cost_usd DESC;

-- Real-time performance view (last 24 hours)
CREATE OR REPLACE VIEW v_performance_24h AS
SELECT
  service,
  operation,
  COUNT(*) FILTER (WHERE event_type = 'started') as started,
  COUNT(*) FILTER (WHERE event_type = 'completed') as completed,
  COUNT(*) FILTER (WHERE event_type = 'failed') as failed,
  COUNT(*) FILTER (WHERE event_type = 'retried') as retried,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'completed')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE event_type IN ('completed', 'failed')), 0) * 100,
    2
  ) as success_rate,
  AVG(duration_ms) FILTER (WHERE event_type = 'completed') as avg_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE event_type = 'completed') as p95_duration_ms,
  SUM(items_processed) as total_items,
  SUM(items_succeeded) as items_succeeded,
  SUM(items_failed) as items_failed
FROM autonomous_performance_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY service, operation
ORDER BY service, operation;

-- Error summary view (last 24 hours)
CREATE OR REPLACE VIEW v_error_summary_24h AS
SELECT
  service,
  error_category,
  error_code,
  COUNT(*) as error_count,
  MIN(created_at) as first_occurrence,
  MAX(created_at) as last_occurrence,
  COUNT(DISTINCT correlation_id) as affected_correlations
FROM autonomous_performance_metrics
WHERE event_type = 'failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY service, error_category, error_code
ORDER BY error_count DESC;

-- Conversion funnel view (outreach)
CREATE OR REPLACE VIEW v_outreach_funnel AS
SELECT
  vertical_slug,
  territory_id,
  DATE(created_at) as date,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE opened) as opened,
  COUNT(*) FILTER (WHERE clicked) as clicked,
  COUNT(*) FILTER (WHERE replied) as replied,
  COUNT(*) FILTER (WHERE converted) as converted,
  ROUND(COUNT(*) FILTER (WHERE opened)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as open_rate,
  ROUND(COUNT(*) FILTER (WHERE clicked)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as click_rate,
  ROUND(COUNT(*) FILTER (WHERE replied)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as reply_rate,
  ROUND(COUNT(*) FILTER (WHERE converted)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate
FROM autonomous_performance_metrics
WHERE service = 'auto-outreach'
  AND operation = 'send'
GROUP BY vertical_slug, territory_id, DATE(created_at)
ORDER BY date DESC;

-- Cost trend view (last 30 days)
CREATE OR REPLACE VIEW v_cost_trend_30d AS
SELECT
  DATE(created_at) as date,
  service,
  SUM(total_cost_micros) / 1000000.0 as daily_cost_usd,
  SUM(total_tokens) as daily_tokens,
  COUNT(*) as daily_calls
FROM llm_usage_metrics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), service
ORDER BY date DESC, service;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Calculate LLM cost based on model pricing
CREATE OR REPLACE FUNCTION calculate_llm_cost(
  p_provider VARCHAR,
  p_model VARCHAR,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_cached_tokens INTEGER DEFAULT 0
) RETURNS TABLE (
  input_cost_micros BIGINT,
  output_cost_micros BIGINT,
  total_cost_micros BIGINT
) AS $$
DECLARE
  v_pricing llm_model_pricing%ROWTYPE;
  v_input_cost BIGINT;
  v_output_cost BIGINT;
BEGIN
  -- Get active pricing for model
  SELECT * INTO v_pricing
  FROM llm_model_pricing
  WHERE provider = p_provider
    AND model = p_model
    AND is_active = true
    AND (effective_until IS NULL OR effective_until > NOW())
  ORDER BY effective_from DESC
  LIMIT 1;

  -- If no pricing found, use zero
  IF v_pricing IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  -- Calculate costs (tokens / 1M * price_per_million)
  v_input_cost := ((p_input_tokens - COALESCE(p_cached_tokens, 0))::BIGINT * v_pricing.input_price_per_million_micros) / 1000000;

  -- Add cached token cost if applicable
  IF p_cached_tokens > 0 AND v_pricing.cached_input_price_per_million_micros IS NOT NULL THEN
    v_input_cost := v_input_cost + (p_cached_tokens::BIGINT * v_pricing.cached_input_price_per_million_micros) / 1000000;
  END IF;

  v_output_cost := (p_output_tokens::BIGINT * v_pricing.output_price_per_million_micros) / 1000000;

  RETURN QUERY SELECT v_input_cost, v_output_cost, v_input_cost + v_output_cost;
END;
$$ LANGUAGE plpgsql;

-- Aggregate daily summary (called by scheduler)
CREATE OR REPLACE FUNCTION aggregate_daily_summary(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Delete existing summaries for this date
  DELETE FROM autonomous_daily_summary WHERE summary_date = p_date;

  -- Insert LLM usage aggregates
  INSERT INTO autonomous_daily_summary (
    summary_date, vertical_slug, territory_id, service,
    total_llm_calls, successful_llm_calls, failed_llm_calls,
    total_input_tokens, total_output_tokens, total_cost_micros,
    avg_latency_ms
  )
  SELECT
    p_date,
    vertical_slug,
    territory_id,
    service,
    COUNT(*),
    COUNT(*) FILTER (WHERE success),
    COUNT(*) FILTER (WHERE NOT success),
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(total_cost_micros), 0),
    AVG(latency_ms)
  FROM llm_usage_metrics
  WHERE DATE(created_at) = p_date
  GROUP BY vertical_slug, territory_id, service
  ON CONFLICT (summary_date, vertical_slug, territory_id, service)
  DO UPDATE SET
    total_llm_calls = EXCLUDED.total_llm_calls,
    successful_llm_calls = EXCLUDED.successful_llm_calls,
    failed_llm_calls = EXCLUDED.failed_llm_calls,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    total_cost_micros = EXCLUDED.total_cost_micros,
    avg_latency_ms = EXCLUDED.avg_latency_ms,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update with performance metrics
  UPDATE autonomous_daily_summary ds
  SET
    total_operations = perf.total_ops,
    successful_operations = perf.successful_ops,
    failed_operations = perf.failed_ops,
    retried_operations = perf.retried_ops,
    cancelled_operations = perf.cancelled_ops,
    total_items_processed = perf.items_processed,
    total_items_succeeded = perf.items_succeeded,
    total_items_failed = perf.items_failed,
    avg_duration_ms = perf.avg_duration,
    avg_queue_wait_ms = perf.avg_queue_wait,
    avg_confidence_score = perf.avg_confidence,
    avg_quality_score = perf.avg_quality,
    updated_at = NOW()
  FROM (
    SELECT
      vertical_slug,
      territory_id,
      service,
      COUNT(*) as total_ops,
      COUNT(*) FILTER (WHERE event_type = 'completed') as successful_ops,
      COUNT(*) FILTER (WHERE event_type = 'failed') as failed_ops,
      COUNT(*) FILTER (WHERE event_type = 'retried') as retried_ops,
      COUNT(*) FILTER (WHERE event_type = 'cancelled') as cancelled_ops,
      COALESCE(SUM(items_processed), 0) as items_processed,
      COALESCE(SUM(items_succeeded), 0) as items_succeeded,
      COALESCE(SUM(items_failed), 0) as items_failed,
      AVG(duration_ms) as avg_duration,
      AVG(queue_wait_ms) as avg_queue_wait,
      AVG(confidence_score) as avg_confidence,
      AVG(quality_score) as avg_quality
    FROM autonomous_performance_metrics
    WHERE DATE(created_at) = p_date
    GROUP BY vertical_slug, territory_id, service
  ) perf
  WHERE ds.summary_date = p_date
    AND ds.vertical_slug IS NOT DISTINCT FROM perf.vertical_slug
    AND ds.territory_id IS NOT DISTINCT FROM perf.territory_id
    AND ds.service = perf.service;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Get cost summary for date range
CREATE OR REPLACE FUNCTION get_cost_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_vertical_slug VARCHAR DEFAULT NULL,
  p_territory_id UUID DEFAULT NULL
) RETURNS TABLE (
  service VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  total_calls BIGINT,
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  avg_cost_per_call NUMERIC,
  avg_tokens_per_call NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lum.service,
    lum.provider,
    lum.model,
    COUNT(*)::BIGINT as total_calls,
    SUM(lum.total_tokens)::BIGINT as total_tokens,
    ROUND(SUM(lum.total_cost_micros) / 1000000.0, 4) as total_cost_usd,
    ROUND(AVG(lum.total_cost_micros) / 1000000.0, 6) as avg_cost_per_call,
    ROUND(AVG(lum.total_tokens), 2) as avg_tokens_per_call
  FROM llm_usage_metrics lum
  WHERE DATE(lum.created_at) BETWEEN p_start_date AND p_end_date
    AND (p_vertical_slug IS NULL OR lum.vertical_slug = p_vertical_slug)
    AND (p_territory_id IS NULL OR lum.territory_id = p_territory_id)
  GROUP BY lum.service, lum.provider, lum.model
  ORDER BY total_cost_usd DESC;
END;
$$ LANGUAGE plpgsql;

-- Get performance summary for date range
CREATE OR REPLACE FUNCTION get_performance_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_service VARCHAR DEFAULT NULL,
  p_vertical_slug VARCHAR DEFAULT NULL
) RETURNS TABLE (
  service VARCHAR,
  operation VARCHAR,
  total_operations BIGINT,
  success_rate NUMERIC,
  avg_duration_ms NUMERIC,
  p95_duration_ms NUMERIC,
  total_items BIGINT,
  item_success_rate NUMERIC,
  error_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    apm.service,
    apm.operation,
    COUNT(*)::BIGINT as total_operations,
    ROUND(
      COUNT(*) FILTER (WHERE apm.event_type = 'completed')::NUMERIC /
      NULLIF(COUNT(*) FILTER (WHERE apm.event_type IN ('completed', 'failed')), 0) * 100,
      2
    ) as success_rate,
    ROUND(AVG(apm.duration_ms), 2) as avg_duration_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY apm.duration_ms)::NUMERIC, 2) as p95_duration_ms,
    COALESCE(SUM(apm.items_processed), 0)::BIGINT as total_items,
    ROUND(
      COALESCE(SUM(apm.items_succeeded), 0)::NUMERIC /
      NULLIF(COALESCE(SUM(apm.items_processed), 0), 0) * 100,
      2
    ) as item_success_rate,
    COUNT(*) FILTER (WHERE apm.event_type = 'failed')::BIGINT as error_count
  FROM autonomous_performance_metrics apm
  WHERE DATE(apm.created_at) BETWEEN p_start_date AND p_end_date
    AND (p_service IS NULL OR apm.service = p_service)
    AND (p_vertical_slug IS NULL OR apm.vertical_slug = p_vertical_slug)
  GROUP BY apm.service, apm.operation
  ORDER BY apm.service, total_operations DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE llm_usage_metrics IS 'S70: Tracks all LLM API calls with token counts and costs';
COMMENT ON TABLE llm_model_pricing IS 'S70: Stores pricing for different LLM models';
COMMENT ON TABLE autonomous_performance_metrics IS 'S70: Tracks success/failure, throughput, latency for autonomous operations';
COMMENT ON TABLE autonomous_daily_summary IS 'S70: Pre-aggregated daily metrics for fast dashboard queries';

COMMENT ON VIEW v_llm_cost_24h IS 'S70: Real-time LLM cost summary for last 24 hours';
COMMENT ON VIEW v_performance_24h IS 'S70: Real-time performance summary for last 24 hours';
COMMENT ON VIEW v_error_summary_24h IS 'S70: Error breakdown for last 24 hours';
COMMENT ON VIEW v_outreach_funnel IS 'S70: Outreach conversion funnel metrics';
COMMENT ON VIEW v_cost_trend_30d IS 'S70: Cost trend for last 30 days';

COMMENT ON FUNCTION calculate_llm_cost IS 'S70: Calculate LLM cost based on model pricing';
COMMENT ON FUNCTION aggregate_daily_summary IS 'S70: Aggregate daily metrics summary';
COMMENT ON FUNCTION get_cost_summary IS 'S70: Get cost summary for date range';
COMMENT ON FUNCTION get_performance_summary IS 'S70: Get performance summary for date range';
