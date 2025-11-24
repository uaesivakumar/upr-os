-- Vertical Engine Migration
-- Sprint 70: Vertical Engine Shell
--
-- Industry-specific configuration for verticals

-- ==================================================================
-- 1. Vertical Engine Configs Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS vertical_engine_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  vertical_id VARCHAR(100) NOT NULL,

  -- Configuration
  config JSONB NOT NULL DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_vert_config_tenant ON vertical_engine_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vert_config_vertical ON vertical_engine_configs(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vert_config_active ON vertical_engine_configs(is_active);

-- ==================================================================
-- 2. Vertical Entity Assignments Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS vertical_entity_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id UUID NOT NULL,
  vertical_id VARCHAR(100) NOT NULL,

  -- Assignment details
  assigned_by VARCHAR(100),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Recommendation data
  recommendation_score INTEGER,
  recommendation_reasons JSONB DEFAULT '[]',

  -- Status
  is_primary BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, entity_id, vertical_id)
);

CREATE INDEX IF NOT EXISTS idx_vert_assign_tenant ON vertical_entity_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vert_assign_entity ON vertical_entity_assignments(entity_id);
CREATE INDEX IF NOT EXISTS idx_vert_assign_vertical ON vertical_entity_assignments(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vert_assign_primary ON vertical_entity_assignments(is_primary);

-- ==================================================================
-- 3. Vertical Performance Metrics Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS vertical_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  vertical_id VARCHAR(100) NOT NULL,

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Entity metrics
  total_entities INTEGER DEFAULT 0,
  new_entities INTEGER DEFAULT 0,
  hot_tier_count INTEGER DEFAULT 0,
  warm_tier_count INTEGER DEFAULT 0,
  cold_tier_count INTEGER DEFAULT 0,

  -- Discovery metrics
  signals_discovered INTEGER DEFAULT 0,
  avg_signal_quality DECIMAL(5,2),

  -- Outreach metrics
  outreach_sent INTEGER DEFAULT 0,
  outreach_opened INTEGER DEFAULT 0,
  outreach_replied INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,

  -- Scores
  avg_q_score DECIMAL(5,2),
  avg_t_score DECIMAL(5,2),
  avg_l_score DECIMAL(5,2),
  avg_e_score DECIMAL(5,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, vertical_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_vert_metrics_tenant ON vertical_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vert_metrics_vertical ON vertical_metrics(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vert_metrics_period ON vertical_metrics(period_start, period_end);

-- ==================================================================
-- 4. Vertical Outreach Templates Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS vertical_outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  vertical_id VARCHAR(100) NOT NULL,

  -- Template details
  name VARCHAR(200) NOT NULL,
  description TEXT,
  channel VARCHAR(50) NOT NULL DEFAULT 'email',

  -- Content
  subject_template TEXT,
  body_template TEXT,
  cta_template TEXT,

  -- Configuration
  tone VARCHAR(50),
  formality VARCHAR(50),
  variables JSONB DEFAULT '[]',

  -- Performance
  usage_count INTEGER DEFAULT 0,
  avg_open_rate DECIMAL(5,2),
  avg_reply_rate DECIMAL(5,2),
  avg_conversion_rate DECIMAL(5,2),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vert_templates_tenant ON vertical_outreach_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vert_templates_vertical ON vertical_outreach_templates(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vert_templates_channel ON vertical_outreach_templates(channel);
CREATE INDEX IF NOT EXISTS idx_vert_templates_active ON vertical_outreach_templates(is_active);

-- ==================================================================
-- 5. Insert Default Vertical Configs
-- ==================================================================

INSERT INTO vertical_engine_configs (tenant_id, vertical_id, config, is_default) VALUES
('00000000-0000-0000-0000-000000000001', 'banking_employee', '{
  "name": "Banking - Employee Banking",
  "category": "banking",
  "entityType": "company",
  "scoring": {"profile": "banking_employee", "weights": {"q_score": 0.25, "t_score": 0.35, "l_score": 0.20, "e_score": 0.20}},
  "discovery": {"preferredSources": ["news", "linkedin", "glassdoor"], "signalTypes": ["hiring", "expansion", "funding"]}
}', true),
('00000000-0000-0000-0000-000000000001', 'banking_corporate', '{
  "name": "Banking - Corporate Banking",
  "category": "banking",
  "entityType": "company",
  "scoring": {"profile": "banking_corporate", "weights": {"q_score": 0.35, "t_score": 0.20, "l_score": 0.25, "e_score": 0.20}},
  "discovery": {"preferredSources": ["sec", "news", "linkedin"], "signalTypes": ["funding", "acquisition", "expansion", "ipo"]}
}', true),
('00000000-0000-0000-0000-000000000001', 'insurance_individual', '{
  "name": "Insurance - Individual Coverage",
  "category": "insurance",
  "entityType": "individual",
  "scoring": {"profile": "insurance_individual", "weights": {"q_score": 0.20, "t_score": 0.35, "l_score": 0.30, "e_score": 0.15}},
  "discovery": {"preferredSources": ["linkedin", "news"], "signalTypes": ["job_change", "life_event", "relocation"]}
}', true),
('00000000-0000-0000-0000-000000000001', 'recruitment_hiring', '{
  "name": "Recruitment - Hiring Companies",
  "category": "recruitment",
  "entityType": "company",
  "scoring": {"profile": "recruitment_hiring", "weights": {"q_score": 0.20, "t_score": 0.40, "l_score": 0.20, "e_score": 0.20}},
  "discovery": {"preferredSources": ["linkedin", "glassdoor", "news"], "signalTypes": ["hiring", "job_posting", "expansion", "funding"]}
}', true),
('00000000-0000-0000-0000-000000000001', 'saas_b2b', '{
  "name": "SaaS - B2B Sales",
  "category": "saas",
  "entityType": "company",
  "scoring": {"profile": "saas_b2b", "weights": {"q_score": 0.30, "t_score": 0.25, "l_score": 0.30, "e_score": 0.15}},
  "discovery": {"preferredSources": ["g2", "news", "linkedin"], "signalTypes": ["tech_adoption", "funding", "expansion"]}
}', true)
ON CONFLICT (tenant_id, vertical_id) DO NOTHING;

-- ==================================================================
-- 6. Row Level Security
-- ==================================================================

ALTER TABLE vertical_engine_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertical_entity_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertical_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertical_outreach_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY vert_config_tenant_isolation ON vertical_engine_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY vert_assign_tenant_isolation ON vertical_entity_assignments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY vert_metrics_tenant_isolation ON vertical_metrics
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY vert_templates_tenant_isolation ON vertical_outreach_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ==================================================================
-- 7. Comments
-- ==================================================================

COMMENT ON TABLE vertical_engine_configs IS 'Sprint 70: Custom vertical configurations per tenant';
COMMENT ON TABLE vertical_entity_assignments IS 'Sprint 70: Entity-to-vertical assignments';
COMMENT ON TABLE vertical_metrics IS 'Sprint 70: Vertical performance metrics';
COMMENT ON TABLE vertical_outreach_templates IS 'Sprint 70: Vertical-specific outreach templates';
