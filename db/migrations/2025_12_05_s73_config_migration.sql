-- ============================================================================
-- Sprint 73: Configuration Migration - Move Hardcoded Values to Database
-- ============================================================================
--
-- This migration addresses the hardcoded values audit:
-- 1. Vertical model preferences (currently hardcoded in router.js:288-314)
-- 2. Q-Score weights and thresholds (currently hardcoded in companyPreview.js)
-- 3. Prompt templates (currently embedded in various services)
-- 4. Scoring configuration per vertical/sub-vertical
-- ============================================================================

BEGIN;

-- ============================================================================
-- CLEANUP: Drop any existing incompatible tables (safe - recreated below)
-- ============================================================================
DROP TABLE IF EXISTS llm_vertical_model_preferences CASCADE;
DROP TABLE IF EXISTS scoring_config CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS campaign_scoring_config CASCADE;
DROP TABLE IF EXISTS lifecycle_stage_keywords CASCADE;
DROP TABLE IF EXISTS company_size_bands CASCADE;
DROP TABLE IF EXISTS provider_health_thresholds CASCADE;
DROP TABLE IF EXISTS email_pattern_config CASCADE;
DROP TABLE IF EXISTS confidence_thresholds CASCADE;

-- Drop functions if they exist
DROP FUNCTION IF EXISTS get_vertical_model_preferences(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS get_scoring_config(VARCHAR, VARCHAR, VARCHAR);

-- ============================================================================
-- 1. VERTICAL MODEL PREFERENCES
-- Replaces hardcoded VERTICAL_MODEL_PREFERENCES in services/llm/router.js
-- ============================================================================

CREATE TABLE llm_vertical_model_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50), -- NULL means applies to all sub-verticals
  task_type VARCHAR(50) NOT NULL, -- 'outreach_generation', 'company_analysis', etc.

  -- Model preferences (ordered array of model slugs)
  model_preferences VARCHAR(100)[] NOT NULL,

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100, -- Lower = higher priority for overlapping rules

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',

  UNIQUE(vertical, sub_vertical, task_type)
);

-- Index for efficient lookups
CREATE INDEX idx_llm_vertical_prefs_lookup
  ON llm_vertical_model_preferences(vertical, task_type, is_active);

-- Seed with current hardcoded values
INSERT INTO llm_vertical_model_preferences (vertical, task_type, model_preferences, description) VALUES
  -- Banking
  ('banking', 'outreach_generation', ARRAY['claude-3-5-sonnet', 'gpt-4o'], 'Better compliance tone for banking outreach'),
  ('banking', 'company_analysis', ARRAY['gpt-4o', 'claude-3-opus'], 'Thorough analysis for banking companies'),
  ('banking', 'data_extraction', ARRAY['gpt-4o-mini', 'gemini-1-5-flash'], 'Cost effective extraction for banking'),

  -- Insurance
  ('insurance', 'outreach_generation', ARRAY['claude-3-5-sonnet', 'gpt-4o'], 'Insurance outreach preferences'),
  ('insurance', 'company_analysis', ARRAY['gpt-4o', 'claude-3-5-sonnet'], 'Insurance analysis preferences'),
  ('insurance', 'data_extraction', ARRAY['gpt-4o-mini', 'gemini-1-5-flash'], 'Insurance extraction preferences'),

  -- SaaS
  ('saas', 'outreach_generation', ARRAY['gpt-4o', 'claude-3-5-sonnet'], 'More casual tone for SaaS'),
  ('saas', 'company_analysis', ARRAY['claude-3-5-sonnet', 'gpt-4o'], 'SaaS analysis preferences'),
  ('saas', 'data_extraction', ARRAY['gemini-1-5-flash', 'gpt-4o-mini'], 'Fast extraction for SaaS'),

  -- Recruitment
  ('recruitment', 'outreach_generation', ARRAY['claude-3-5-sonnet', 'gpt-4o'], 'Personal touch for recruitment'),
  ('recruitment', 'contact_lookup', ARRAY['gpt-4o-mini', 'gemini-1-5-flash'], 'Contact lookup for recruitment'),
  ('recruitment', 'data_extraction', ARRAY['gpt-4o-mini', 'gemini-1-5-flash'], 'Recruitment extraction preferences'),

  -- Real Estate
  ('real_estate', 'outreach_generation', ARRAY['gpt-4o', 'claude-3-5-sonnet'], 'Real estate outreach preferences'),
  ('real_estate', 'company_analysis', ARRAY['gpt-4o', 'claude-3-5-sonnet'], 'Real estate analysis preferences'),
  ('real_estate', 'data_extraction', ARRAY['gpt-4o-mini', 'gemini-1-5-flash'], 'Real estate extraction preferences')
ON CONFLICT (vertical, sub_vertical, task_type) DO UPDATE SET
  model_preferences = EXCLUDED.model_preferences,
  description = EXCLUDED.description,
  updated_at = NOW();


-- ============================================================================
-- 2. Q-SCORE CONFIGURATION
-- Replaces hardcoded weights in companyPreview.js:494-505
-- ============================================================================

CREATE TABLE scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50), -- NULL means applies to all sub-verticals
  config_type VARCHAR(50) NOT NULL, -- 'qscore_weights', 'qscore_grades', 'trust_weights'

  -- Configuration (flexible JSON for different config types)
  config JSONB NOT NULL,

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',

  UNIQUE(vertical, sub_vertical, config_type)
);

-- Index for lookups
CREATE INDEX idx_scoring_config_lookup
  ON scoring_config(vertical, config_type, is_active);

-- Seed Q-Score weights (from companyPreview.js:494-500)
INSERT INTO scoring_config (vertical, config_type, config, description) VALUES
  ('banking', 'qscore_weights', '{
    "domain": 25,
    "linkedin": 20,
    "signals": 20,
    "uaeContext": 25,
    "recency": 10
  }', 'Q-Score component weights for banking vertical'),

  ('insurance', 'qscore_weights', '{
    "domain": 25,
    "linkedin": 20,
    "signals": 20,
    "uaeContext": 25,
    "recency": 10
  }', 'Q-Score component weights for insurance vertical'),

  ('saas', 'qscore_weights', '{
    "domain": 30,
    "linkedin": 25,
    "signals": 25,
    "uaeContext": 10,
    "recency": 10
  }', 'Q-Score component weights for SaaS vertical - less UAE focus'),

  ('recruitment', 'qscore_weights', '{
    "domain": 20,
    "linkedin": 30,
    "signals": 25,
    "uaeContext": 15,
    "recency": 10
  }', 'Q-Score component weights for recruitment - LinkedIn heavy'),

  ('real_estate', 'qscore_weights', '{
    "domain": 25,
    "linkedin": 20,
    "signals": 20,
    "uaeContext": 25,
    "recency": 10
  }', 'Q-Score component weights for real estate vertical')
ON CONFLICT (vertical, sub_vertical, config_type) DO NOTHING;

-- Seed Q-Score grade thresholds (from companyPreview.js:503-505)
INSERT INTO scoring_config (vertical, config_type, config, description) VALUES
  ('banking', 'qscore_grades', '{
    "A": {"min": 80, "max": 100},
    "B": {"min": 60, "max": 79},
    "C": {"min": 40, "max": 59},
    "D": {"min": 0, "max": 39}
  }', 'Q-Score grade thresholds for banking'),

  ('_default', 'qscore_grades', '{
    "A": {"min": 80, "max": 100},
    "B": {"min": 60, "max": 79},
    "C": {"min": 40, "max": 59},
    "D": {"min": 0, "max": 39}
  }', 'Default Q-Score grade thresholds')
ON CONFLICT (vertical, sub_vertical, config_type) DO NOTHING;

-- Seed Trust Score weights (from companyPreview.js:530-537)
INSERT INTO scoring_config (vertical, config_type, config, description) VALUES
  ('_default', 'trust_weights', '{
    "base": 0.5,
    "knowledge_graph": 0.2,
    "organic_results_5plus": 0.1,
    "news_results": 0.1,
    "https_primary": 0.1
  }', 'Trust score calculation weights')
ON CONFLICT (vertical, sub_vertical, config_type) DO NOTHING;


-- ============================================================================
-- 3. PROMPT TEMPLATES
-- Replaces hardcoded prompts in various services
-- ============================================================================

CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,

  -- Scope
  vertical VARCHAR(50), -- NULL means global
  sub_vertical VARCHAR(50),
  task_type VARCHAR(50) NOT NULL, -- 'company_extraction', 'intelligence_summary', etc.

  -- Template content
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL, -- Supports {{variable}} placeholders

  -- Model hints
  preferred_model VARCHAR(100),
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,

  -- Output
  output_format VARCHAR(20) DEFAULT 'text', -- 'text', 'json', 'markdown'
  output_schema JSONB, -- JSON schema for structured output

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- A/B testing support
  traffic_percentage INTEGER DEFAULT 100, -- 0-100
  experiment_id VARCHAR(100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',

  -- Performance tracking
  usage_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,
  success_rate DECIMAL(5,2)
);

-- Indexes
CREATE INDEX idx_prompt_templates_lookup
  ON prompt_templates(task_type, vertical, is_active);
CREATE INDEX idx_prompt_templates_slug
  ON prompt_templates(slug);


-- ============================================================================
-- 4. CAMPAIGN SCORING WEIGHTS
-- Replaces hardcoded values in campaignIntelligence.js:109-183
-- ============================================================================

CREATE TABLE campaign_scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50),

  -- Scoring weights
  config JSONB NOT NULL DEFAULT '{
    "industry_match": {
      "exact": 30,
      "partial": 15
    },
    "job_title_match": 25,
    "company_size_match": {
      "exact": 20,
      "overlap": 10
    },
    "lifecycle_stage_match": 25,
    "brief_keywords": {
      "max": 10,
      "per_category": 5
    },
    "performance_bonus": {
      "max": 5
    }
  }',

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical, sub_vertical)
);

-- Seed default campaign scoring
INSERT INTO campaign_scoring_config (vertical, config) VALUES
  ('_default', '{
    "industry_match": {"exact": 30, "partial": 15},
    "job_title_match": 25,
    "company_size_match": {"exact": 20, "overlap": 10},
    "lifecycle_stage_match": 25,
    "brief_keywords": {"max": 10, "per_category": 5},
    "performance_bonus": {"max": 5}
  }'),
  ('banking', '{
    "industry_match": {"exact": 35, "partial": 20},
    "job_title_match": 25,
    "company_size_match": {"exact": 20, "overlap": 10},
    "lifecycle_stage_match": 20,
    "brief_keywords": {"max": 10, "per_category": 5},
    "performance_bonus": {"max": 5}
  }')
ON CONFLICT (vertical, sub_vertical) DO NOTHING;


-- ============================================================================
-- 5. LIFECYCLE STAGE KEYWORDS
-- Replaces hardcoded stageKeywords in campaignIntelligence.js:216-232
-- ============================================================================

CREATE TABLE lifecycle_stage_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical VARCHAR(50) NOT NULL,
  stage VARCHAR(50) NOT NULL,

  -- Keywords array
  keywords TEXT[] NOT NULL,

  -- Metadata
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical, stage)
);

-- Seed default lifecycle keywords
INSERT INTO lifecycle_stage_keywords (vertical, stage, keywords) VALUES
  ('_default', 'onboarding', ARRAY['new joiners', 'new hires', 'onboarding', 'welcome', 'orientation']),
  ('_default', 'growth', ARRAY['growth', 'scaling', 'expansion', 'growing team', 'hiring']),
  ('_default', 'retention', ARRAY['retention', 'engagement', 'satisfaction', 'loyalty']),
  ('_default', 'payroll', ARRAY['payroll', 'salary', 'compensation', 'benefits', 'wps']),
  ('_default', 'expansion', ARRAY['expansion', 'new office', 'new market', 'international']),
  ('_default', 'startup', ARRAY['startup', 'early stage', 'seed', 'founded']),
  ('_default', 'mature', ARRAY['established', 'mature', 'enterprise', 'large scale'])
ON CONFLICT (vertical, stage) DO NOTHING;


-- ============================================================================
-- 6. COMPANY SIZE BANDS
-- Replaces hardcoded thresholds in campaignIntelligence.js:246-250
-- ============================================================================

CREATE TABLE company_size_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  vertical VARCHAR(50) NOT NULL,

  -- Band definition
  band_name VARCHAR(50) NOT NULL, -- 'startup', 'growth', 'scaling', 'mature'
  min_employees INTEGER NOT NULL,
  max_employees INTEGER NOT NULL,

  -- Metadata
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical, band_name)
);

-- Seed default size bands
INSERT INTO company_size_bands (vertical, band_name, min_employees, max_employees) VALUES
  ('_default', 'startup', 1, 49),
  ('_default', 'growth', 50, 199),
  ('_default', 'scaling', 200, 999),
  ('_default', 'mature', 1000, 1000000),

  -- Banking specific (larger thresholds)
  ('banking', 'startup', 1, 99),
  ('banking', 'growth', 100, 499),
  ('banking', 'scaling', 500, 1999),
  ('banking', 'mature', 2000, 1000000)
ON CONFLICT (vertical, band_name) DO NOTHING;


-- ============================================================================
-- 7. PROVIDER HEALTH THRESHOLDS
-- Replaces hardcoded values in providerRegistry.js:458-459
-- ============================================================================

CREATE TABLE provider_health_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  threshold_type VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'unhealthy'
  min_success_rate DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000

  description TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(threshold_type)
);

-- Seed health thresholds
INSERT INTO provider_health_thresholds (threshold_type, min_success_rate, description) VALUES
  ('healthy', 0.99, 'Provider is healthy if success rate >= 99%'),
  ('degraded', 0.90, 'Provider is degraded if success rate >= 90% but < 99%'),
  ('unhealthy', 0.00, 'Provider is unhealthy if success rate < 90%')
ON CONFLICT (threshold_type) DO NOTHING;


-- ============================================================================
-- 8. EMAIL PATTERN CONFIG
-- Replaces hardcoded patterns in emailEnhancedOptimized.js
-- ============================================================================

CREATE TABLE email_pattern_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern definition
  pattern VARCHAR(100) NOT NULL, -- e.g., '{first}.{last}'
  pattern_name VARCHAR(100) NOT NULL,

  -- Regional weights (0-100)
  global_weight INTEGER DEFAULT 50,
  region_weights JSONB DEFAULT '{}', -- {"UAE": 80, "US": 60}

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pattern)
);

-- Seed email patterns (from emailEnhancedOptimized.js:15-23)
INSERT INTO email_pattern_config (pattern, pattern_name, global_weight, region_weights, priority) VALUES
  ('{first}.{last}', 'Standard Dot Format', 35, '{"UAE": 40, "US": 50, "UK": 45}', 10),
  ('{first}{l}', 'First + Last Initial', 20, '{"UAE": 30, "MENA": 25}', 20),
  ('{f}{last}', 'First Initial + Last', 20, '{"US": 25, "UK": 20}', 30),
  ('{first}', 'First Name Only', 10, '{"startup": 15}', 40),
  ('{first}_{last}', 'Underscore Format', 8, '{}', 50),
  ('{last}.{first}', 'Last First Format', 5, '{"JP": 30, "CN": 25}', 60),
  ('{first}{last}', 'Concatenated', 2, '{}', 70)
ON CONFLICT (pattern) DO NOTHING;


-- ============================================================================
-- 9. CONFIDENCE THRESHOLDS
-- General-purpose threshold configuration
-- ============================================================================

CREATE TABLE confidence_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  context VARCHAR(100) NOT NULL, -- 'email_validation', 'signal_detection', etc.
  threshold_name VARCHAR(100) NOT NULL, -- 'high', 'medium', 'low'

  -- Value
  threshold_value DECIMAL(5,2) NOT NULL,

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(context, threshold_name)
);

-- Seed confidence thresholds
INSERT INTO confidence_thresholds (context, threshold_name, threshold_value, description) VALUES
  ('email_validation', 'high', 80, 'High confidence email threshold'),
  ('email_validation', 'hunter', 70, 'Hunter API confidence threshold'),
  ('signal_detection', 'high', 0.80, 'High confidence signal detection'),
  ('signal_detection', 'medium', 0.60, 'Medium confidence signal detection'),
  ('signal_detection', 'low', 0.40, 'Low confidence signal detection')
ON CONFLICT (context, threshold_name) DO NOTHING;


-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Function to get vertical model preferences
CREATE OR REPLACE FUNCTION get_vertical_model_preferences(
  p_vertical VARCHAR,
  p_task_type VARCHAR,
  p_sub_vertical VARCHAR DEFAULT NULL
)
RETURNS VARCHAR[] AS $$
DECLARE
  v_preferences VARCHAR[];
BEGIN
  -- Try exact match first (with sub_vertical)
  IF p_sub_vertical IS NOT NULL THEN
    SELECT model_preferences INTO v_preferences
    FROM llm_vertical_model_preferences
    WHERE vertical = p_vertical
      AND sub_vertical = p_sub_vertical
      AND task_type = p_task_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_preferences IS NOT NULL THEN
      RETURN v_preferences;
    END IF;
  END IF;

  -- Try vertical-level (no sub_vertical)
  SELECT model_preferences INTO v_preferences
  FROM llm_vertical_model_preferences
  WHERE vertical = p_vertical
    AND sub_vertical IS NULL
    AND task_type = p_task_type
    AND is_active = true
  ORDER BY priority
  LIMIT 1;

  RETURN v_preferences;
END;
$$ LANGUAGE plpgsql;


-- Function to get scoring config
CREATE OR REPLACE FUNCTION get_scoring_config(
  p_vertical VARCHAR,
  p_config_type VARCHAR,
  p_sub_vertical VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
BEGIN
  -- Try exact match first
  IF p_sub_vertical IS NOT NULL THEN
    SELECT config INTO v_config
    FROM scoring_config
    WHERE vertical = p_vertical
      AND sub_vertical = p_sub_vertical
      AND config_type = p_config_type
      AND is_active = true
    LIMIT 1;

    IF v_config IS NOT NULL THEN
      RETURN v_config;
    END IF;
  END IF;

  -- Try vertical-level
  SELECT config INTO v_config
  FROM scoring_config
  WHERE vertical = p_vertical
    AND sub_vertical IS NULL
    AND config_type = p_config_type
    AND is_active = true
  LIMIT 1;

  IF v_config IS NOT NULL THEN
    RETURN v_config;
  END IF;

  -- Fall back to default
  SELECT config INTO v_config
  FROM scoring_config
  WHERE vertical = '_default'
    AND config_type = p_config_type
    AND is_active = true
  LIMIT 1;

  RETURN v_config;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 11. PROMPT TEMPLATE SEEDS
-- Migrating hardcoded prompts to database
-- ============================================================================

-- Company Data Extraction (from companyPreview.js:491)
INSERT INTO prompt_templates (
  slug, name, task_type, system_prompt, user_prompt_template,
  preferred_model, temperature, output_format, is_default
) VALUES (
  'company-extraction-serp',
  'Company Data Extraction from SERP',
  'company_extraction',
  'You are a data extraction system. Extract structured company information from search results with 100% accuracy. Return ONLY valid JSON with no additional text or formatting.',
  E'Extract company information from these search results for: {{company_name}}

Search Results:
{{serp_results}}

Return JSON with these fields:
- name: Official company name
- domain: Primary website domain (without www or protocol)
- website_url: Full website URL
- industry: Primary industry
- sector: Business sector
- employee_range: Approximate employee count range (e.g., "51-200")
- employee_count: Specific employee count if found
- hq_location: Headquarters location
- description: Brief company description

Ensure ALL URLs are complete and valid. Do NOT include LinkedIn-related content in description.',
  'gpt-4o-mini',
  0.1,
  'json',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Intelligence Summary (from intelligenceSummarizer.js:117)
INSERT INTO prompt_templates (
  slug, name, task_type, user_prompt_template,
  preferred_model, temperature, max_tokens, output_format, is_default
) VALUES (
  'intelligence-summary',
  'Company Intelligence Summary',
  'intelligence_summary',
  E'You are an expert business intelligence analyst. Analyze this company intelligence and create a comprehensive summary.

COMPANY: {{company_name}}
Industry: {{industry}}
Size: {{size}}
Location: {{location}}

RECENT INTELLIGENCE (Last 90 days):

News & Updates:
{{news_items}}

Other Knowledge:
{{other_knowledge}}

Signals:
{{signals}}

Key People:
{{key_people}}

Create a structured summary with these sections:

1. COMPANY OVERVIEW (2-3 sentences)
2. RECENT DEVELOPMENTS (3-5 bullet points of key events)
3. HIRING & GROWTH SIGNALS (what their hiring patterns indicate)
4. FINANCIAL HEALTH (if any funding/financial signals present)
5. MARKET POSITIONING (their competitive stance)
6. TECHNOLOGY STACK (technologies mentioned, if any)

Be specific, cite dates when available, and focus on actionable intelligence for B2B sales.
If information is limited, acknowledge gaps and provide what''s available.',
  'claude-3-5-sonnet-20241022',
  0.7,
  3000,
  'markdown',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Insight Extraction (from intelligenceSummarizer.js:177)
INSERT INTO prompt_templates (
  slug, name, task_type, user_prompt_template, output_schema,
  preferred_model, temperature, max_tokens, output_format, is_default
) VALUES (
  'insight-extraction',
  'Extract Key Insights from Summary',
  'insight_extraction',
  E'From this company intelligence summary, extract 5 key insights that would be valuable for B2B outreach.

Summary:
{{summary}}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "insights": [
    {
      "type": "growth",
      "insight": "The insight statement",
      "relevance": "Why this matters for sales/outreach",
      "confidence": 0.8
    }
  ]
}

Valid types: "growth", "hiring", "funding", "technology", "market"
Confidence should be between 0.0 and 1.0',
  '{
    "type": "object",
    "properties": {
      "insights": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": {"type": "string", "enum": ["growth", "hiring", "funding", "technology", "market"]},
            "insight": {"type": "string"},
            "relevance": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1}
          }
        }
      }
    }
  }'::jsonb,
  'claude-3-5-sonnet-20241022',
  0.7,
  2000,
  'json',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Learning Agent Insight (from learningAgent.js:23)
INSERT INTO prompt_templates (
  slug, name, task_type, system_prompt, user_prompt_template, output_schema,
  preferred_model, temperature, output_format, is_default
) VALUES (
  'email-pattern-insight',
  'Successful Email Pattern Analyzer',
  'learning_insight',
  'You are an expert sales communication analyst. You will be given a set of successful emails that received replies. Your task is to identify a common, non-obvious pattern or principle that contributes to their success. Avoid generic advice. Focus on a specific, actionable insight.',
  E'Analyze these successful emails and identify what makes them effective:

{{email_examples}}

Output a single minified JSON object with one key: "insight_summary".',
  '{"type": "object", "properties": {"insight_summary": {"type": "string"}}}'::jsonb,
  'gpt-4o-mini',
  0.7,
  'json',
  true
) ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- COMMIT
-- ============================================================================
COMMIT;
