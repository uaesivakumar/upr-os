-- ============================================================================
-- Sprint 45: Outreach Generation Activation
-- Activate AI-powered personalized outreach in production
-- ============================================================================
-- Date: 2025-11-20
-- Description: Production activation with quality scoring, A/B testing,
--              feedback loops, performance tracking, and analytics

-- ============================================================================
-- TABLE 1: Outreach Quality Scores
-- Enhanced quality scoring beyond basic metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,

  -- Quality Dimensions (0-100)
  personalization_score INTEGER NOT NULL,
  relevance_score INTEGER NOT NULL,
  clarity_score INTEGER NOT NULL,
  engagement_potential INTEGER NOT NULL,
  tone_consistency INTEGER NOT NULL,

  -- Overall Quality
  overall_quality INTEGER NOT NULL,
  quality_tier VARCHAR(20) NOT NULL, -- EXCELLENT, GOOD, FAIR, POOR

  -- Detailed Metrics
  variable_coverage DECIMAL(5,2), -- Percentage of variables used
  context_richness INTEGER, -- How much context was applied
  template_match_score INTEGER, -- How well template matched context

  -- AI Analysis
  ai_suggestions JSONB, -- Improvement suggestions
  weak_points JSONB, -- Areas needing improvement
  strong_points JSONB, -- What works well

  -- Metadata
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scoring_version VARCHAR(20) DEFAULT 'v1.0',

  CONSTRAINT fk_message FOREIGN KEY (message_id) REFERENCES outreach_generations(id) ON DELETE CASCADE
);

CREATE INDEX idx_quality_message ON outreach_quality_scores(message_id);
CREATE INDEX idx_quality_tier ON outreach_quality_scores(quality_tier);
CREATE INDEX idx_quality_overall ON outreach_quality_scores(overall_quality DESC);

-- ============================================================================
-- TABLE 2: Outreach A/B Tests
-- A/B testing framework for outreach optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Test Configuration
  test_name VARCHAR(255) NOT NULL,
  description TEXT,
  test_type VARCHAR(50) NOT NULL, -- TEMPLATE, TONE, TIMING, SUBJECT, FULL_MESSAGE

  -- Test Status
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, RUNNING, PAUSED, COMPLETED

  -- Variants Configuration
  variant_a_config JSONB NOT NULL, -- Control configuration
  variant_b_config JSONB NOT NULL, -- Treatment configuration

  -- Traffic Split
  traffic_split DECIMAL(3,2) DEFAULT 0.50, -- 0.50 = 50/50 split

  -- Success Metrics
  primary_metric VARCHAR(50) NOT NULL, -- reply_rate, click_rate, conversion_rate
  secondary_metrics JSONB, -- Additional metrics to track

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  min_sample_size INTEGER DEFAULT 100,

  -- Results
  winner VARCHAR(1), -- A or B
  confidence_level DECIMAL(5,2), -- Statistical significance %
  results_summary JSONB,

  -- Metadata
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ab_test_status ON outreach_ab_tests(status);
CREATE INDEX idx_ab_test_type ON outreach_ab_tests(test_type);
CREATE INDEX idx_ab_test_dates ON outreach_ab_tests(started_at, ended_at);

-- ============================================================================
-- TABLE 3: Outreach A/B Test Assignments
-- Track which messages belong to which test variant
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  test_id UUID NOT NULL REFERENCES outreach_ab_tests(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES outreach_generations(id) ON DELETE CASCADE,

  -- Assignment
  variant VARCHAR(1) NOT NULL, -- A or B
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Performance
  sent BOOLEAN DEFAULT FALSE,
  opened BOOLEAN DEFAULT FALSE,
  clicked BOOLEAN DEFAULT FALSE,
  replied BOOLEAN DEFAULT FALSE,
  converted BOOLEAN DEFAULT FALSE,

  -- Engagement Metrics
  open_time TIMESTAMP WITH TIME ZONE,
  click_time TIMESTAMP WITH TIME ZONE,
  reply_time TIMESTAMP WITH TIME ZONE,
  conversion_time TIMESTAMP WITH TIME ZONE,

  -- Time to Action (minutes)
  time_to_open INTEGER,
  time_to_click INTEGER,
  time_to_reply INTEGER,
  time_to_conversion INTEGER,

  UNIQUE(test_id, message_id)
);

CREATE INDEX idx_ab_assignment_test ON outreach_ab_assignments(test_id);
CREATE INDEX idx_ab_assignment_variant ON outreach_ab_assignments(test_id, variant);
CREATE INDEX idx_ab_assignment_message ON outreach_ab_assignments(message_id);

-- ============================================================================
-- TABLE 4: Outreach Feedback
-- Capture feedback on generated outreach for continuous improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationship
  message_id UUID NOT NULL REFERENCES outreach_generations(id) ON DELETE CASCADE,

  -- Feedback Source
  feedback_type VARCHAR(50) NOT NULL, -- HUMAN, AUTO, RECIPIENT
  feedback_source VARCHAR(255), -- User ID, system, recipient email

  -- Ratings (1-5 scale)
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  personalization_rating INTEGER CHECK (personalization_rating BETWEEN 1 AND 5),
  relevance_rating INTEGER CHECK (relevance_rating BETWEEN 1 AND 5),
  tone_rating INTEGER CHECK (tone_rating BETWEEN 1 AND 5),

  -- Qualitative Feedback
  feedback_text TEXT,
  improvement_suggestions TEXT,

  -- Outcome
  was_sent BOOLEAN,
  recipient_responded BOOLEAN,
  positive_outcome BOOLEAN,

  -- Sentiment Analysis
  sentiment VARCHAR(20), -- POSITIVE, NEUTRAL, NEGATIVE
  sentiment_score DECIMAL(3,2), -- -1.00 to 1.00

  -- Actions Taken
  actions_taken JSONB, -- What was done with this feedback
  incorporated BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_feedback_message ON outreach_feedback(message_id);
CREATE INDEX idx_feedback_type ON outreach_feedback(feedback_type);
CREATE INDEX idx_feedback_rating ON outreach_feedback(overall_rating);
CREATE INDEX idx_feedback_unprocessed ON outreach_feedback(id) WHERE processed_at IS NULL;

-- ============================================================================
-- TABLE 5: Outreach Performance Metrics
-- Comprehensive performance tracking and monitoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time Bucket
  metric_date DATE NOT NULL,
  metric_hour INTEGER, -- 0-23 for hourly metrics, NULL for daily

  -- Aggregation Level
  aggregation_level VARCHAR(50) NOT NULL, -- SYSTEM, TEMPLATE, CAMPAIGN, INDUSTRY, COMPANY_SIZE
  aggregation_key VARCHAR(255), -- ID or category name

  -- Volume Metrics
  messages_generated INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_delivered INTEGER DEFAULT 0,
  messages_bounced INTEGER DEFAULT 0,

  -- Engagement Metrics
  messages_opened INTEGER DEFAULT 0,
  messages_clicked INTEGER DEFAULT 0,
  messages_replied INTEGER DEFAULT 0,
  messages_converted INTEGER DEFAULT 0,

  -- Rate Metrics (percentages)
  delivery_rate DECIMAL(5,2),
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  reply_rate DECIMAL(5,2),
  conversion_rate DECIMAL(5,2),

  -- Quality Metrics
  avg_quality_score DECIMAL(5,2),
  avg_personalization_score DECIMAL(5,2),
  avg_relevance_score DECIMAL(5,2),

  -- Response Time Metrics (minutes)
  avg_time_to_open INTEGER,
  avg_time_to_click INTEGER,
  avg_time_to_reply INTEGER,
  avg_time_to_conversion INTEGER,

  -- Feedback Metrics
  feedback_count INTEGER DEFAULT 0,
  avg_feedback_rating DECIMAL(3,2),
  positive_feedback_count INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,

  -- Metadata
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_perf_date ON outreach_performance_metrics(metric_date DESC);
CREATE INDEX idx_perf_level ON outreach_performance_metrics(aggregation_level, aggregation_key);
CREATE INDEX idx_perf_date_level ON outreach_performance_metrics(metric_date, aggregation_level);

-- Unique index with expression
CREATE UNIQUE INDEX idx_perf_unique ON outreach_performance_metrics(
  metric_date,
  COALESCE(metric_hour, -1),
  aggregation_level,
  COALESCE(aggregation_key, '')
);

-- ============================================================================
-- TABLE 6: Outreach Template Optimization
-- Track template optimization suggestions and implementations
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_template_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template Reference
  template_id UUID, -- NULL for general suggestions
  template_type VARCHAR(50), -- introduction, value_prop, cta, etc.

  -- Optimization Type
  optimization_type VARCHAR(50) NOT NULL, -- CONTENT, STRUCTURE, VARIABLES, TONE
  priority VARCHAR(20) DEFAULT 'MEDIUM', -- HIGH, MEDIUM, LOW

  -- Analysis
  current_performance JSONB, -- Current metrics
  performance_gap TEXT, -- What's underperforming

  -- Recommendation
  recommendation_title VARCHAR(255) NOT NULL,
  recommendation_details TEXT NOT NULL,
  expected_improvement VARCHAR(255), -- "Increase reply rate by 15%"

  -- Supporting Data
  evidence JSONB, -- Data supporting this recommendation
  examples JSONB, -- Example improvements

  -- Implementation
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, IMPLEMENTED, REJECTED
  implemented_at TIMESTAMP WITH TIME ZONE,
  implemented_by VARCHAR(255),

  -- Results
  actual_improvement JSONB, -- Measured results after implementation
  validated BOOLEAN,
  validation_notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(50) DEFAULT 'SYSTEM',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_template_opt_status ON outreach_template_optimizations(status);
CREATE INDEX idx_template_opt_priority ON outreach_template_optimizations(priority);
CREATE INDEX idx_template_opt_type ON outreach_template_optimizations(optimization_type);
CREATE INDEX idx_template_opt_template ON outreach_template_optimizations(template_id);

-- ============================================================================
-- TABLE 7: Outreach Analytics Summary
-- Pre-aggregated analytics for dashboard
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time Period
  period_type VARCHAR(20) NOT NULL, -- HOURLY, DAILY, WEEKLY, MONTHLY
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Segment
  segment_type VARCHAR(50), -- ALL, INDUSTRY, COMPANY_SIZE, TEMPLATE
  segment_value VARCHAR(255),

  -- Generation Stats
  total_generated INTEGER,
  total_sent INTEGER,
  avg_generation_time_ms INTEGER,

  -- Quality Stats
  avg_quality_score DECIMAL(5,2),
  excellent_count INTEGER,
  good_count INTEGER,
  fair_count INTEGER,
  poor_count INTEGER,

  -- Engagement Stats
  total_opens INTEGER,
  total_clicks INTEGER,
  total_replies INTEGER,
  total_conversions INTEGER,

  -- Rates
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  reply_rate DECIMAL(5,2),
  conversion_rate DECIMAL(5,2),

  -- Top Performers
  top_template JSONB,
  top_tone JSONB,
  top_industry JSONB,

  -- Trends
  trend_direction VARCHAR(20), -- IMPROVING, DECLINING, STABLE
  trend_percentage DECIMAL(5,2),

  -- Metadata
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_period ON outreach_analytics_summary(period_type, period_start DESC);
CREATE INDEX idx_analytics_segment ON outreach_analytics_summary(segment_type, segment_value);

-- Unique index with expression
CREATE UNIQUE INDEX idx_analytics_unique ON outreach_analytics_summary(
  period_type,
  period_start,
  segment_type,
  COALESCE(segment_value, '')
);

-- ============================================================================
-- CONFIGURATION TABLE
-- Runtime configuration for outreach system
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by VARCHAR(255)
);

-- Insert default configurations
INSERT INTO outreach_config (config_key, config_value, description) VALUES
('quality_thresholds', '{
  "excellent": 85,
  "good": 70,
  "fair": 50,
  "poor": 0
}', 'Quality score tier thresholds'),

('performance_targets', '{
  "open_rate": 25,
  "click_rate": 8,
  "reply_rate": 5,
  "conversion_rate": 2
}', 'Target performance metrics (percentages)'),

('ab_test_config', '{
  "min_sample_size": 100,
  "confidence_threshold": 95,
  "max_test_duration_days": 30,
  "auto_declare_winner": true
}', 'A/B testing configuration'),

('feedback_analysis', '{
  "auto_process": true,
  "sentiment_threshold": 0.5,
  "min_rating_for_action": 2,
  "feedback_review_interval_hours": 24
}', 'Feedback processing configuration'),

('optimization_schedule', '{
  "daily_analysis": true,
  "analysis_hour": 2,
  "min_messages_for_optimization": 50,
  "auto_implement_high_confidence": false
}', 'Template optimization schedule'),

('personalization_config', '{
  "ai_enrichment": true,
  "max_variables": 20,
  "tone_auto_detect": true,
  "context_depth": "deep"
}', 'Advanced personalization settings')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Recent Quality Metrics
CREATE OR REPLACE VIEW v_recent_quality_metrics AS
SELECT
  DATE(scored_at) as date,
  quality_tier,
  COUNT(*) as count,
  AVG(overall_quality) as avg_quality,
  AVG(personalization_score) as avg_personalization,
  AVG(relevance_score) as avg_relevance,
  AVG(engagement_potential) as avg_engagement
FROM outreach_quality_scores
WHERE scored_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(scored_at), quality_tier
ORDER BY date DESC, quality_tier;

-- View: Active A/B Tests Summary
CREATE OR REPLACE VIEW v_active_ab_tests AS
SELECT
  t.id,
  t.test_name,
  t.test_type,
  t.status,
  t.started_at,
  COUNT(a.id) as total_assignments,
  COUNT(a.id) FILTER (WHERE a.variant = 'A') as variant_a_count,
  COUNT(a.id) FILTER (WHERE a.variant = 'B') as variant_b_count,
  COUNT(a.id) FILTER (WHERE a.replied = TRUE) as total_replies,
  COUNT(a.id) FILTER (WHERE a.variant = 'A' AND a.replied = TRUE) as variant_a_replies,
  COUNT(a.id) FILTER (WHERE a.variant = 'B' AND a.replied = TRUE) as variant_b_replies
FROM outreach_ab_tests t
LEFT JOIN outreach_ab_assignments a ON t.id = a.test_id
WHERE t.status IN ('RUNNING', 'PAUSED')
GROUP BY t.id, t.test_name, t.test_type, t.status, t.started_at;

-- View: Performance Trends
CREATE OR REPLACE VIEW v_performance_trends AS
SELECT
  metric_date,
  aggregation_level,
  SUM(messages_generated) as total_generated,
  SUM(messages_sent) as total_sent,
  AVG(open_rate) as avg_open_rate,
  AVG(reply_rate) as avg_reply_rate,
  AVG(conversion_rate) as avg_conversion_rate,
  AVG(avg_quality_score) as avg_quality
FROM outreach_performance_metrics
WHERE metric_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY metric_date, aggregation_level
ORDER BY metric_date DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Calculate quality tier
CREATE OR REPLACE FUNCTION calculate_quality_tier(score INTEGER)
RETURNS VARCHAR AS $$
BEGIN
  IF score >= 85 THEN RETURN 'EXCELLENT';
  ELSIF score >= 70 THEN RETURN 'GOOD';
  ELSIF score >= 50 THEN RETURN 'FAIR';
  ELSE RETURN 'POOR';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Update performance metrics
CREATE OR REPLACE FUNCTION update_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- This would be called by a scheduled job
  -- Placeholder for metric aggregation logic
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update quality tier
CREATE OR REPLACE FUNCTION set_quality_tier()
RETURNS TRIGGER AS $$
BEGIN
  NEW.quality_tier := calculate_quality_tier(NEW.overall_quality);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_quality_tier
  BEFORE INSERT OR UPDATE OF overall_quality ON outreach_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION set_quality_tier();

-- Trigger: Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ab_test_updated
  BEFORE UPDATE ON outreach_ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_template_opt_updated
  BEFORE UPDATE ON outreach_template_optimizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO upr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO upr_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO upr_app;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Sprint 45 Outreach Generation Activation schema created successfully';
  RAISE NOTICE 'Tables: 7';
  RAISE NOTICE 'Views: 3';
  RAISE NOTICE 'Functions: 3';
  RAISE NOTICE 'Triggers: 3';
END $$;
