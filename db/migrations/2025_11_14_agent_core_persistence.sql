-- Sprint 20 Task 2: Database Persistence Layer for SIVA Tools
-- Created: 2025-11-14
-- Purpose: Persist all SIVA tool decisions for analysis, override, and continuous improvement

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 1: agent_decisions
-- Stores every SIVA tool execution with full input/output
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linking (no FK constraints - allow flexible referencing)
  company_id UUID,  -- Links to companies.id if company exists
  contact_id UUID,  -- No FK constraint (contacts might be in enrichment data)
  signal_id UUID,   -- Links to hiring_signals if applicable

  -- Tool Execution Details
  tool_name TEXT NOT NULL,
  tool_layer TEXT CHECK (tool_layer IN ('foundation', 'strict', 'delegated')),
  primitive_name TEXT,  -- e.g., 'EVALUATE_COMPANY_QUALITY'

  -- Input/Output
  input_params JSONB NOT NULL,
  output_result JSONB NOT NULL,
  reasoning JSONB,  -- Natural language reasoning from tool

  -- Scoring
  score NUMERIC(5,2),  -- For tools that return scores (0-100)
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),  -- 0.00-1.00
  quality_tier TEXT,  -- e.g., 'HOT', 'WARM', 'COLD', 'EXCELLENT', 'GOOD'

  -- Performance
  execution_time_ms INTEGER NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'v2.0',

  -- Context
  session_id TEXT,
  module_caller TEXT,  -- e.g., 'discovery', 'enrichment', 'outreach'
  tenant_id UUID,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system'
);

-- Indexes for performance
CREATE INDEX idx_agent_decisions_company ON agent_decisions(company_id);
CREATE INDEX idx_agent_decisions_contact ON agent_decisions(contact_id);
CREATE INDEX idx_agent_decisions_signal ON agent_decisions(signal_id);
CREATE INDEX idx_agent_decisions_tool ON agent_decisions(tool_name);
CREATE INDEX idx_agent_decisions_layer ON agent_decisions(tool_layer);
CREATE INDEX idx_agent_decisions_created ON agent_decisions(created_at DESC);
CREATE INDEX idx_agent_decisions_tenant ON agent_decisions(tenant_id);
CREATE INDEX idx_agent_decisions_session ON agent_decisions(session_id);
CREATE INDEX idx_agent_decisions_confidence ON agent_decisions(confidence DESC);

-- Partial index for low-confidence decisions (need review)
CREATE INDEX idx_agent_decisions_low_confidence ON agent_decisions(confidence)
  WHERE confidence < 0.60;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 2: agent_overrides
-- Tracks human corrections to AI decisions for continuous learning
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS agent_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links to original decision
  decision_id UUID REFERENCES agent_decisions(id) ON DELETE CASCADE NOT NULL,

  -- AI vs Human Results
  ai_result JSONB NOT NULL,  -- What the AI decided
  human_result JSONB NOT NULL,  -- What the human corrected it to

  -- AI Scoring
  ai_score NUMERIC(5,2),
  ai_confidence NUMERIC(3,2),
  ai_quality_tier TEXT,

  -- Human Scoring
  human_score NUMERIC(5,2),
  human_confidence NUMERIC(3,2),
  human_quality_tier TEXT,

  -- Override Reason
  override_reason TEXT CHECK (override_reason IN (
    'INCORRECT_CLASSIFICATION',
    'WRONG_SCORE',
    'EDGE_CASE_MISSED',
    'BETTER_JUDGMENT',
    'POLICY_UPDATE',
    'DATA_ERROR',
    'OTHER'
  )),
  notes TEXT,

  -- Impact
  score_delta NUMERIC(5,2),  -- human_score - ai_score
  agreement BOOLEAN,  -- Did human agree with AI?

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  user_email TEXT,
  tenant_id UUID
);

-- Indexes
CREATE INDEX idx_agent_overrides_decision ON agent_overrides(decision_id);
CREATE INDEX idx_agent_overrides_created ON agent_overrides(created_at DESC);
CREATE INDEX idx_agent_overrides_user ON agent_overrides(user_id);
CREATE INDEX idx_agent_overrides_tenant ON agent_overrides(tenant_id);
CREATE INDEX idx_agent_overrides_reason ON agent_overrides(override_reason);

-- Index for disagreements (learning opportunities)
CREATE INDEX idx_agent_overrides_disagreement ON agent_overrides(agreement)
  WHERE agreement = false;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 3: persona_versions
-- Tracks SIVA persona policy versions for rollback and A/B testing
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS persona_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Version Info
  version TEXT UNIQUE NOT NULL,  -- e.g., 'v2.0', 'v2.1-beta'
  version_type TEXT CHECK (version_type IN ('major', 'minor', 'patch', 'beta')) DEFAULT 'minor',

  -- Specification
  spec_content TEXT NOT NULL,  -- Full persona specification (markdown or JSON)
  spec_hash TEXT,  -- SHA-256 hash for change detection

  -- Changes
  changes_summary TEXT,
  changelog JSONB,  -- Structured changelog

  -- Rules
  always_rules JSONB,  -- ALWAYS rules from persona
  never_rules JSONB,   -- NEVER rules from persona
  confidence_thresholds JSONB,  -- Confidence gates per tool

  -- Deployment
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_by TEXT,
  is_active BOOLEAN DEFAULT false,
  is_production BOOLEAN DEFAULT false,

  -- Performance Tracking
  decision_count INTEGER DEFAULT 0,
  override_count INTEGER DEFAULT 0,
  override_rate NUMERIC(5,4),  -- override_count / decision_count
  avg_confidence NUMERIC(3,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Indexes
CREATE INDEX idx_persona_versions_version ON persona_versions(version);
CREATE INDEX idx_persona_versions_deployed ON persona_versions(deployed_at DESC);
CREATE INDEX idx_persona_versions_active ON persona_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_persona_versions_production ON persona_versions(is_production) WHERE is_production = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Views for Analytics
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- View: Tool Performance Summary
CREATE OR REPLACE VIEW agent_tool_performance AS
SELECT
  tool_name,
  tool_layer,
  COUNT(*) as total_executions,
  AVG(execution_time_ms) as avg_execution_time_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_latency_ms,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE confidence >= 0.80) as high_confidence_count,
  COUNT(*) FILTER (WHERE confidence < 0.60) as low_confidence_count,
  ROUND(COUNT(*) FILTER (WHERE confidence >= 0.80)::NUMERIC / COUNT(*) * 100, 2) as high_confidence_rate,
  MAX(created_at) as last_execution_at
FROM agent_decisions
GROUP BY tool_name, tool_layer
ORDER BY total_executions DESC;

-- View: Override Analytics
CREATE OR REPLACE VIEW agent_override_analytics AS
SELECT
  ad.tool_name,
  ad.tool_layer,
  COUNT(DISTINCT ad.id) as total_decisions,
  COUNT(DISTINCT ao.id) as total_overrides,
  ROUND(COUNT(DISTINCT ao.id)::NUMERIC / COUNT(DISTINCT ad.id) * 100, 2) as override_rate,
  COUNT(*) FILTER (WHERE ao.agreement = true) as agreements,
  COUNT(*) FILTER (WHERE ao.agreement = false) as disagreements,
  AVG(ao.score_delta) as avg_score_delta,
  ao.override_reason,
  COUNT(*) as reason_count
FROM agent_decisions ad
LEFT JOIN agent_overrides ao ON ao.decision_id = ad.id
WHERE ao.id IS NOT NULL
GROUP BY ad.tool_name, ad.tool_layer, ao.override_reason
ORDER BY total_overrides DESC;

-- View: Daily Decision Volume
CREATE OR REPLACE VIEW agent_daily_volume AS
SELECT
  DATE(created_at) as decision_date,
  tool_name,
  tool_layer,
  COUNT(*) as decisions,
  AVG(confidence) as avg_confidence,
  AVG(execution_time_ms) as avg_latency_ms
FROM agent_decisions
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), tool_name, tool_layer
ORDER BY decision_date DESC, decisions DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Functions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Function: Update persona version stats after each decision
CREATE OR REPLACE FUNCTION update_persona_version_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update decision count for active version
  UPDATE persona_versions
  SET
    decision_count = decision_count + 1,
    avg_confidence = (
      SELECT AVG(confidence)
      FROM agent_decisions
      WHERE policy_version = persona_versions.version
    )
  WHERE version = NEW.policy_version
    AND is_active = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update persona stats
CREATE TRIGGER trigger_update_persona_stats
  AFTER INSERT ON agent_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_persona_version_stats();

-- Function: Calculate override rate after override
CREATE OR REPLACE FUNCTION update_override_rate()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE persona_versions
  SET
    override_count = override_count + 1,
    override_rate = (override_count + 1)::NUMERIC / NULLIF(decision_count, 0)
  WHERE version = (
    SELECT policy_version
    FROM agent_decisions
    WHERE id = NEW.decision_id
  )
  AND is_active = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update override rate
CREATE TRIGGER trigger_update_override_rate
  AFTER INSERT ON agent_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_override_rate();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Seed Data: Initial Persona Version (v2.0)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO persona_versions (
  version,
  version_type,
  spec_content,
  changes_summary,
  always_rules,
  never_rules,
  confidence_thresholds,
  deployed_by,
  is_active,
  is_production
) VALUES (
  'v2.0',
  'major',
  'SIVA Cognitive Framework v2.0 - Natural Language Reasoning + Formula Protection',
  'Sprint 17: All 12 tools complete with v2.0 enhancements. Natural language reasoning, confidence levels, Sentry tracking.',
  '["ALWAYS verify contact tier before outreach", "ALWAYS check edge cases before enrichment", "ALWAYS calculate composite score before lead handoff", "ALWAYS log decisions to database"]'::jsonb,
  '["NEVER contact enterprise brands", "NEVER contact government entities", "NEVER proceed if confidence < 0.60", "NEVER skip compliance checks"]'::jsonb,
  '{
    "CompanyQualityTool": 0.70,
    "ContactTierTool": 0.75,
    "TimingScoreTool": 0.65,
    "EdgeCasesTool": 0.80,
    "BankingProductMatchTool": 0.70,
    "OutreachChannelTool": 0.60,
    "OpeningContextTool": 0.65,
    "CompositeScoreTool": 0.70,
    "OutreachMessageGeneratorTool": 0.75,
    "FollowUpStrategyTool": 0.60,
    "ObjectionHandlerTool": 0.65,
    "RelationshipTrackerTool": 0.60
  }'::jsonb,
  'Sprint 17 - Claude Code',
  true,
  true
) ON CONFLICT (version) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Comments for Documentation
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON TABLE agent_decisions IS 'Stores every SIVA tool execution with full input/output for analysis and learning';
COMMENT ON TABLE agent_overrides IS 'Tracks human corrections to AI decisions for continuous improvement';
COMMENT ON TABLE persona_versions IS 'Manages SIVA persona policy versions for rollback and A/B testing';

COMMENT ON COLUMN agent_decisions.tool_layer IS 'foundation (Tools 1-4), strict (Tools 5-8), delegated (Tools 9-12)';
COMMENT ON COLUMN agent_decisions.confidence IS 'Tool confidence score (0.00-1.00), used for escalation gates';
COMMENT ON COLUMN agent_decisions.execution_time_ms IS 'Tool execution latency for SLA tracking';

COMMENT ON COLUMN agent_overrides.agreement IS 'true = human agreed with AI, false = human corrected AI';
COMMENT ON COLUMN agent_overrides.score_delta IS 'human_score - ai_score (positive = AI underscored, negative = AI overscored)';

COMMENT ON VIEW agent_tool_performance IS 'Per-tool performance metrics: latency (p50/p95/p99), confidence distribution';
COMMENT ON VIEW agent_override_analytics IS 'Override rates and disagreement patterns by tool and reason';
COMMENT ON VIEW agent_daily_volume IS 'Daily decision volume trends for capacity planning';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- End of Migration
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Verification query
SELECT
  'agent_decisions' as table_name, COUNT(*) as row_count FROM agent_decisions
UNION ALL
SELECT 'agent_overrides', COUNT(*) FROM agent_overrides
UNION ALL
SELECT 'persona_versions', COUNT(*) FROM persona_versions;
