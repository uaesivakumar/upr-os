-- ═══════════════════════════════════════════════════════════════
-- Phase 1: RADAR Module - Database Schema
-- Date: October 19, 2025
-- Purpose: Company discovery orchestration, source tracking, evidence
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 1: RUN ORCHESTRATION
-- ═══════════════════════════════════════════════════════════════

-- Track each Radar run (batch job execution)
CREATE TABLE IF NOT EXISTS discovery_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  trigger TEXT NOT NULL, -- 'manual', 'scheduler', 'replay'
  prompt_version TEXT NOT NULL,
  inputs_hash TEXT, -- SHA256 of sources + config (dedupe reruns)
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'aborted'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  companies_found INTEGER DEFAULT 0,
  companies_accepted INTEGER DEFAULT 0, -- After human approval
  cost_usd NUMERIC(10,4) DEFAULT 0,
  budget_limit_usd NUMERIC(10,4) DEFAULT 2.00,
  latency_ms INTEGER,
  error_summary TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_tenant ON discovery_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_trigger ON discovery_runs(trigger, started_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 2: SOURCE REGISTRY & OPTIMIZATION
-- ═══════════════════════════════════════════════════════════════

-- Registry of discovery sources with performance tracking
CREATE TABLE IF NOT EXISTS discovery_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  source_weight NUMERIC(3,2) DEFAULT 0.50,
  avg_yield NUMERIC(5,2),
  avg_precision NUMERIC(3,2),
  avg_cpa_usd NUMERIC(10,4),
  region_bias TEXT DEFAULT 'AE',
  cost_bias TEXT DEFAULT 'low',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_sources_enabled ON discovery_sources(enabled, avg_cpa_usd);

-- Seed sources (only if not exists)
INSERT INTO discovery_sources (name, type, enabled, source_weight, avg_precision, cost_bias, metadata)
SELECT 'gulf-news', 'news', true, 0.70, 0.85, 'low', '{"base_url": "https://gulfnews.com/business"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM discovery_sources WHERE name = 'gulf-news');

INSERT INTO discovery_sources (name, type, enabled, source_weight, avg_precision, cost_bias, metadata)
SELECT 'khaleej-times', 'news', true, 0.65, 0.80, 'low', '{"base_url": "https://khaleejtimes.com/business"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM discovery_sources WHERE name = 'khaleej-times');

INSERT INTO discovery_sources (name, type, enabled, source_weight, avg_precision, cost_bias, metadata)
SELECT 'the-national', 'news', true, 0.60, 0.75, 'low', '{"base_url": "https://thenationalnews.com/business"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM discovery_sources WHERE name = 'the-national');

INSERT INTO discovery_sources (name, type, enabled, source_weight, avg_precision, cost_bias, metadata)
SELECT 'bayt', 'jobs', true, 0.55, 0.70, 'medium', '{"base_url": "https://bayt.com/en/uae/jobs"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM discovery_sources WHERE name = 'bayt');

INSERT INTO discovery_sources (name, type, enabled, source_weight, avg_precision, cost_bias, metadata)
SELECT 'linkedin', 'social', true, 0.50, 0.65, 'high', '{"base_url": "https://linkedin.com/company"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM discovery_sources WHERE name = 'linkedin');

-- ═══════════════════════════════════════════════════════════════
-- SECTION 3: DEAD LETTER QUEUE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS discovery_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES discovery_runs(run_id),
  source_id UUID REFERENCES discovery_sources(source_id),
  source_url TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_action TEXT DEFAULT 'manual_review',
  raw_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_unresolved ON discovery_dead_letters(next_action, created_at)
  WHERE resolved_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 4: ENHANCED PROMPT VERSIONING
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  template TEXT NOT NULL,
  system_prompt TEXT,
  user_prompt_template TEXT,
  active BOOLEAN DEFAULT true,
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature NUMERIC(3,2) DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 500,
  schema JSONB,
  golden_set JSONB DEFAULT '[]',
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(name, active) WHERE active = true;

-- Seed prompt
INSERT INTO prompt_versions (name, version, system_prompt, user_prompt_template, schema, golden_set, active, model)
SELECT
  'company_extraction',
  'v1.1-uae-heuristic',
  'You extract UAE companies from news. Focus on: .ae domains, UAE addresses, +971 phones, AED currency, free zones (DMCC, ADGM, IFZA), emirate names (Dubai, Abu Dhabi, Sharjah). Blend LLM understanding with these signals. Return ONLY valid JSON.',
  'Headlines:

{{headlines}}

Extract companies as JSON array: [{"name": "...", "confidence": 0-1, "uae_signal": "...", "heuristic_signals": ["ae_domain"], "reasoning": "..."}]

ONLY include if UAE connection is clear.',
  '{"type": "array", "items": {"type": "object", "required": ["name", "confidence", "uae_signal"], "properties": {"name": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "uae_signal": {"type": "string"}, "heuristic_signals": {"type": "array", "items": {"type": "string"}}, "reasoning": {"type": "string"}}}}'::jsonb,
  '[{"headline": "Acme Construction (acme.ae) opens Dubai office", "expected": [{"name": "Acme Construction"}]}]'::jsonb,
  true,
  'gpt-4o-mini'
WHERE NOT EXISTS (SELECT 1 FROM prompt_versions WHERE name = 'company_extraction' AND version = 'v1.1-uae-heuristic');

-- ═══════════════════════════════════════════════════════════════
-- SECTION 5: ENHANCED ENTITIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS legal_name_norm TEXT;
ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS domain_norm TEXT;
ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS trade_name_norm TEXT;
ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}';
ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS source_first_seen TEXT;
ALTER TABLE entities_company ADD COLUMN IF NOT EXISTS first_run_id UUID REFERENCES discovery_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_entities_company_norm ON entities_company(domain_norm, legal_name_norm);
CREATE INDEX IF NOT EXISTS idx_entities_company_run ON entities_company(first_run_id);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 6: ENHANCED USAGE TRACKING
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES discovery_runs(run_id);
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES discovery_sources(source_id);
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS tokens_in INTEGER;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS tokens_out INTEGER;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS schema_valid BOOLEAN;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS trace_id TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_events_run ON usage_events(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_source ON usage_events(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_trace ON usage_events(trace_id);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 7: VIEWS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW source_performance AS
SELECT
  ds.source_id,
  ds.name,
  ds.type,
  COUNT(DISTINCT ec.id) as companies_found,
  COUNT(DISTINCT ec.id) FILTER (WHERE ec.uae_presence_confidence >= 0.70) as companies_accepted,
  ROUND(COUNT(DISTINCT ec.id) FILTER (WHERE ec.uae_presence_confidence >= 0.70)::numeric /
    NULLIF(COUNT(DISTINCT ec.id), 0), 3) as precision,
  SUM(ue.cost_usd) as total_cost,
  ROUND(SUM(ue.cost_usd) / NULLIF(COUNT(DISTINCT ec.id) FILTER (WHERE ec.uae_presence_confidence >= 0.70), 0), 4) as cpa_usd,
  MAX(dr.started_at) as last_used
FROM discovery_sources ds
LEFT JOIN usage_events ue ON ue.source_id = ds.source_id
LEFT JOIN discovery_runs dr ON dr.run_id = ue.run_id
LEFT JOIN entities_company ec ON ec.first_run_id = dr.run_id
WHERE dr.started_at > NOW() - INTERVAL '30 days' OR dr.started_at IS NULL
GROUP BY ds.source_id, ds.name, ds.type
ORDER BY cpa_usd ASC NULLS LAST;

CREATE OR REPLACE VIEW run_summary AS
SELECT
  dr.run_id,
  dr.trigger,
  dr.prompt_version,
  dr.status,
  dr.started_at,
  dr.ended_at,
  dr.companies_found,
  dr.companies_accepted,
  dr.cost_usd,
  dr.latency_ms,
  ROUND(dr.cost_usd / NULLIF(dr.companies_accepted, 0), 4) as cpa_usd,
  COUNT(ue.id) FILTER (WHERE ue.event_type = 'llm_call') as llm_calls,
  SUM(ue.tokens_in + ue.tokens_out) as total_tokens,
  COUNT(ddl.id) as dead_letters
FROM discovery_runs dr
LEFT JOIN usage_events ue ON ue.run_id = dr.run_id
LEFT JOIN discovery_dead_letters ddl ON ddl.run_id = dr.run_id
GROUP BY dr.run_id
ORDER BY dr.started_at DESC;

COMMIT;
