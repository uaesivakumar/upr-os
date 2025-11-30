-- ============================================================================
-- Sprint 52: Vertical Pack System - Database Schema
-- ============================================================================
--
-- This migration creates tables for:
-- 1. Enhanced vertical configuration (verticals, sub-verticals)
-- 2. Signal types per vertical
-- 3. Scoring templates per vertical
-- 4. Evidence rules per vertical
-- 5. Persona templates per vertical
-- 6. Journey flow templates
-- 7. Radar target configuration
-- ============================================================================

-- ============================================================================
-- VERTICAL PACKS (Enhanced VerticalConfig Schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Categorization
  parent_vertical_id UUID REFERENCES vertical_packs(id),
  is_sub_vertical BOOLEAN DEFAULT false,

  -- Configuration
  config JSONB DEFAULT '{}',
  -- Includes: default_scoring_weights, industry_codes, regions, etc.

  -- Feature flags
  features JSONB DEFAULT '{}',
  -- Includes: enable_journeys, enable_autonomous, enable_signals, etc.

  -- UI/Branding
  icon VARCHAR(50),
  color VARCHAR(20),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- System verticals can't be deleted

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vertical_packs_parent ON vertical_packs(parent_vertical_id);
CREATE INDEX idx_vertical_packs_active ON vertical_packs(is_active);

-- ============================================================================
-- SIGNAL TYPES PER VERTICAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_signal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Signal definition
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'intent', 'event', 'behavior', 'trigger'

  -- Detection configuration
  detection_config JSONB DEFAULT '{}',
  -- Includes: sources, keywords, patterns, thresholds

  -- Scoring impact
  score_weight DECIMAL(3,2) DEFAULT 1.0,
  score_category VARCHAR(20), -- 'q_score', 't_score', 'l_score', 'e_score'

  -- Decay settings
  decay_days INTEGER DEFAULT 30,
  decay_type VARCHAR(20) DEFAULT 'linear', -- 'linear', 'exponential', 'none'

  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_signal_types_vertical ON vertical_signal_types(vertical_id);

-- ============================================================================
-- SCORING TEMPLATES PER VERTICAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_scoring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Template identification
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Scoring configuration
  scoring_type VARCHAR(50) NOT NULL, -- 'q_score', 't_score', 'l_score', 'e_score', 'composite'

  -- Weight distribution
  weights JSONB NOT NULL DEFAULT '{}',
  -- For Q-Score: { "revenue_fit": 0.3, "industry_match": 0.25, ... }
  -- For T-Score: { "hiring_signals": 0.2, "funding_signals": 0.3, ... }

  -- Thresholds
  thresholds JSONB DEFAULT '{}',
  -- { "hot": 80, "warm": 60, "cold": 40 }

  -- Normalization
  normalization JSONB DEFAULT '{}',
  -- { "method": "percentile", "min": 0, "max": 100 }

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_scoring_templates_vertical ON vertical_scoring_templates(vertical_id);

-- ============================================================================
-- EVIDENCE RULES PER VERTICAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_evidence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Rule identification
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Rule type
  rule_type VARCHAR(50) NOT NULL, -- 'validation', 'enrichment', 'derivation', 'scoring'

  -- Conditions (when to apply)
  conditions JSONB NOT NULL DEFAULT '{}',
  -- { "field": "revenue", "operator": "gt", "value": 1000000 }

  -- Actions (what to do)
  actions JSONB NOT NULL DEFAULT '[]',
  -- [{ "type": "add_evidence", "evidence_type": "high_revenue", "confidence": 0.9 }]

  -- Evidence output
  evidence_category VARCHAR(50), -- 'qualification', 'timing', 'engagement', 'fit'
  evidence_weight DECIMAL(3,2) DEFAULT 1.0,

  -- Priority (lower = higher priority)
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_evidence_rules_vertical ON vertical_evidence_rules(vertical_id);
CREATE INDEX idx_vertical_evidence_rules_type ON vertical_evidence_rules(rule_type);

-- ============================================================================
-- PERSONA TEMPLATES PER VERTICAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_persona_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Persona identification
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Target profile
  target_titles JSONB DEFAULT '[]', -- ["CEO", "CFO", "VP Finance"]
  target_departments JSONB DEFAULT '[]', -- ["Executive", "Finance"]
  seniority_levels JSONB DEFAULT '[]', -- ["C-Level", "VP", "Director"]

  -- Characteristics
  characteristics JSONB DEFAULT '{}',
  -- { "decision_maker": true, "budget_authority": true, "technical": false }

  -- Messaging preferences
  messaging_config JSONB DEFAULT '{}',
  -- { "tone": "executive", "focus": "roi", "length": "concise" }

  -- Outreach templates
  outreach_templates JSONB DEFAULT '{}',
  -- { "email_intro": "...", "linkedin_connect": "...", "follow_up": "..." }

  -- Scoring adjustments
  score_multipliers JSONB DEFAULT '{}',
  -- { "q_score": 1.2, "e_score": 0.8 }

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_persona_templates_vertical ON vertical_persona_templates(vertical_id);

-- ============================================================================
-- JOURNEY FLOW TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_journey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Journey identification
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Journey type
  journey_type VARCHAR(50) NOT NULL, -- 'discovery', 'enrichment', 'scoring', 'outreach', 'full_pipeline'

  -- Flow definition
  steps JSONB NOT NULL DEFAULT '[]',
  -- [
  --   { "step": 1, "name": "discover", "action": "signal_discovery", "config": {...} },
  --   { "step": 2, "name": "enrich", "action": "company_enrichment", "config": {...} },
  --   { "step": 3, "name": "score", "action": "calculate_scores", "config": {...} }
  -- ]

  -- Entry conditions
  entry_conditions JSONB DEFAULT '{}',
  -- { "min_score": 40, "required_fields": ["domain", "company_name"] }

  -- Exit conditions
  exit_conditions JSONB DEFAULT '{}',
  -- { "max_steps": 10, "success_criteria": { "score_gt": 70 } }

  -- LLM configuration
  llm_config JSONB DEFAULT '{}',
  -- { "preferred_model": "gpt-4o", "temperature": 0.7, "task_type": "journey_orchestration" }

  -- Timing
  timeout_minutes INTEGER DEFAULT 30,
  retry_config JSONB DEFAULT '{}',

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_journey_templates_vertical ON vertical_journey_templates(vertical_id);
CREATE INDEX idx_vertical_journey_templates_type ON vertical_journey_templates(journey_type);

-- ============================================================================
-- RADAR TARGET CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_radar_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  -- Target identification
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Target type
  target_type VARCHAR(50) NOT NULL, -- 'company', 'contact', 'deal', 'account'

  -- Discovery configuration
  discovery_config JSONB DEFAULT '{}',
  -- {
  --   "sources": ["apollo", "zoominfo", "linkedin"],
  --   "filters": { "employee_count_min": 50, "industries": ["fintech"] },
  --   "refresh_interval_hours": 24
  -- }

  -- Scoring configuration
  scoring_template_id UUID REFERENCES vertical_scoring_templates(id),
  min_score_threshold INTEGER DEFAULT 50,

  -- Alert configuration
  alert_config JSONB DEFAULT '{}',
  -- { "notify_on_hot": true, "notify_threshold": 80, "channels": ["email", "slack"] }

  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, slug)
);

CREATE INDEX idx_vertical_radar_targets_vertical ON vertical_radar_targets(vertical_id);

-- ============================================================================
-- VERTICAL PACK VERSIONS (for audit/rollback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,

  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL, -- Full snapshot of vertical config at this version

  change_summary TEXT,
  changed_by VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_id, version)
);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Vertical dashboard view
CREATE OR REPLACE VIEW v_vertical_pack_dashboard AS
SELECT
  vp.id,
  vp.slug,
  vp.name,
  vp.is_sub_vertical,
  parent.name as parent_name,
  vp.is_active,
  (SELECT COUNT(*) FROM vertical_signal_types WHERE vertical_id = vp.id AND is_active = true) as signal_types_count,
  (SELECT COUNT(*) FROM vertical_scoring_templates WHERE vertical_id = vp.id AND is_active = true) as scoring_templates_count,
  (SELECT COUNT(*) FROM vertical_evidence_rules WHERE vertical_id = vp.id AND is_active = true) as evidence_rules_count,
  (SELECT COUNT(*) FROM vertical_persona_templates WHERE vertical_id = vp.id AND is_active = true) as personas_count,
  (SELECT COUNT(*) FROM vertical_journey_templates WHERE vertical_id = vp.id AND is_active = true) as journey_templates_count,
  (SELECT COUNT(*) FROM vertical_radar_targets WHERE vertical_id = vp.id AND is_active = true) as radar_targets_count,
  vp.created_at,
  vp.updated_at
FROM vertical_packs vp
LEFT JOIN vertical_packs parent ON vp.parent_vertical_id = parent.id
ORDER BY vp.is_sub_vertical, vp.name;

-- Complete vertical config view
CREATE OR REPLACE VIEW v_vertical_complete_config AS
SELECT
  vp.id,
  vp.slug,
  vp.name,
  vp.config,
  vp.features,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'slug', st.slug,
      'name', st.name,
      'category', st.category,
      'score_weight', st.score_weight,
      'decay_days', st.decay_days
    ))
    FROM vertical_signal_types st
    WHERE st.vertical_id = vp.id AND st.is_active = true
  ) as signal_types,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'slug', sc.slug,
      'name', sc.name,
      'scoring_type', sc.scoring_type,
      'weights', sc.weights,
      'is_default', sc.is_default
    ))
    FROM vertical_scoring_templates sc
    WHERE sc.vertical_id = vp.id AND sc.is_active = true
  ) as scoring_templates,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'slug', er.slug,
      'name', er.name,
      'rule_type', er.rule_type,
      'conditions', er.conditions,
      'actions', er.actions
    ))
    FROM vertical_evidence_rules er
    WHERE er.vertical_id = vp.id AND er.is_active = true
  ) as evidence_rules,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'slug', pt.slug,
      'name', pt.name,
      'target_titles', pt.target_titles,
      'messaging_config', pt.messaging_config
    ))
    FROM vertical_persona_templates pt
    WHERE pt.vertical_id = vp.id AND pt.is_active = true
  ) as persona_templates,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'slug', jt.slug,
      'name', jt.name,
      'journey_type', jt.journey_type,
      'steps', jt.steps
    ))
    FROM vertical_journey_templates jt
    WHERE jt.vertical_id = vp.id AND jt.is_active = true
  ) as journey_templates
FROM vertical_packs vp
WHERE vp.is_active = true;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get complete vertical configuration
CREATE OR REPLACE FUNCTION get_vertical_config(p_vertical_slug VARCHAR)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'vertical', jsonb_build_object(
      'id', vp.id,
      'slug', vp.slug,
      'name', vp.name,
      'config', vp.config,
      'features', vp.features
    ),
    'signal_types', COALESCE((
      SELECT jsonb_agg(row_to_json(st)::jsonb)
      FROM vertical_signal_types st
      WHERE st.vertical_id = vp.id AND st.is_active = true
    ), '[]'::jsonb),
    'scoring_templates', COALESCE((
      SELECT jsonb_agg(row_to_json(sc)::jsonb)
      FROM vertical_scoring_templates sc
      WHERE sc.vertical_id = vp.id AND sc.is_active = true
    ), '[]'::jsonb),
    'evidence_rules', COALESCE((
      SELECT jsonb_agg(row_to_json(er)::jsonb)
      FROM vertical_evidence_rules er
      WHERE er.vertical_id = vp.id AND er.is_active = true
    ), '[]'::jsonb),
    'persona_templates', COALESCE((
      SELECT jsonb_agg(row_to_json(pt)::jsonb)
      FROM vertical_persona_templates pt
      WHERE pt.vertical_id = vp.id AND pt.is_active = true
    ), '[]'::jsonb),
    'journey_templates', COALESCE((
      SELECT jsonb_agg(row_to_json(jt)::jsonb)
      FROM vertical_journey_templates jt
      WHERE jt.vertical_id = vp.id AND jt.is_active = true
    ), '[]'::jsonb),
    'radar_targets', COALESCE((
      SELECT jsonb_agg(row_to_json(rt)::jsonb)
      FROM vertical_radar_targets rt
      WHERE rt.vertical_id = vp.id AND rt.is_active = true
    ), '[]'::jsonb)
  ) INTO v_result
  FROM vertical_packs vp
  WHERE vp.slug = p_vertical_slug;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Clone vertical pack
CREATE OR REPLACE FUNCTION clone_vertical_pack(
  p_source_slug VARCHAR,
  p_new_slug VARCHAR,
  p_new_name VARCHAR
)
RETURNS UUID AS $$
DECLARE
  v_source_id UUID;
  v_new_id UUID;
BEGIN
  -- Get source vertical
  SELECT id INTO v_source_id FROM vertical_packs WHERE slug = p_source_slug;
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Source vertical not found: %', p_source_slug;
  END IF;

  -- Clone vertical pack
  INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system)
  SELECT p_new_slug, p_new_name, description, config, features, icon, color, false
  FROM vertical_packs WHERE id = v_source_id
  RETURNING id INTO v_new_id;

  -- Clone signal types
  INSERT INTO vertical_signal_types (vertical_id, slug, name, description, category, detection_config, score_weight, score_category, decay_days, decay_type, priority)
  SELECT v_new_id, slug, name, description, category, detection_config, score_weight, score_category, decay_days, decay_type, priority
  FROM vertical_signal_types WHERE vertical_id = v_source_id AND is_active = true;

  -- Clone scoring templates
  INSERT INTO vertical_scoring_templates (vertical_id, slug, name, description, scoring_type, weights, thresholds, normalization, is_default)
  SELECT v_new_id, slug, name, description, scoring_type, weights, thresholds, normalization, is_default
  FROM vertical_scoring_templates WHERE vertical_id = v_source_id AND is_active = true;

  -- Clone evidence rules
  INSERT INTO vertical_evidence_rules (vertical_id, slug, name, description, rule_type, conditions, actions, evidence_category, evidence_weight, priority)
  SELECT v_new_id, slug, name, description, rule_type, conditions, actions, evidence_category, evidence_weight, priority
  FROM vertical_evidence_rules WHERE vertical_id = v_source_id AND is_active = true;

  -- Clone persona templates
  INSERT INTO vertical_persona_templates (vertical_id, slug, name, description, target_titles, target_departments, seniority_levels, characteristics, messaging_config, outreach_templates, score_multipliers, is_default, priority)
  SELECT v_new_id, slug, name, description, target_titles, target_departments, seniority_levels, characteristics, messaging_config, outreach_templates, score_multipliers, is_default, priority
  FROM vertical_persona_templates WHERE vertical_id = v_source_id AND is_active = true;

  -- Clone journey templates
  INSERT INTO vertical_journey_templates (vertical_id, slug, name, description, journey_type, steps, entry_conditions, exit_conditions, llm_config, timeout_minutes, retry_config, is_default)
  SELECT v_new_id, slug, name, description, journey_type, steps, entry_conditions, exit_conditions, llm_config, timeout_minutes, retry_config, is_default
  FROM vertical_journey_templates WHERE vertical_id = v_source_id AND is_active = true;

  -- Clone radar targets
  INSERT INTO vertical_radar_targets (vertical_id, slug, name, description, target_type, discovery_config, min_score_threshold, alert_config, priority)
  SELECT v_new_id, slug, name, description, target_type, discovery_config, min_score_threshold, alert_config, priority
  FROM vertical_radar_targets WHERE vertical_id = v_source_id AND is_active = true;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA - CORE VERTICALS
-- ============================================================================

-- Banking vertical
INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system) VALUES
('banking', 'Banking & Financial Services', 'Banks, credit unions, and financial institutions',
 '{"industry_codes": ["6011", "6021", "6022"], "regions": ["UAE", "GCC", "Global"], "compliance_required": true}',
 '{"enable_journeys": true, "enable_autonomous": true, "enable_signals": true, "enable_evidence": true}',
 'bank', '#1E40AF', true)
ON CONFLICT (slug) DO NOTHING;

-- Insurance vertical
INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system) VALUES
('insurance', 'Insurance', 'Insurance companies and brokers',
 '{"industry_codes": ["6311", "6321", "6331"], "regions": ["UAE", "GCC", "Global"], "compliance_required": true}',
 '{"enable_journeys": true, "enable_autonomous": true, "enable_signals": true, "enable_evidence": true}',
 'shield', '#059669', true)
ON CONFLICT (slug) DO NOTHING;

-- Real Estate vertical
INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system) VALUES
('real_estate', 'Real Estate', 'Real estate developers, brokers, and property management',
 '{"industry_codes": ["6512", "6531", "6552"], "regions": ["UAE", "GCC"], "compliance_required": false}',
 '{"enable_journeys": true, "enable_autonomous": true, "enable_signals": true, "enable_evidence": true}',
 'building', '#D97706', true)
ON CONFLICT (slug) DO NOTHING;

-- SaaS vertical
INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system) VALUES
('saas', 'SaaS & Technology', 'Software companies and tech startups',
 '{"industry_codes": ["7372", "7371", "7379"], "regions": ["Global"], "compliance_required": false}',
 '{"enable_journeys": true, "enable_autonomous": true, "enable_signals": true, "enable_evidence": true}',
 'code', '#7C3AED', true)
ON CONFLICT (slug) DO NOTHING;

-- Recruitment vertical
INSERT INTO vertical_packs (slug, name, description, config, features, icon, color, is_system) VALUES
('recruitment', 'Recruitment & Staffing', 'Recruitment agencies and HR services',
 '{"industry_codes": ["7361", "7363"], "regions": ["Global"], "compliance_required": false}',
 '{"enable_journeys": true, "enable_autonomous": false, "enable_signals": true, "enable_evidence": true}',
 'users', '#DC2626', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - SIGNAL TYPES FOR BANKING
-- ============================================================================

INSERT INTO vertical_signal_types (vertical_id, slug, name, description, category, detection_config, score_weight, score_category, decay_days, priority)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.category,
  vals.detection_config::jsonb,
  vals.score_weight,
  vals.score_category,
  vals.decay_days,
  vals.priority
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('digital_transformation', 'Digital Transformation Initiative', 'Bank announcing digital transformation projects', 'intent', '{"keywords": ["digital transformation", "core banking", "modernization"], "sources": ["news", "press_releases"]}', 1.2, 't_score', 60, 10),
  ('regulatory_change', 'Regulatory Compliance Need', 'New regulations requiring system changes', 'trigger', '{"keywords": ["basel", "ifrs", "regulatory compliance", "audit"], "sources": ["news", "filings"]}', 1.1, 't_score', 90, 20),
  ('leadership_change', 'CIO/CTO Leadership Change', 'New technology leadership appointment', 'event', '{"keywords": ["appointed CIO", "new CTO", "technology head"], "sources": ["linkedin", "news"]}', 1.3, 't_score', 30, 15),
  ('expansion_plans', 'Geographic Expansion', 'Bank expanding to new regions', 'intent', '{"keywords": ["expansion", "new branch", "market entry"], "sources": ["news", "filings"]}', 1.0, 'q_score', 90, 30),
  ('tech_investment', 'Technology Investment', 'Announced technology budget or investment', 'intent', '{"keywords": ["technology investment", "IT budget", "digital spend"], "sources": ["earnings", "news"]}', 1.2, 'q_score', 60, 25)
) AS vals(slug, name, description, category, detection_config, score_weight, score_category, decay_days, priority)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - SCORING TEMPLATES FOR BANKING
-- ============================================================================

INSERT INTO vertical_scoring_templates (vertical_id, slug, name, description, scoring_type, weights, thresholds, is_default)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.scoring_type,
  vals.weights::jsonb,
  vals.thresholds::jsonb,
  vals.is_default
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('banking_q_score', 'Banking Q-Score', 'Qualification score for banking prospects', 'q_score',
   '{"revenue_fit": 0.25, "asset_size": 0.20, "employee_count": 0.15, "technology_maturity": 0.20, "growth_rate": 0.10, "region_fit": 0.10}',
   '{"hot": 80, "warm": 60, "cold": 40}', true),
  ('banking_t_score', 'Banking T-Score', 'Timing score for banking opportunities', 't_score',
   '{"digital_signals": 0.30, "regulatory_pressure": 0.25, "leadership_change": 0.20, "budget_cycle": 0.15, "competitive_pressure": 0.10}',
   '{"hot": 75, "warm": 55, "cold": 35}', true),
  ('banking_composite', 'Banking Composite Score', 'Combined score for banking', 'composite',
   '{"q_score": 0.35, "t_score": 0.35, "l_score": 0.15, "e_score": 0.15}',
   '{"hot": 75, "warm": 55, "cold": 35}', false)
) AS vals(slug, name, description, scoring_type, weights, thresholds, is_default)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - EVIDENCE RULES FOR BANKING
-- ============================================================================

INSERT INTO vertical_evidence_rules (vertical_id, slug, name, description, rule_type, conditions, actions, evidence_category, evidence_weight, priority)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.rule_type,
  vals.conditions::jsonb,
  vals.actions::jsonb,
  vals.evidence_category,
  vals.evidence_weight,
  vals.priority
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('tier1_bank', 'Tier 1 Bank Detection', 'Identify top-tier banks by assets', 'validation',
   '{"field": "total_assets", "operator": "gt", "value": 100000000000}',
   '[{"type": "add_evidence", "evidence_type": "tier1_institution", "confidence": 0.95}]',
   'qualification', 1.3, 10),
  ('regulated_entity', 'Regulated Entity Check', 'Verify regulatory status', 'validation',
   '{"field": "regulatory_body", "operator": "in", "value": ["CBUAE", "DFSA", "ADGM"]}',
   '[{"type": "add_evidence", "evidence_type": "regulated_institution", "confidence": 0.99}]',
   'qualification', 1.1, 20),
  ('recent_funding', 'Recent Capital Raise', 'Detect recent funding events', 'enrichment',
   '{"field": "last_funding_date", "operator": "within_days", "value": 180}',
   '[{"type": "add_evidence", "evidence_type": "well_funded", "confidence": 0.85}]',
   'timing', 1.2, 30),
  ('tech_stack_modern', 'Modern Tech Stack', 'Check for modern technology indicators', 'derivation',
   '{"field": "tech_stack", "operator": "contains_any", "value": ["kubernetes", "aws", "azure", "microservices"]}',
   '[{"type": "add_evidence", "evidence_type": "tech_forward", "confidence": 0.80}]',
   'fit', 1.1, 40)
) AS vals(slug, name, description, rule_type, conditions, actions, evidence_category, evidence_weight, priority)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - PERSONA TEMPLATES FOR BANKING
-- ============================================================================

INSERT INTO vertical_persona_templates (vertical_id, slug, name, description, target_titles, target_departments, seniority_levels, characteristics, messaging_config, is_default, priority)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.target_titles::jsonb,
  vals.target_departments::jsonb,
  vals.seniority_levels::jsonb,
  vals.characteristics::jsonb,
  vals.messaging_config::jsonb,
  vals.is_default,
  vals.priority
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('banking_cio', 'Banking CIO', 'Chief Information Officer at banks',
   '["CIO", "Chief Information Officer", "Group CIO"]',
   '["Technology", "IT", "Digital"]',
   '["C-Level"]',
   '{"decision_maker": true, "budget_authority": true, "technical": true, "strategic": true}',
   '{"tone": "executive", "focus": "strategic_value", "length": "concise", "avoid": ["technical_jargon"]}',
   true, 10),
  ('banking_cto', 'Banking CTO', 'Chief Technology Officer at banks',
   '["CTO", "Chief Technology Officer", "Head of Technology"]',
   '["Technology", "Engineering", "Digital"]',
   '["C-Level", "VP"]',
   '{"decision_maker": true, "budget_authority": false, "technical": true, "strategic": true}',
   '{"tone": "technical_executive", "focus": "innovation", "length": "medium", "include": ["technical_capabilities"]}',
   false, 20),
  ('banking_cdo', 'Banking CDO', 'Chief Digital Officer at banks',
   '["CDO", "Chief Digital Officer", "Head of Digital", "Digital Transformation Lead"]',
   '["Digital", "Innovation", "Strategy"]',
   '["C-Level", "VP"]',
   '{"decision_maker": true, "budget_authority": true, "technical": false, "strategic": true}',
   '{"tone": "visionary", "focus": "transformation", "length": "medium", "include": ["case_studies"]}',
   false, 15)
) AS vals(slug, name, description, target_titles, target_departments, seniority_levels, characteristics, messaging_config, is_default, priority)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - JOURNEY TEMPLATES FOR BANKING
-- ============================================================================

INSERT INTO vertical_journey_templates (vertical_id, slug, name, description, journey_type, steps, entry_conditions, exit_conditions, llm_config, timeout_minutes, is_default)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.journey_type,
  vals.steps::jsonb,
  vals.entry_conditions::jsonb,
  vals.exit_conditions::jsonb,
  vals.llm_config::jsonb,
  vals.timeout_minutes,
  vals.is_default
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('banking_full_pipeline', 'Banking Full Pipeline', 'Complete discovery to outreach journey for banking',
   'full_pipeline',
   '[
     {"step": 1, "name": "discover_signals", "action": "signal_discovery", "config": {"sources": ["news", "filings", "linkedin"]}},
     {"step": 2, "name": "enrich_company", "action": "company_enrichment", "config": {"providers": ["apollo", "clearbit"]}},
     {"step": 3, "name": "identify_contacts", "action": "contact_discovery", "config": {"personas": ["banking_cio", "banking_cto"]}},
     {"step": 4, "name": "calculate_scores", "action": "scoring", "config": {"template": "banking_composite"}},
     {"step": 5, "name": "generate_evidence", "action": "evidence_generation", "config": {"min_confidence": 0.7}},
     {"step": 6, "name": "generate_outreach", "action": "outreach_generation", "config": {"channels": ["email", "linkedin"]}}
   ]',
   '{"required_fields": ["domain", "company_name"], "min_employee_count": 50}',
   '{"max_steps": 10, "success_criteria": {"composite_score_gt": 60}}',
   '{"preferred_model": "gpt-4o", "temperature": 0.7, "task_type": "journey_orchestration"}',
   60, true),
  ('banking_quick_score', 'Banking Quick Score', 'Fast scoring journey for banking leads',
   'scoring',
   '[
     {"step": 1, "name": "enrich_basic", "action": "company_enrichment", "config": {"providers": ["apollo"], "fields": ["revenue", "employee_count", "industry"]}},
     {"step": 2, "name": "calculate_q_score", "action": "scoring", "config": {"template": "banking_q_score"}}
   ]',
   '{"required_fields": ["domain"]}',
   '{"max_steps": 3}',
   '{"preferred_model": "gpt-4o-mini", "temperature": 0.5}',
   10, false)
) AS vals(slug, name, description, journey_type, steps, entry_conditions, exit_conditions, llm_config, timeout_minutes, is_default)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

-- ============================================================================
-- SEED DATA - RADAR TARGETS FOR BANKING
-- ============================================================================

INSERT INTO vertical_radar_targets (vertical_id, slug, name, description, target_type, discovery_config, min_score_threshold, alert_config, priority)
SELECT
  vp.id,
  vals.slug,
  vals.name,
  vals.description,
  vals.target_type,
  vals.discovery_config::jsonb,
  vals.min_score_threshold,
  vals.alert_config::jsonb,
  vals.priority
FROM vertical_packs vp
CROSS JOIN (VALUES
  ('uae_tier1_banks', 'UAE Tier 1 Banks', 'Top banks in UAE by assets',
   'company',
   '{"sources": ["apollo", "manual"], "filters": {"country": "UAE", "industry": "Banking", "employee_count_min": 500}, "refresh_interval_hours": 168}',
   60,
   '{"notify_on_hot": true, "notify_threshold": 80, "channels": ["email"]}',
   10),
  ('gcc_digital_banks', 'GCC Digital Banks', 'Digital-first banks in GCC',
   'company',
   '{"sources": ["apollo", "news"], "filters": {"region": "GCC", "keywords": ["digital bank", "neobank", "challenger bank"]}, "refresh_interval_hours": 24}',
   50,
   '{"notify_on_hot": true, "notify_threshold": 75, "channels": ["email", "slack"]}',
   20)
) AS vals(slug, name, description, target_type, discovery_config, min_score_threshold, alert_config, priority)
WHERE vp.slug = 'banking'
ON CONFLICT (vertical_id, slug) DO NOTHING;

COMMIT;
