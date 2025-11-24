-- Sprint 31: Voice Template System
-- Phase 6 - Prompt Engineering (Siva-Mode)
-- Created: 2025-01-18

-- =================================================================
-- Voice Templates Table
-- =================================================================
-- Stores voice template patterns for outreach message generation
-- Supports multiple template types, tones, and message variants

CREATE TABLE IF NOT EXISTS voice_templates (
  id SERIAL PRIMARY KEY,

  -- Template Classification
  template_type VARCHAR(50) NOT NULL,  -- introduction, value_prop, pain_point, cta
  category VARCHAR(50),                -- email, linkedin, followup_1, followup_2, followup_3
  tone VARCHAR(20),                    -- formal, professional, casual

  -- Template Content
  template_text TEXT NOT NULL,
  subject_template TEXT,               -- For email templates

  -- Variable Management
  variables JSONB,                     -- Array of required variables: ["company_name", "first_name", ...]
  optional_variables JSONB,            -- Array of optional variables

  -- Conditional Logic
  conditions JSONB,                    -- When to use this template
  -- Example: {"min_quality_score": 80, "company_size": ["enterprise", "midsize"], "contact_tier": ["STRATEGIC"]}

  -- Metadata
  priority INTEGER DEFAULT 0,          -- Higher priority templates selected first
  active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,       -- Track template usage
  success_rate DECIMAL(5,2),          -- Percentage of successful outcomes

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),

  -- Constraints
  CONSTRAINT valid_template_type CHECK (template_type IN ('introduction', 'value_prop', 'pain_point', 'cta', 'full_message')),
  CONSTRAINT valid_category CHECK (category IN ('email', 'linkedin', 'followup_1', 'followup_2', 'followup_3', 'general')),
  CONSTRAINT valid_tone CHECK (tone IN ('formal', 'professional', 'casual')),
  CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 100)
);

-- Indexes for efficient template selection
CREATE INDEX idx_voice_templates_type_tone ON voice_templates(template_type, tone) WHERE active = true;
CREATE INDEX idx_voice_templates_category ON voice_templates(category) WHERE active = true;
CREATE INDEX idx_voice_templates_priority ON voice_templates(priority DESC) WHERE active = true;
CREATE INDEX idx_voice_templates_conditions ON voice_templates USING GIN (conditions);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_voice_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_templates_update_timestamp
  BEFORE UPDATE ON voice_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_voice_template_timestamp();

-- =================================================================
-- Generated Messages Table
-- =================================================================
-- Stores all generated outreach messages with full context

CREATE TABLE IF NOT EXISTS generated_messages (
  id SERIAL PRIMARY KEY,

  -- Message Identification
  message_id VARCHAR(255) UNIQUE NOT NULL,  -- UUID for tracking
  message_type VARCHAR(50) NOT NULL,         -- email, linkedin, followup_1, etc.

  -- Target Information
  company_id VARCHAR(255),
  company_name VARCHAR(255),
  contact_id VARCHAR(255),
  contact_name VARCHAR(255),

  -- Generated Content
  subject TEXT,                              -- Email subject or LinkedIn headline
  body TEXT NOT NULL,                        -- Main message content

  -- Generation Metadata
  template_ids JSONB NOT NULL,              -- Array of template IDs used
  -- Example: [{"type": "introduction", "id": 123}, {"type": "value_prop", "id": 456}]

  variables_used JSONB NOT NULL,            -- All variables and their values
  tone VARCHAR(20) NOT NULL,

  -- Quality Metrics
  quality_score INTEGER,                     -- Generated message quality (0-100)
  personalization_score INTEGER,             -- Degree of personalization (0-100)
  variable_coverage INTEGER,                 -- Percentage of variables populated

  -- Context Used
  context_data JSONB,                        -- Company quality, contact tier, timing, products
  -- Example: {"quality_score": 85, "contact_tier": "STRATEGIC", "timing_score": 78}

  -- Status Tracking
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  opened BOOLEAN DEFAULT false,
  opened_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT false,
  clicked_at TIMESTAMPTZ,
  responded BOOLEAN DEFAULT false,
  responded_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),

  -- Constraints
  CONSTRAINT valid_message_type CHECK (message_type IN ('email', 'linkedin', 'followup_1', 'followup_2', 'followup_3')),
  CONSTRAINT valid_tone CHECK (tone IN ('formal', 'professional', 'casual')),
  CONSTRAINT valid_quality_score CHECK (quality_score >= 0 AND quality_score <= 100),
  CONSTRAINT valid_personalization_score CHECK (personalization_score >= 0 AND personalization_score <= 100),
  CONSTRAINT valid_variable_coverage CHECK (variable_coverage >= 0 AND variable_coverage <= 100)
);

-- Indexes for message retrieval and analytics
CREATE INDEX idx_generated_messages_company ON generated_messages(company_id);
CREATE INDEX idx_generated_messages_contact ON generated_messages(contact_id);
CREATE INDEX idx_generated_messages_type ON generated_messages(message_type);
CREATE INDEX idx_generated_messages_sent ON generated_messages(sent, sent_at);
CREATE INDEX idx_generated_messages_created ON generated_messages(created_at DESC);
CREATE INDEX idx_generated_messages_quality ON generated_messages(quality_score DESC);
CREATE INDEX idx_generated_messages_templates ON generated_messages USING GIN (template_ids);

-- =================================================================
-- Template Performance Tracking
-- =================================================================
-- Aggregates template performance metrics

CREATE TABLE IF NOT EXISTS template_performance (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES voice_templates(id) ON DELETE CASCADE,

  -- Performance Metrics
  total_uses INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_responded INTEGER DEFAULT 0,

  -- Calculated Rates
  open_rate DECIMAL(5,2),               -- (opened / sent) * 100
  click_rate DECIMAL(5,2),              -- (clicked / sent) * 100
  response_rate DECIMAL(5,2),           -- (responded / sent) * 100

  -- Average Scores
  avg_quality_score DECIMAL(5,2),
  avg_personalization_score DECIMAL(5,2),

  -- Tracking Period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Audit
  last_updated TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, period_start)
);

CREATE INDEX idx_template_performance_template ON template_performance(template_id);
CREATE INDEX idx_template_performance_period ON template_performance(period_start, period_end);
CREATE INDEX idx_template_performance_response_rate ON template_performance(response_rate DESC);

-- =================================================================
-- Initial Data: Placeholder Templates
-- =================================================================
-- These will be replaced with actual templates in Task 3

INSERT INTO voice_templates (template_type, category, tone, template_text, variables, priority, created_by) VALUES
  -- Placeholder for Task 3
  ('introduction', 'general', 'professional',
   'Dear {first_name},\n\nI hope this message finds you well.',
   '["first_name"]'::jsonb,
   10,
   'system');

-- =================================================================
-- Comments and Documentation
-- =================================================================

COMMENT ON TABLE voice_templates IS 'Sprint 31: Stores voice template patterns for AI-powered outreach message generation';
COMMENT ON TABLE generated_messages IS 'Sprint 31: Tracks all generated outreach messages with full context and performance metrics';
COMMENT ON TABLE template_performance IS 'Sprint 31: Aggregates template performance metrics for optimization';

COMMENT ON COLUMN voice_templates.template_type IS 'Type of template: introduction, value_prop, pain_point, cta, full_message';
COMMENT ON COLUMN voice_templates.category IS 'Message variant: email, linkedin, followup_1, followup_2, followup_3';
COMMENT ON COLUMN voice_templates.tone IS 'Communication tone: formal, professional, casual';
COMMENT ON COLUMN voice_templates.variables IS 'JSON array of required variable names like {company_name}, {first_name}';
COMMENT ON COLUMN voice_templates.conditions IS 'JSON conditions for when to use this template (quality score, company size, etc.)';

COMMENT ON COLUMN generated_messages.template_ids IS 'JSON array of template IDs used to generate this message';
COMMENT ON COLUMN generated_messages.variables_used IS 'JSON object of all variables and their actual values';
COMMENT ON COLUMN generated_messages.context_data IS 'JSON object with company quality, contact tier, timing scores, etc.';
COMMENT ON COLUMN generated_messages.quality_score IS 'Generated message quality score (0-100) based on coverage, relevance, personalization';

-- =================================================================
-- Version Info
-- =================================================================

-- Migration: 2025_01_18_voice_templates
-- Sprint: 31
-- Phase: 6 - Prompt Engineering (Siva-Mode)
-- Tasks: 2 (Voice Template Database)
