-- ============================================================================
-- Sprint 51: LLM Engine Routing - Database Schema
-- ============================================================================
--
-- This migration creates tables for:
-- 1. LLM provider registry (OpenAI, Anthropic, Vertex AI, etc.)
-- 2. Model configurations and capabilities
-- 3. Routing rules and conditions
-- 4. Fallback chains
-- 5. Cost tracking and usage metrics
-- 6. Performance benchmarks
-- 7. Journey state for resume/abort
-- ============================================================================

-- ============================================================================
-- LLM PROVIDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  provider_type VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'vertex', 'azure', 'local'
  base_url VARCHAR(500),
  api_version VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  supports_streaming BOOLEAN DEFAULT true,
  supports_functions BOOLEAN DEFAULT true,
  supports_vision BOOLEAN DEFAULT false,
  max_context_tokens INTEGER DEFAULT 128000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LLM MODELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  model_id VARCHAR(100) NOT NULL, -- e.g., 'gpt-4o', 'claude-3-opus'
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  model_family VARCHAR(50), -- 'gpt-4', 'claude-3', 'gemini'

  -- Capabilities
  max_input_tokens INTEGER DEFAULT 128000,
  max_output_tokens INTEGER DEFAULT 4096,
  supports_streaming BOOLEAN DEFAULT true,
  supports_functions BOOLEAN DEFAULT true,
  supports_vision BOOLEAN DEFAULT false,
  supports_json_mode BOOLEAN DEFAULT false,

  -- Cost (per 1M tokens)
  input_cost_per_million DECIMAL(10,4) DEFAULT 0,
  output_cost_per_million DECIMAL(10,4) DEFAULT 0,

  -- Performance
  avg_latency_ms INTEGER DEFAULT 1000,
  quality_score INTEGER DEFAULT 80, -- 0-100

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(provider_id, model_id)
);

-- ============================================================================
-- TASK TYPES (what the model is being used for)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_task_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Requirements
  requires_vision BOOLEAN DEFAULT false,
  requires_functions BOOLEAN DEFAULT false,
  requires_json BOOLEAN DEFAULT false,
  min_context_tokens INTEGER DEFAULT 4000,

  -- Preferences
  prefer_quality BOOLEAN DEFAULT true, -- vs prefer_speed
  prefer_cost_efficiency BOOLEAN DEFAULT false,
  max_latency_ms INTEGER DEFAULT 30000,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TASK-TO-MODEL MAPPINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_task_model_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id UUID NOT NULL REFERENCES llm_task_types(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,

  priority INTEGER DEFAULT 100, -- Lower = higher priority
  is_default BOOLEAN DEFAULT false,

  -- Conditions (JSON for flexibility)
  conditions JSONB DEFAULT '{}', -- e.g., {"vertical": "banking", "complexity": "high"}

  -- Override settings
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(task_type_id, model_id, conditions)
);

-- ============================================================================
-- ROUTING RULES (Conditional routing engine)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Rule definition
  rule_type VARCHAR(50) NOT NULL, -- 'condition', 'vertical', 'cost_limit', 'fallback'
  conditions JSONB NOT NULL DEFAULT '{}',
  -- Example conditions:
  -- {"vertical": "banking", "task": "outreach", "complexity": "high"}
  -- {"token_count_gt": 50000}
  -- {"cost_budget_remaining_lt": 10}

  -- Target model selection
  target_model_id UUID REFERENCES llm_models(id),
  target_model_slug VARCHAR(100), -- Alternative to ID

  -- Fallback behavior
  fallback_model_id UUID REFERENCES llm_models(id),

  -- Priority (lower = evaluated first)
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FALLBACK CHAINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_fallback_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,

  -- Chain configuration
  task_type_id UUID REFERENCES llm_task_types(id),
  vertical VARCHAR(50), -- Optional: vertical-specific chain

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_fallback_chain_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES llm_fallback_chains(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,

  step_order INTEGER NOT NULL,

  -- Conditions to skip this step
  skip_conditions JSONB DEFAULT '{}',
  -- e.g., {"if_error": "rate_limit", "skip": true}

  -- Timeout before moving to next
  timeout_ms INTEGER DEFAULT 30000,

  -- Retry settings
  max_retries INTEGER DEFAULT 2,
  retry_delay_ms INTEGER DEFAULT 1000,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(chain_id, step_order)
);

-- ============================================================================
-- MODEL USAGE & COST TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was used
  model_id UUID NOT NULL REFERENCES llm_models(id),
  task_type_id UUID REFERENCES llm_task_types(id),

  -- Context (passed from SaaS, not stored permanently)
  vertical VARCHAR(50),
  request_context JSONB DEFAULT '{}', -- Non-PII context

  -- Usage metrics
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost calculation
  input_cost DECIMAL(10,6) DEFAULT 0,
  output_cost DECIMAL(10,6) DEFAULT 0,
  total_cost DECIMAL(10,6) GENERATED ALWAYS AS (input_cost + output_cost) STORED,

  -- Performance
  latency_ms INTEGER,
  was_cached BOOLEAN DEFAULT false,
  was_fallback BOOLEAN DEFAULT false,
  fallback_reason VARCHAR(100),

  -- Status
  status VARCHAR(20) DEFAULT 'success', -- 'success', 'error', 'timeout', 'rate_limited'
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning for performance (by month)
CREATE INDEX idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX idx_llm_usage_logs_model_id ON llm_usage_logs(model_id);
CREATE INDEX idx_llm_usage_logs_task_type ON llm_usage_logs(task_type_id);

-- ============================================================================
-- MODEL PERFORMANCE BENCHMARKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_model_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,
  task_type_id UUID REFERENCES llm_task_types(id),

  -- Benchmark metrics
  benchmark_name VARCHAR(100) NOT NULL,
  score DECIMAL(5,2), -- 0-100
  latency_p50_ms INTEGER,
  latency_p95_ms INTEGER,
  latency_p99_ms INTEGER,

  -- Quality metrics
  accuracy_score DECIMAL(5,2),
  relevance_score DECIMAL(5,2),
  coherence_score DECIMAL(5,2),

  -- Cost efficiency
  cost_per_1k_tokens DECIMAL(10,6),
  tokens_per_second DECIMAL(10,2),

  benchmark_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(model_id, task_type_id, benchmark_name, benchmark_date)
);

-- ============================================================================
-- JOURNEY STATE (for resume/abort logic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_journey_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id VARCHAR(100) NOT NULL, -- External journey identifier

  -- Current state
  current_step VARCHAR(100) NOT NULL,
  state_data JSONB DEFAULT '{}',

  -- LLM context
  model_id UUID REFERENCES llm_models(id),
  conversation_history JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'completed', 'aborted'
  pause_reason TEXT,
  abort_reason TEXT,

  -- Resumability
  is_resumable BOOLEAN DEFAULT true,
  resume_checkpoint JSONB DEFAULT '{}',
  last_successful_step VARCHAR(100),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,

  -- Metrics
  total_tokens_used INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_journey_states_journey_id ON llm_journey_states(journey_id);
CREATE INDEX idx_llm_journey_states_status ON llm_journey_states(status);

-- ============================================================================
-- RESPONSE CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key
  cache_key VARCHAR(64) NOT NULL, -- SHA-256 of prompt + model + params
  model_id UUID NOT NULL REFERENCES llm_models(id),

  -- Request
  prompt_hash VARCHAR(64) NOT NULL,
  parameters_hash VARCHAR(64),

  -- Response
  response_text TEXT NOT NULL,
  response_tokens INTEGER,

  -- Metadata
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,

  -- TTL
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cache_key)
);

CREATE INDEX idx_llm_response_cache_expires ON llm_response_cache(expires_at);
CREATE INDEX idx_llm_response_cache_model ON llm_response_cache(model_id);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Model dashboard view
CREATE OR REPLACE VIEW v_llm_model_dashboard AS
SELECT
  m.id,
  m.slug,
  m.name,
  p.name as provider_name,
  p.provider_type,
  m.model_family,
  m.max_input_tokens,
  m.max_output_tokens,
  m.input_cost_per_million,
  m.output_cost_per_million,
  m.quality_score,
  m.is_active,
  m.is_default,
  m.priority,
  -- Usage stats (last 24h)
  COALESCE(u.request_count, 0) as requests_24h,
  COALESCE(u.total_tokens, 0) as tokens_24h,
  COALESCE(u.total_cost, 0) as cost_24h,
  COALESCE(u.avg_latency, 0) as avg_latency_24h,
  COALESCE(u.error_rate, 0) as error_rate_24h
FROM llm_models m
JOIN llm_providers p ON m.provider_id = p.id
LEFT JOIN (
  SELECT
    model_id,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost) as total_cost,
    AVG(latency_ms) as avg_latency,
    AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0.0 END) * 100 as error_rate
  FROM llm_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY model_id
) u ON m.id = u.model_id
ORDER BY m.priority, m.quality_score DESC;

-- Cost tracking view
CREATE OR REPLACE VIEW v_llm_cost_summary AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  m.slug as model_slug,
  m.name as model_name,
  p.name as provider_name,
  t.slug as task_type,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms
FROM llm_usage_logs l
JOIN llm_models m ON l.model_id = m.id
JOIN llm_providers p ON m.provider_id = p.id
LEFT JOIN llm_task_types t ON l.task_type_id = t.id
GROUP BY DATE_TRUNC('day', created_at), m.slug, m.name, p.name, t.slug
ORDER BY day DESC, total_cost DESC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to select best model for a task
CREATE OR REPLACE FUNCTION select_model_for_task(
  p_task_slug VARCHAR,
  p_vertical VARCHAR DEFAULT NULL,
  p_prefer_quality BOOLEAN DEFAULT true,
  p_max_cost_per_1k DECIMAL DEFAULT NULL
)
RETURNS TABLE (
  model_id UUID,
  model_slug VARCHAR,
  model_name VARCHAR,
  provider_type VARCHAR,
  quality_score INTEGER,
  cost_per_1k DECIMAL,
  selection_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH task_requirements AS (
    SELECT * FROM llm_task_types WHERE slug = p_task_slug
  ),
  eligible_models AS (
    SELECT
      m.id,
      m.slug,
      m.name,
      p.provider_type,
      m.quality_score,
      (m.input_cost_per_million + m.output_cost_per_million) / 2000 as cost_per_1k,
      m.priority,
      tm.priority as mapping_priority,
      CASE
        WHEN tm.is_default THEN 'Default mapping'
        WHEN p_prefer_quality THEN 'Quality preference'
        ELSE 'Cost preference'
      END as selection_reason
    FROM llm_models m
    JOIN llm_providers p ON m.provider_id = p.id
    LEFT JOIN task_requirements t ON true
    LEFT JOIN llm_task_model_mappings tm ON tm.model_id = m.id AND tm.task_type_id = t.id
    WHERE m.is_active = true
      AND p.is_active = true
      AND (t.requires_vision = false OR m.supports_vision = true)
      AND (t.requires_functions = false OR m.supports_functions = true)
      AND (t.requires_json = false OR m.supports_json_mode = true)
      AND (p_max_cost_per_1k IS NULL OR (m.input_cost_per_million + m.output_cost_per_million) / 2000 <= p_max_cost_per_1k)
  )
  SELECT
    em.id,
    em.slug,
    em.name,
    em.provider_type,
    em.quality_score,
    em.cost_per_1k,
    em.selection_reason
  FROM eligible_models em
  ORDER BY
    COALESCE(em.mapping_priority, 999),
    CASE WHEN p_prefer_quality THEN em.quality_score ELSE 0 END DESC,
    CASE WHEN NOT p_prefer_quality THEN em.cost_per_1k ELSE 0 END ASC,
    em.priority
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to record usage
CREATE OR REPLACE FUNCTION record_llm_usage(
  p_model_id UUID,
  p_task_type_slug VARCHAR,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_latency_ms INTEGER,
  p_status VARCHAR DEFAULT 'success',
  p_vertical VARCHAR DEFAULT NULL,
  p_was_fallback BOOLEAN DEFAULT false,
  p_fallback_reason VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_model RECORD;
  v_task_type_id UUID;
  v_input_cost DECIMAL;
  v_output_cost DECIMAL;
  v_log_id UUID;
BEGIN
  -- Get model info for cost calculation
  SELECT * INTO v_model FROM llm_models WHERE id = p_model_id;

  -- Get task type ID
  SELECT id INTO v_task_type_id FROM llm_task_types WHERE slug = p_task_type_slug;

  -- Calculate costs
  v_input_cost := (p_input_tokens::DECIMAL / 1000000) * v_model.input_cost_per_million;
  v_output_cost := (p_output_tokens::DECIMAL / 1000000) * v_model.output_cost_per_million;

  -- Insert log
  INSERT INTO llm_usage_logs (
    model_id, task_type_id, vertical,
    input_tokens, output_tokens,
    input_cost, output_cost,
    latency_ms, status,
    was_fallback, fallback_reason, error_message
  ) VALUES (
    p_model_id, v_task_type_id, p_vertical,
    p_input_tokens, p_output_tokens,
    v_input_cost, v_output_cost,
    p_latency_ms, p_status,
    p_was_fallback, p_fallback_reason, p_error_message
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Seed LLM Providers
INSERT INTO llm_providers (slug, name, provider_type, base_url, supports_streaming, supports_functions, supports_vision, max_context_tokens) VALUES
  ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', true, true, true, 128000),
  ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com/v1', true, true, true, 200000),
  ('vertex', 'Google Vertex AI', 'vertex', NULL, true, true, true, 1000000),
  ('azure_openai', 'Azure OpenAI', 'azure', NULL, true, true, true, 128000),
  ('groq', 'Groq', 'groq', 'https://api.groq.com/openai/v1', true, true, false, 32000)
ON CONFLICT (slug) DO NOTHING;

-- Seed LLM Models
INSERT INTO llm_models (provider_id, model_id, slug, name, model_family, max_input_tokens, max_output_tokens, supports_streaming, supports_functions, supports_vision, supports_json_mode, input_cost_per_million, output_cost_per_million, quality_score, priority, is_default) VALUES
  -- OpenAI
  ((SELECT id FROM llm_providers WHERE slug = 'openai'), 'gpt-4o', 'gpt-4o', 'GPT-4o', 'gpt-4', 128000, 16384, true, true, true, true, 2.50, 10.00, 95, 10, true),
  ((SELECT id FROM llm_providers WHERE slug = 'openai'), 'gpt-4o-mini', 'gpt-4o-mini', 'GPT-4o Mini', 'gpt-4', 128000, 16384, true, true, true, true, 0.15, 0.60, 85, 20, false),
  ((SELECT id FROM llm_providers WHERE slug = 'openai'), 'gpt-4-turbo', 'gpt-4-turbo', 'GPT-4 Turbo', 'gpt-4', 128000, 4096, true, true, true, true, 10.00, 30.00, 93, 30, false),

  -- Anthropic
  ((SELECT id FROM llm_providers WHERE slug = 'anthropic'), 'claude-3-5-sonnet-20241022', 'claude-3-5-sonnet', 'Claude 3.5 Sonnet', 'claude-3', 200000, 8192, true, true, true, false, 3.00, 15.00, 96, 15, false),
  ((SELECT id FROM llm_providers WHERE slug = 'anthropic'), 'claude-3-5-haiku-20241022', 'claude-3-5-haiku', 'Claude 3.5 Haiku', 'claude-3', 200000, 8192, true, true, true, false, 1.00, 5.00, 88, 25, false),
  ((SELECT id FROM llm_providers WHERE slug = 'anthropic'), 'claude-3-opus-20240229', 'claude-3-opus', 'Claude 3 Opus', 'claude-3', 200000, 4096, true, true, true, false, 15.00, 75.00, 98, 5, false),

  -- Vertex AI (Gemini)
  ((SELECT id FROM llm_providers WHERE slug = 'vertex'), 'gemini-1.5-pro', 'gemini-1-5-pro', 'Gemini 1.5 Pro', 'gemini', 1000000, 8192, true, true, true, true, 1.25, 5.00, 92, 35, false),
  ((SELECT id FROM llm_providers WHERE slug = 'vertex'), 'gemini-1.5-flash', 'gemini-1-5-flash', 'Gemini 1.5 Flash', 'gemini', 1000000, 8192, true, true, true, true, 0.075, 0.30, 82, 40, false),

  -- Groq (fast inference)
  ((SELECT id FROM llm_providers WHERE slug = 'groq'), 'llama-3.1-70b-versatile', 'groq-llama-70b', 'Llama 3.1 70B (Groq)', 'llama', 32000, 8192, true, true, false, true, 0.59, 0.79, 80, 50, false),
  ((SELECT id FROM llm_providers WHERE slug = 'groq'), 'mixtral-8x7b-32768', 'groq-mixtral', 'Mixtral 8x7B (Groq)', 'mixtral', 32000, 8192, true, true, false, false, 0.24, 0.24, 75, 60, false)
ON CONFLICT (slug) DO NOTHING;

-- Seed Task Types
INSERT INTO llm_task_types (slug, name, description, requires_vision, requires_functions, requires_json, min_context_tokens, prefer_quality, prefer_cost_efficiency, max_latency_ms) VALUES
  ('outreach_generation', 'Outreach Generation', 'Generate personalized outreach emails and messages', false, false, false, 4000, true, false, 30000),
  ('company_analysis', 'Company Analysis', 'Analyze company data and generate insights', false, false, true, 8000, true, false, 60000),
  ('signal_interpretation', 'Signal Interpretation', 'Interpret and explain discovered signals', false, false, true, 4000, true, false, 30000),
  ('ranking_explanation', 'Ranking Explanation', 'Explain why entities are ranked in a certain order', false, false, false, 4000, true, false, 30000),
  ('data_extraction', 'Data Extraction', 'Extract structured data from unstructured text', false, true, true, 8000, false, true, 30000),
  ('summarization', 'Summarization', 'Summarize long documents or conversations', false, false, false, 16000, false, true, 30000),
  ('classification', 'Classification', 'Classify text into categories', false, false, true, 2000, false, true, 10000),
  ('embedding_generation', 'Embedding Generation', 'Generate embeddings for semantic search', false, false, false, 8000, false, true, 5000),
  ('chat_response', 'Chat Response', 'Generate conversational responses', false, true, false, 8000, true, false, 15000),
  ('journey_orchestration', 'Journey Orchestration', 'Orchestrate multi-step AI journeys', false, true, true, 16000, true, false, 60000)
ON CONFLICT (slug) DO NOTHING;

-- Seed default fallback chain
INSERT INTO llm_fallback_chains (name, slug, description) VALUES
  ('Default Fallback Chain', 'default', 'Standard fallback chain for general tasks')
ON CONFLICT (slug) DO NOTHING;

-- Add steps to default fallback chain
INSERT INTO llm_fallback_chain_steps (chain_id, model_id, step_order, timeout_ms, max_retries)
SELECT
  (SELECT id FROM llm_fallback_chains WHERE slug = 'default'),
  m.id,
  CASE m.slug
    WHEN 'gpt-4o' THEN 1
    WHEN 'claude-3-5-sonnet' THEN 2
    WHEN 'gpt-4o-mini' THEN 3
    WHEN 'gemini-1-5-pro' THEN 4
  END as step_order,
  30000,
  2
FROM llm_models m
WHERE m.slug IN ('gpt-4o', 'claude-3-5-sonnet', 'gpt-4o-mini', 'gemini-1-5-pro')
ON CONFLICT DO NOTHING;

COMMIT;
