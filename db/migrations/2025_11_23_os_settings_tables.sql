-- OS Settings Tables Migration
-- Sprint 67: OS Settings Unification Layer
--
-- Centralizes all hardcoded configuration values into configurable tables

-- ==================================================================
-- 1. Core OS Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS os_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  value_type VARCHAR(20) NOT NULL DEFAULT 'string',
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  is_readonly BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(100),
  UNIQUE(tenant_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_os_settings_tenant ON os_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_os_settings_category ON os_settings(category);
CREATE INDEX IF NOT EXISTS idx_os_settings_key ON os_settings(tenant_id, key);

-- ==================================================================
-- 2. Scoring Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS scoring_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  profile_name VARCHAR(50) NOT NULL,

  -- Q-Score weights
  q_score_domain_weight DECIMAL(3,2) DEFAULT 0.25,
  q_score_linkedin_weight DECIMAL(3,2) DEFAULT 0.20,
  q_score_signals_weight DECIMAL(3,2) DEFAULT 0.20,
  q_score_uae_weight DECIMAL(3,2) DEFAULT 0.25,
  q_score_recency_weight DECIMAL(3,2) DEFAULT 0.10,

  -- Composite score weights
  composite_q_weight DECIMAL(3,2) DEFAULT 0.30,
  composite_t_weight DECIMAL(3,2) DEFAULT 0.25,
  composite_l_weight DECIMAL(3,2) DEFAULT 0.25,
  composite_e_weight DECIMAL(3,2) DEFAULT 0.20,

  -- Thresholds
  tier_hot_threshold INTEGER DEFAULT 80,
  tier_warm_threshold INTEGER DEFAULT 60,
  tier_cold_threshold INTEGER DEFAULT 40,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, profile_name)
);

CREATE INDEX IF NOT EXISTS idx_scoring_settings_tenant ON scoring_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scoring_settings_profile ON scoring_settings(profile_name);

-- ==================================================================
-- 3. Discovery Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS discovery_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Source priorities (1 = highest)
  source_news_priority INTEGER DEFAULT 1,
  source_linkedin_priority INTEGER DEFAULT 2,
  source_glassdoor_priority INTEGER DEFAULT 3,
  source_g2_priority INTEGER DEFAULT 4,
  source_sec_priority INTEGER DEFAULT 5,

  -- Source enablement
  source_news_enabled BOOLEAN DEFAULT true,
  source_linkedin_enabled BOOLEAN DEFAULT true,
  source_glassdoor_enabled BOOLEAN DEFAULT true,
  source_g2_enabled BOOLEAN DEFAULT false,
  source_sec_enabled BOOLEAN DEFAULT false,

  -- Quality thresholds
  min_quality_score DECIMAL(3,2) DEFAULT 0.60,
  min_confidence_score DECIMAL(3,2) DEFAULT 0.50,

  -- Signal thresholds
  signal_recency_days INTEGER DEFAULT 30,
  signal_max_per_source INTEGER DEFAULT 50,
  signal_dedup_threshold DECIMAL(3,2) DEFAULT 0.80,

  -- Cache settings
  cache_ttl_minutes INTEGER DEFAULT 15,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_settings_tenant ON discovery_settings(tenant_id);

-- ==================================================================
-- 4. Outreach Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS outreach_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Default tone and channel
  default_channel VARCHAR(20) DEFAULT 'email',
  default_tone VARCHAR(20) DEFAULT 'friendly',

  -- Personalization
  personalization_level VARCHAR(20) DEFAULT 'medium',
  include_company_research BOOLEAN DEFAULT true,
  include_signal_context BOOLEAN DEFAULT true,

  -- Email settings
  email_from_name VARCHAR(100),
  email_signature TEXT,
  email_max_length INTEGER DEFAULT 500,

  -- LinkedIn settings
  linkedin_connection_message_max INTEGER DEFAULT 300,
  linkedin_inmail_max INTEGER DEFAULT 1900,

  -- Rate limiting
  daily_outreach_limit INTEGER DEFAULT 100,
  hourly_outreach_limit INTEGER DEFAULT 20,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_settings_tenant ON outreach_settings(tenant_id);

-- ==================================================================
-- 5. Vertical Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS vertical_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  vertical_id VARCHAR(50) NOT NULL,

  -- Vertical configuration
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  color_primary VARCHAR(7),
  color_secondary VARCHAR(7),

  -- Scoring profile
  scoring_profile VARCHAR(50),

  -- Discovery preferences
  preferred_sources JSONB DEFAULT '["news", "linkedin"]',
  industry_keywords JSONB DEFAULT '[]',

  -- Outreach preferences
  outreach_profile VARCHAR(50),
  outreach_tone VARCHAR(20) DEFAULT 'friendly',

  -- Feature flags
  enable_auto_discovery BOOLEAN DEFAULT true,
  enable_auto_enrichment BOOLEAN DEFAULT true,
  enable_auto_scoring BOOLEAN DEFAULT true,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_vertical_settings_tenant ON vertical_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vertical_settings_vertical ON vertical_settings(vertical_id);

-- ==================================================================
-- 6. Persona Settings Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS persona_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  persona_id VARCHAR(50) NOT NULL,

  -- Persona definition
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  target_titles JSONB DEFAULT '[]',
  target_departments JSONB DEFAULT '[]',

  -- Outreach style
  tone VARCHAR(20) DEFAULT 'friendly',
  formality_level VARCHAR(20) DEFAULT 'professional',
  key_pain_points JSONB DEFAULT '[]',
  value_propositions JSONB DEFAULT '[]',

  -- Email templates
  email_subject_templates JSONB DEFAULT '[]',
  email_opening_templates JSONB DEFAULT '[]',
  email_cta_templates JSONB DEFAULT '[]',

  -- Scoring adjustments
  score_boost INTEGER DEFAULT 0,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_settings_tenant ON persona_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_persona_settings_persona ON persona_settings(persona_id);

-- ==================================================================
-- 7. Insert Default Settings
-- ==================================================================

-- Default OS settings
INSERT INTO os_settings (tenant_id, category, key, value, value_type, description, is_system) VALUES
('00000000-0000-0000-0000-000000000001', 'system', 'os_version', '"1.0.0"', 'string', 'Current OS version', true),
('00000000-0000-0000-0000-000000000001', 'system', 'default_profile', '"default"', 'string', 'Default ranking profile', true),
('00000000-0000-0000-0000-000000000001', 'limits', 'max_entities_per_pipeline', '100', 'number', 'Max entities in pipeline', false),
('00000000-0000-0000-0000-000000000001', 'limits', 'max_signals_per_discovery', '500', 'number', 'Max signals per discovery', false),
('00000000-0000-0000-0000-000000000001', 'cache', 'default_ttl_minutes', '15', 'number', 'Default cache TTL', false),
('00000000-0000-0000-0000-000000000001', 'features', 'enable_ai_outreach', 'true', 'boolean', 'Enable AI outreach generation', false),
('00000000-0000-0000-0000-000000000001', 'features', 'enable_multi_source', 'true', 'boolean', 'Enable multi-source discovery', false)
ON CONFLICT (tenant_id, category, key) DO NOTHING;

-- Default scoring settings
INSERT INTO scoring_settings (tenant_id, profile_name) VALUES
('00000000-0000-0000-0000-000000000001', 'default'),
('00000000-0000-0000-0000-000000000001', 'banking_employee'),
('00000000-0000-0000-0000-000000000001', 'banking_corporate'),
('00000000-0000-0000-0000-000000000001', 'insurance_individual'),
('00000000-0000-0000-0000-000000000001', 'recruitment_hiring'),
('00000000-0000-0000-0000-000000000001', 'saas_b2b')
ON CONFLICT (tenant_id, profile_name) DO NOTHING;

-- Default discovery settings
INSERT INTO discovery_settings (tenant_id) VALUES
('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- Default outreach settings
INSERT INTO outreach_settings (tenant_id) VALUES
('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- ==================================================================
-- 8. Create helper functions
-- ==================================================================

-- Get setting value
CREATE OR REPLACE FUNCTION get_os_setting(
  p_tenant_id UUID,
  p_category VARCHAR,
  p_key VARCHAR
) RETURNS JSONB AS $$
BEGIN
  RETURN (
    SELECT value
    FROM os_settings
    WHERE tenant_id = p_tenant_id
      AND category = p_category
      AND key = p_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set setting value
CREATE OR REPLACE FUNCTION set_os_setting(
  p_tenant_id UUID,
  p_category VARCHAR,
  p_key VARCHAR,
  p_value JSONB,
  p_updated_by VARCHAR DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO os_settings (tenant_id, category, key, value, updated_by, updated_at)
  VALUES (p_tenant_id, p_category, p_key, p_value, p_updated_by, NOW())
  ON CONFLICT (tenant_id, category, key)
  DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  WHERE NOT os_settings.is_readonly;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- 9. Add comments
-- ==================================================================

COMMENT ON TABLE os_settings IS 'Sprint 67: Centralized OS configuration settings';
COMMENT ON TABLE scoring_settings IS 'Sprint 67: Scoring profile configuration';
COMMENT ON TABLE discovery_settings IS 'Sprint 67: Signal discovery configuration';
COMMENT ON TABLE outreach_settings IS 'Sprint 67: Outreach generation configuration';
COMMENT ON TABLE vertical_settings IS 'Sprint 67: Industry vertical configuration';
COMMENT ON TABLE persona_settings IS 'Sprint 67: Target persona configuration';
