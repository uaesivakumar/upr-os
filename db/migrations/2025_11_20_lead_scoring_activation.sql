-- Sprint 44: Lead Scoring Activation
-- Production-ready tables for alerts, routing, A/B testing, and automation

-- =============================================================================
-- SCORE ALERTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS score_alerts CASCADE;

CREATE TABLE score_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  alert_type VARCHAR(50) NOT NULL, -- SCORE_INCREASE, SCORE_DECREASE, GRADE_CHANGE, DECAY_APPLIED
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_alerts_opp ON score_alerts(opportunity_id);
CREATE INDEX idx_score_alerts_type ON score_alerts(alert_type);
CREATE INDEX idx_score_alerts_severity ON score_alerts(severity);
CREATE INDEX idx_score_alerts_acknowledged ON score_alerts(acknowledged, created_at DESC);
CREATE INDEX idx_score_alerts_created ON score_alerts(created_at DESC);

-- =============================================================================
-- LEAD ASSIGNMENTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS lead_assignments CASCADE;

CREATE TABLE lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  assigned_to VARCHAR(100) NOT NULL,
  assignment_reason TEXT,
  priority_level VARCHAR(20) CHECK (priority_level IN ('URGENT', 'HIGH', 'STANDARD', 'LOW')),
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_lead_assignments_opp ON lead_assignments(opportunity_id);
CREATE INDEX idx_lead_assignments_rep ON lead_assignments(assigned_to, status);
CREATE INDEX idx_lead_assignments_priority ON lead_assignments(priority_level, status);
CREATE INDEX idx_lead_assignments_assigned_at ON lead_assignments(assigned_at DESC);

-- =============================================================================
-- A/B TESTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS ab_tests CASCADE;

CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name VARCHAR(200) NOT NULL,
  test_type VARCHAR(50) NOT NULL, -- SCORING_FORMULA, PRIORITY_WEIGHTS, GRADE_THRESHOLDS
  description TEXT,
  config_a JSONB NOT NULL, -- Control configuration
  config_b JSONB NOT NULL, -- Variant configuration
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  sample_size INTEGER DEFAULT 0,
  target_sample_size INTEGER,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  winner VARCHAR(1) CHECK (winner IN ('A', 'B', NULL)),
  confidence_level DECIMAL(5,4),
  results JSONB DEFAULT '{}',
  created_by VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON ab_tests(status);
CREATE INDEX idx_ab_tests_type ON ab_tests(test_type);
CREATE INDEX idx_ab_tests_created ON ab_tests(created_at DESC);

-- =============================================================================
-- A/B TEST ASSIGNMENTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS ab_test_assignments CASCADE;

CREATE TABLE ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL,
  variant VARCHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  score_calculated INTEGER,
  converted BOOLEAN,
  conversion_date TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_ab_assignments_test ON ab_test_assignments(test_id);
CREATE INDEX idx_ab_assignments_opp ON ab_test_assignments(opportunity_id);
CREATE INDEX idx_ab_assignments_variant ON ab_test_assignments(test_id, variant);
CREATE INDEX idx_ab_assignments_converted ON ab_test_assignments(test_id, converted);

-- =============================================================================
-- SCORE RECALCULATION QUEUE TABLE
-- =============================================================================
DROP TABLE IF EXISTS score_recalc_queue CASCADE;

CREATE TABLE score_recalc_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  trigger_reason VARCHAR(100) NOT NULL, -- touchpoint_added, lifecycle_change, manual, scheduled
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1=highest, 10=lowest
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_recalc_status ON score_recalc_queue(status, priority, created_at);
CREATE INDEX idx_score_recalc_opp ON score_recalc_queue(opportunity_id, status);
CREATE INDEX idx_score_recalc_scheduled ON score_recalc_queue(scheduled_at) WHERE status = 'PENDING';

-- =============================================================================
-- SCORING CONFIGURATION TABLE
-- =============================================================================
DROP TABLE IF EXISTS scoring_config CASCADE;

CREATE TABLE scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(100)
);

CREATE INDEX idx_scoring_config_active ON scoring_config(is_active);
CREATE INDEX idx_scoring_config_key ON scoring_config(config_key);

-- =============================================================================
-- Insert default scoring configuration
-- =============================================================================
INSERT INTO scoring_config (config_key, config_value, description) VALUES
('grade_thresholds', '{
  "A+": 8000,
  "A": 6000,
  "B+": 4000,
  "B": 2000,
  "C": 1000,
  "D": 0
}'::jsonb, 'Lead score grade thresholds'),

('priority_weights', '{
  "score": 0.5,
  "urgency": 0.2,
  "recency": 0.15,
  "stage": 0.1,
  "response": 0.05
}'::jsonb, 'Priority score calculation weights'),

('decay_config', '{
  "enabled": true,
  "min_days_inactive": 7,
  "decay_rate_multiplier": 0.0083,
  "max_decay_rate": 0.75,
  "auto_apply": true,
  "cron_schedule": "0 2 * * *"
}'::jsonb, 'Score decay configuration'),

('realtime_scoring', '{
  "enabled": true,
  "triggers": ["touchpoint_added", "lifecycle_change"],
  "debounce_seconds": 300,
  "batch_size": 50
}'::jsonb, 'Real-time score update configuration'),

('routing_rules', '{
  "enabled": true,
  "grade_to_tier": {
    "A+": "SENIOR",
    "A": "SENIOR",
    "B+": "MID_LEVEL",
    "B": "MID_LEVEL",
    "C": "JUNIOR",
    "D": "JUNIOR"
  },
  "max_leads_per_tier": {
    "SENIOR": 10,
    "MID_LEVEL": 25,
    "JUNIOR": 50
  }
}'::jsonb, 'Lead routing configuration'),

('alert_thresholds', '{
  "score_increase_percent": 20,
  "score_decrease_percent": 20,
  "grade_change": true,
  "high_decay_rate": 0.3
}'::jsonb, 'Score alert thresholds');

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Queue score recalculation
DROP FUNCTION IF EXISTS queue_score_recalc(UUID, VARCHAR, INTEGER);

CREATE OR REPLACE FUNCTION queue_score_recalc(
  opp_id UUID,
  reason VARCHAR DEFAULT 'manual',
  priority_level INTEGER DEFAULT 5
)
RETURNS UUID AS $$
DECLARE
  queue_id UUID;
BEGIN
  -- Check if already queued
  SELECT id INTO queue_id
  FROM score_recalc_queue
  WHERE opportunity_id = opp_id
    AND status IN ('PENDING', 'PROCESSING')
  LIMIT 1;

  IF queue_id IS NOT NULL THEN
    -- Already queued, return existing ID
    RETURN queue_id;
  END IF;

  -- Insert new queue entry
  INSERT INTO score_recalc_queue (
    opportunity_id,
    trigger_reason,
    priority,
    status
  ) VALUES (
    opp_id,
    reason,
    priority_level,
    'PENDING'
  ) RETURNING id INTO queue_id;

  RETURN queue_id;
END;
$$ LANGUAGE plpgsql;

-- Auto-queue on touchpoint insert
DROP FUNCTION IF EXISTS trigger_score_recalc_on_touchpoint() CASCADE;

CREATE OR REPLACE FUNCTION trigger_score_recalc_on_touchpoint()
RETURNS TRIGGER AS $$
DECLARE
  config JSONB;
  enabled BOOLEAN;
BEGIN
  -- Get real-time scoring config
  SELECT config_value INTO config
  FROM scoring_config
  WHERE config_key = 'realtime_scoring' AND is_active = TRUE;

  enabled := (config->>'enabled')::BOOLEAN;

  IF enabled AND 'touchpoint_added' = ANY(
    ARRAY(SELECT jsonb_array_elements_text(config->'triggers'))
  ) THEN
    -- Queue score recalculation
    PERFORM queue_score_recalc(NEW.opportunity_id, 'touchpoint_added', 3);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalc_on_touchpoint
  AFTER INSERT ON opportunity_touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION trigger_score_recalc_on_touchpoint();

-- Auto-queue on lifecycle change
DROP FUNCTION IF EXISTS trigger_score_recalc_on_lifecycle() CASCADE;

CREATE OR REPLACE FUNCTION trigger_score_recalc_on_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
  config JSONB;
  enabled BOOLEAN;
BEGIN
  -- Get real-time scoring config
  SELECT config_value INTO config
  FROM scoring_config
  WHERE config_key = 'realtime_scoring' AND is_active = TRUE;

  enabled := (config->>'enabled')::BOOLEAN;

  IF enabled AND 'lifecycle_change' = ANY(
    ARRAY(SELECT jsonb_array_elements_text(config->'triggers'))
  ) THEN
    -- Queue score recalculation
    PERFORM queue_score_recalc(NEW.opportunity_id, 'lifecycle_change', 3);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalc_on_lifecycle
  AFTER INSERT ON opportunity_lifecycle
  FOR EACH ROW
  EXECUTE FUNCTION trigger_score_recalc_on_lifecycle();

-- Update ab_tests updated_at trigger
DROP FUNCTION IF EXISTS update_ab_tests_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_ab_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ab_tests_updated_at
  BEFORE UPDATE ON ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_ab_tests_updated_at();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active alerts view
DROP VIEW IF EXISTS active_alerts_view CASCADE;

CREATE VIEW active_alerts_view AS
SELECT
  sa.*,
  ls.lead_score,
  ls.grade,
  ls.priority_score
FROM score_alerts sa
JOIN lead_scores ls ON sa.opportunity_id = ls.opportunity_id
WHERE sa.acknowledged = FALSE
ORDER BY
  CASE sa.severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
  END,
  sa.created_at DESC;

-- Active assignments view
DROP VIEW IF EXISTS active_assignments_view CASCADE;

CREATE VIEW active_assignments_view AS
SELECT
  la.*,
  ls.lead_score,
  ls.grade,
  ls.priority_score
FROM lead_assignments la
JOIN lead_scores ls ON la.opportunity_id = ls.opportunity_id
WHERE la.status = 'ACTIVE'
ORDER BY
  CASE la.priority_level
    WHEN 'URGENT' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'STANDARD' THEN 3
    WHEN 'LOW' THEN 4
  END,
  la.assigned_at DESC;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE score_alerts IS 'Automated alerts for significant score changes';
COMMENT ON TABLE lead_assignments IS 'Lead routing and assignment tracking';
COMMENT ON TABLE ab_tests IS 'A/B tests for scoring formula optimization';
COMMENT ON TABLE ab_test_assignments IS 'Assignment of leads to A/B test variants';
COMMENT ON TABLE score_recalc_queue IS 'Queue for real-time score recalculation';
COMMENT ON TABLE scoring_config IS 'Centralized scoring system configuration';

COMMENT ON FUNCTION queue_score_recalc IS 'Queue an opportunity for score recalculation';
COMMENT ON FUNCTION trigger_score_recalc_on_touchpoint IS 'Auto-queue score recalc when touchpoint added';
COMMENT ON FUNCTION trigger_score_recalc_on_lifecycle IS 'Auto-queue score recalc when lifecycle changes';

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('score_alerts', 'lead_assignments', 'ab_tests', 'ab_test_assignments', 'score_recalc_queue', 'scoring_config')
ORDER BY table_name;
