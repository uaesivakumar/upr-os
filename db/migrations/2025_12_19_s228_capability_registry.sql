-- ============================================================================
-- Sprint 228: Capability Registry Core
-- ============================================================================
--
-- This migration creates the capability registry:
-- 1. os_model_capabilities - Core capability definitions
-- 2. Extends llm_models with capability columns
-- 3. Creates model-to-capability mapping
--
-- INVARIANT: SIVA never sees model names. Capabilities are the abstraction.
-- ============================================================================

BEGIN;

-- ============================================================================
-- OS MODEL CAPABILITIES - The capability registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_model_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Token limits
  max_tokens INTEGER DEFAULT 4096,

  -- Classification
  latency_class VARCHAR(10) NOT NULL CHECK (latency_class IN ('low', 'medium', 'high')),
  risk_class VARCHAR(10) NOT NULL CHECK (risk_class IN ('low', 'medium', 'high')),
  replay_tolerance VARCHAR(10) NOT NULL CHECK (replay_tolerance IN ('strict', 'relaxed')),

  -- Requirements
  requires_vision BOOLEAN DEFAULT false,
  requires_functions BOOLEAN DEFAULT false,
  requires_json_mode BOOLEAN DEFAULT false,
  min_context_tokens INTEGER DEFAULT 4000,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for capability lookup
CREATE INDEX IF NOT EXISTS idx_os_model_capabilities_key ON os_model_capabilities(capability_key);
CREATE INDEX IF NOT EXISTS idx_os_model_capabilities_active ON os_model_capabilities(is_active) WHERE is_active = true;

-- ============================================================================
-- EXTEND llm_models WITH CAPABILITY COLUMNS
-- ============================================================================

-- Add capability-related columns to llm_models
ALTER TABLE llm_models
  ADD COLUMN IF NOT EXISTS supported_capabilities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disallowed_capabilities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_cost_weight DECIMAL(5,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS default_latency_weight DECIMAL(5,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_eligible BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS stability_score INTEGER DEFAULT 80 CHECK (stability_score >= 0 AND stability_score <= 100);

-- Index for eligibility filtering
CREATE INDEX IF NOT EXISTS idx_llm_models_eligible ON llm_models(is_eligible) WHERE is_eligible = true;

-- ============================================================================
-- MODEL-CAPABILITY MAPPING (explicit many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_model_capability_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES os_model_capabilities(id) ON DELETE CASCADE,

  -- Performance overrides for this model+capability combination
  latency_override_ms INTEGER,
  cost_override_per_1k DECIMAL(10,6),
  quality_override INTEGER CHECK (quality_override >= 0 AND quality_override <= 100),

  -- Explicitly supported or disallowed
  is_supported BOOLEAN DEFAULT true,
  reason TEXT, -- Why it's supported/disallowed

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(model_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_os_model_capability_mappings_model ON os_model_capability_mappings(model_id);
CREATE INDEX IF NOT EXISTS idx_os_model_capability_mappings_capability ON os_model_capability_mappings(capability_id);

-- ============================================================================
-- ROUTING DECISIONS LOG (for replay safety)
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_routing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was requested
  capability_key VARCHAR(50) NOT NULL,
  persona_id UUID,

  -- What was selected
  model_id UUID NOT NULL REFERENCES llm_models(id),
  routing_reason TEXT NOT NULL,

  -- Context
  cost_budget DECIMAL(10,6),
  latency_budget_ms INTEGER,
  channel VARCHAR(20), -- 'WA', 'SaaS', 'API'

  -- Envelope hash for replay matching
  envelope_hash VARCHAR(64),

  -- Alternatives considered
  alternatives_considered JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_routing_decisions_capability ON os_routing_decisions(capability_key);
CREATE INDEX IF NOT EXISTS idx_os_routing_decisions_model ON os_routing_decisions(model_id);
CREATE INDEX IF NOT EXISTS idx_os_routing_decisions_envelope ON os_routing_decisions(envelope_hash);
CREATE INDEX IF NOT EXISTS idx_os_routing_decisions_created ON os_routing_decisions(created_at);

-- ============================================================================
-- SEED: 6 CORE CAPABILITIES
-- ============================================================================

INSERT INTO os_model_capabilities (capability_key, name, description, max_tokens, latency_class, risk_class, replay_tolerance, requires_vision, requires_functions, requires_json_mode, min_context_tokens) VALUES
  ('summarize_fast', 'Fast Summarization', 'Quick summarization of text with low latency requirements', 1024, 'low', 'low', 'relaxed', false, false, false, 4000),
  ('reason_deep', 'Deep Reasoning', 'Complex multi-step reasoning and analysis', 8192, 'high', 'medium', 'strict', false, true, false, 16000),
  ('classify_cheap', 'Cheap Classification', 'Low-cost text classification and categorization', 256, 'low', 'low', 'relaxed', false, false, true, 2000),
  ('extract_structured', 'Structured Extraction', 'Extract structured data from unstructured text', 4096, 'medium', 'low', 'strict', false, true, true, 8000),
  ('draft_safe', 'Safe Drafting', 'Generate safe, reviewed content drafts', 4096, 'medium', 'low', 'strict', false, false, false, 4000),
  ('chat_low_risk', 'Low-Risk Chat', 'Conversational responses with safety constraints', 2048, 'low', 'low', 'relaxed', false, true, false, 8000)
ON CONFLICT (capability_key) DO NOTHING;

-- ============================================================================
-- SEED: MODEL-CAPABILITY MAPPINGS
-- ============================================================================

-- GPT-4o: High-end, all capabilities
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'GPT-4o supports all core capabilities'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'gpt-4o'
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- GPT-4o-mini: Cost-efficient, best for cheap/fast tasks
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'GPT-4o-mini optimal for cost-efficient tasks'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'gpt-4o-mini'
  AND c.capability_key IN ('summarize_fast', 'classify_cheap', 'chat_low_risk')
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- Claude 3.5 Sonnet: High-quality reasoning
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'Claude 3.5 Sonnet excels at reasoning and structured tasks'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'claude-3-5-sonnet'
  AND c.capability_key IN ('reason_deep', 'extract_structured', 'draft_safe')
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- Claude 3.5 Haiku: Fast, cost-efficient
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'Claude 3.5 Haiku optimal for fast, low-cost tasks'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'claude-3-5-haiku'
  AND c.capability_key IN ('summarize_fast', 'classify_cheap', 'chat_low_risk')
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- Gemini 1.5 Pro: Large context, reasoning
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'Gemini 1.5 Pro handles large context reasoning'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'gemini-1-5-pro'
  AND c.capability_key IN ('reason_deep', 'extract_structured', 'summarize_fast')
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- Gemini 1.5 Flash: Fast, cheap
INSERT INTO os_model_capability_mappings (model_id, capability_id, is_supported, reason)
SELECT m.id, c.id, true, 'Gemini 1.5 Flash optimal for speed and cost'
FROM llm_models m, os_model_capabilities c
WHERE m.slug = 'gemini-1-5-flash'
  AND c.capability_key IN ('summarize_fast', 'classify_cheap', 'chat_low_risk')
ON CONFLICT (model_id, capability_id) DO NOTHING;

-- Update llm_models with supported_capabilities arrays
UPDATE llm_models SET supported_capabilities = ARRAY(
  SELECT c.capability_key
  FROM os_model_capability_mappings mcm
  JOIN os_model_capabilities c ON mcm.capability_id = c.id
  WHERE mcm.model_id = llm_models.id AND mcm.is_supported = true
);

-- Set all existing models as eligible by default
UPDATE llm_models SET is_eligible = true WHERE is_active = true;

-- ============================================================================
-- HELPER FUNCTION: Get models for capability
-- ============================================================================

CREATE OR REPLACE FUNCTION get_models_for_capability(
  p_capability_key VARCHAR,
  p_max_cost_per_1k DECIMAL DEFAULT NULL,
  p_max_latency_ms INTEGER DEFAULT NULL
)
RETURNS TABLE (
  model_id UUID,
  model_slug VARCHAR,
  model_name VARCHAR,
  provider_type VARCHAR,
  quality_score INTEGER,
  stability_score INTEGER,
  cost_per_1k DECIMAL,
  avg_latency_ms INTEGER,
  is_eligible BOOLEAN,
  capability_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.slug,
    m.name,
    p.provider_type,
    m.quality_score,
    m.stability_score,
    (m.input_cost_per_million + m.output_cost_per_million) / 2000 as cost_per_1k,
    m.avg_latency_ms,
    m.is_eligible,
    mcm.reason
  FROM llm_models m
  JOIN llm_providers p ON m.provider_id = p.id
  JOIN os_model_capability_mappings mcm ON mcm.model_id = m.id
  JOIN os_model_capabilities c ON mcm.capability_id = c.id
  WHERE c.capability_key = p_capability_key
    AND mcm.is_supported = true
    AND m.is_active = true
    AND m.is_eligible = true
    AND (p_max_cost_per_1k IS NULL OR (m.input_cost_per_million + m.output_cost_per_million) / 2000 <= p_max_cost_per_1k)
    AND (p_max_latency_ms IS NULL OR m.avg_latency_ms <= p_max_latency_ms)
  ORDER BY
    m.quality_score DESC,
    m.stability_score DESC,
    (m.input_cost_per_million + m.output_cost_per_million) ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Capability Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_capability_dashboard AS
SELECT
  c.capability_key,
  c.name,
  c.latency_class,
  c.risk_class,
  c.replay_tolerance,
  c.is_active,
  COUNT(DISTINCT mcm.model_id) FILTER (WHERE mcm.is_supported = true) as supported_model_count,
  ARRAY_AGG(DISTINCT m.slug) FILTER (WHERE mcm.is_supported = true AND m.is_eligible = true) as eligible_models
FROM os_model_capabilities c
LEFT JOIN os_model_capability_mappings mcm ON mcm.capability_id = c.id
LEFT JOIN llm_models m ON mcm.model_id = m.id
GROUP BY c.id, c.capability_key, c.name, c.latency_class, c.risk_class, c.replay_tolerance, c.is_active
ORDER BY c.capability_key;

COMMIT;
