-- Sprint 36: Scoring Analytics & Optimization
-- Database schema for alerts, routing, ML predictions, and conversion tracking

-- =============================================================================
-- SCORE ALERT RULES
-- =============================================================================
DROP TABLE IF EXISTS score_alert_rules CASCADE;

CREATE TABLE score_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message_template TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_enabled ON score_alert_rules(enabled);

-- =============================================================================
-- SCORE ALERTS LOG
-- =============================================================================
DROP TABLE IF EXISTS score_alerts CASCADE;

CREATE TABLE score_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  rule_id UUID REFERENCES score_alert_rules(id),
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20),
  message TEXT,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alerts_opp ON score_alerts(opportunity_id);
CREATE INDEX idx_alerts_acknowledged ON score_alerts(acknowledged, created_at DESC);
CREATE INDEX idx_alerts_severity ON score_alerts(severity, created_at DESC);

-- =============================================================================
-- LEAD ASSIGNMENTS (Routing)
-- =============================================================================
DROP TABLE IF EXISTS lead_assignments CASCADE;

CREATE TABLE lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  assigned_to UUID NOT NULL,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assignment_reason TEXT,
  priority_level VARCHAR(20),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_assignments_opp ON lead_assignments(opportunity_id);
CREATE INDEX idx_assignments_rep ON lead_assignments(assigned_to, status);
CREATE INDEX idx_assignments_status ON lead_assignments(status, assigned_at DESC);

-- =============================================================================
-- ML PREDICTIONS
-- =============================================================================
DROP TABLE IF EXISTS ml_predictions CASCADE;

CREATE TABLE ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  model_version VARCHAR(50),
  conversion_probability DECIMAL(5,4) CHECK (conversion_probability BETWEEN 0 AND 1),
  predicted_score INTEGER CHECK (predicted_score BETWEEN 0 AND 10000),
  features JSONB,
  confidence DECIMAL(5,4),
  predicted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_predictions_opp ON ml_predictions(opportunity_id);
CREATE INDEX idx_ml_predictions_model ON ml_predictions(model_version, predicted_at DESC);

-- =============================================================================
-- CONVERSION OUTCOMES (for training and validation)
-- =============================================================================
DROP TABLE IF EXISTS conversion_outcomes CASCADE;

CREATE TABLE conversion_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  converted BOOLEAN NOT NULL,
  conversion_date TIMESTAMP,
  days_to_close INTEGER,
  deal_value DECIMAL(12,2),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversion_opp ON conversion_outcomes(opportunity_id);
CREATE INDEX idx_conversion_outcome ON conversion_outcomes(converted, recorded_at DESC);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Alert summary view
DROP VIEW IF EXISTS alert_summary_view CASCADE;

CREATE VIEW alert_summary_view AS
SELECT
  DATE_TRUNC('day', created_at) as alert_date,
  severity,
  alert_type,
  COUNT(*) as alert_count,
  COUNT(*) FILTER (WHERE acknowledged = true) as acknowledged_count,
  COUNT(*) FILTER (WHERE acknowledged = false) as pending_count
FROM score_alerts
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY alert_date, severity, alert_type
ORDER BY alert_date DESC, severity;

-- Assignment statistics view
DROP VIEW IF EXISTS assignment_stats_view CASCADE;

CREATE VIEW assignment_stats_view AS
SELECT
  assigned_to,
  COUNT(*) as total_assignments,
  COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_assignments,
  COUNT(*) FILTER (WHERE priority_level = 'URGENT') as urgent_assignments,
  MIN(assigned_at) as first_assignment,
  MAX(assigned_at) as last_assignment
FROM lead_assignments
GROUP BY assigned_to;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Calculate assignment capacity
DROP FUNCTION IF EXISTS check_rep_capacity(UUID, INTEGER);

CREATE OR REPLACE FUNCTION check_rep_capacity(rep_id UUID, max_leads INTEGER DEFAULT 25)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM lead_assignments
  WHERE assigned_to = rep_id
    AND status = 'ACTIVE';

  RETURN current_count < max_leads;
END;
$$ LANGUAGE plpgsql;

-- Update alert rules updated_at
DROP FUNCTION IF EXISTS update_alert_rules_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_alert_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON score_alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_rules_updated_at();

-- =============================================================================
-- SEED DATA: Default alert rules
-- =============================================================================
INSERT INTO score_alert_rules (name, condition, severity, message_template, enabled) VALUES
  ('Hot Lead Not Contacted', 'grade IN (''A+'', ''A'') AND days_in_state > 3', 'HIGH',
   'Hot lead {opportunity_id} not contacted in 3+ days', true),
  ('High Decay Alert', 'decay_rate > 0.5', 'MEDIUM',
   'Lead {opportunity_id} experiencing high decay (50%+)', true),
  ('Major Score Drop', 'score_change < -1000', 'HIGH',
   'Lead {opportunity_id} score dropped by 1000+ points', true),
  ('Major Score Increase', 'score_change > 1500', 'MEDIUM',
   'Lead {opportunity_id} score increased by 1500+ points', true);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE score_alert_rules IS 'Rules for generating automated score alerts';
COMMENT ON TABLE score_alerts IS 'Log of all generated score alerts';
COMMENT ON TABLE lead_assignments IS 'Lead routing and assignment tracking';
COMMENT ON TABLE ml_predictions IS 'Machine learning model predictions for conversion probability';
COMMENT ON TABLE conversion_outcomes IS 'Historical conversion outcomes for model training and validation';

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('score_alert_rules', 'score_alerts', 'lead_assignments',
                     'ml_predictions', 'conversion_outcomes')
ORDER BY table_name;
