-- Sprint 33: Opportunity Lifecycle State Machine
-- Database schema for tracking opportunity states through their journey

-- Main lifecycle tracking table
CREATE TABLE IF NOT EXISTS opportunity_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL, -- References opportunities table

  -- State information
  state VARCHAR(50) NOT NULL CHECK (state IN (
    'DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED',
    'NEGOTIATING', 'DORMANT', 'CLOSED'
  )),
  sub_state VARCHAR(50) CHECK (sub_state IN (
    'WON', 'LOST', 'DISQUALIFIED', NULL
  )),

  -- Timing
  entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMP,
  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN exited_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (exited_at - entered_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  -- Transition metadata
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('auto', 'manual', 'event')),
  trigger_reason TEXT,
  triggered_by UUID, -- User ID if manual trigger

  -- State relationships
  previous_state VARCHAR(50),
  next_state VARCHAR(50),

  -- Flexible metadata storage
  metadata JSONB DEFAULT '{}',

  -- Audit timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for finding current state of an opportunity (most common query)
CREATE INDEX idx_lifecycle_current_state
ON opportunity_lifecycle(opportunity_id, entered_at DESC)
WHERE exited_at IS NULL;

-- Index for auto-transition scheduler checks
CREATE INDEX idx_lifecycle_auto_transitions
ON opportunity_lifecycle(state, entered_at)
WHERE exited_at IS NULL AND trigger_type = 'auto';

-- Index for analytics and reporting
CREATE INDEX idx_lifecycle_state_transitions
ON opportunity_lifecycle(state, entered_at, exited_at);

-- Index for triggered_by (user activity tracking)
CREATE INDEX idx_lifecycle_triggered_by
ON opportunity_lifecycle(triggered_by, created_at)
WHERE triggered_by IS NOT NULL;

-- View for current state of all opportunities
CREATE OR REPLACE VIEW opportunity_current_state AS
SELECT
  ol.opportunity_id,
  ol.state,
  ol.sub_state,
  ol.entered_at,
  EXTRACT(EPOCH FROM (NOW() - ol.entered_at))::INTEGER as seconds_in_state,
  ol.trigger_type,
  ol.trigger_reason,
  ol.previous_state,
  ol.metadata,
  ol.triggered_by
FROM opportunity_lifecycle ol
WHERE ol.exited_at IS NULL;

-- View for lifecycle analytics
CREATE OR REPLACE VIEW lifecycle_analytics AS
SELECT
  state,
  COUNT(*) as opportunity_count,
  AVG(duration_seconds) as avg_duration_seconds,
  MIN(duration_seconds) as min_duration_seconds,
  MAX(duration_seconds) as max_duration_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) as median_duration_seconds
FROM opportunity_lifecycle
WHERE exited_at IS NOT NULL
GROUP BY state;

-- Function to get complete lifecycle history for an opportunity
CREATE OR REPLACE FUNCTION get_lifecycle_history(opp_id UUID)
RETURNS TABLE (
  state VARCHAR(50),
  sub_state VARCHAR(50),
  entered_at TIMESTAMP,
  exited_at TIMESTAMP,
  duration_seconds INTEGER,
  trigger_type VARCHAR(20),
  trigger_reason TEXT,
  previous_state VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ol.state,
    ol.sub_state,
    ol.entered_at,
    ol.exited_at,
    ol.duration_seconds,
    ol.trigger_type,
    ol.trigger_reason,
    ol.previous_state
  FROM opportunity_lifecycle ol
  WHERE ol.opportunity_id = opp_id
  ORDER BY ol.entered_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get current state for an opportunity
CREATE OR REPLACE FUNCTION get_current_state(opp_id UUID)
RETURNS TABLE (
  state VARCHAR(50),
  sub_state VARCHAR(50),
  entered_at TIMESTAMP,
  seconds_in_state INTEGER,
  trigger_type VARCHAR(20),
  previous_state VARCHAR(50),
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ol.state,
    ol.sub_state,
    ol.entered_at,
    EXTRACT(EPOCH FROM (NOW() - ol.entered_at))::INTEGER as seconds_in_state,
    ol.trigger_type,
    ol.previous_state,
    ol.metadata
  FROM opportunity_lifecycle ol
  WHERE ol.opportunity_id = opp_id AND ol.exited_at IS NULL
  ORDER BY ol.entered_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lifecycle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to opportunity_lifecycle table
CREATE TRIGGER opportunity_lifecycle_updated_at
  BEFORE UPDATE ON opportunity_lifecycle
  FOR EACH ROW
  EXECUTE FUNCTION update_lifecycle_updated_at();

-- Table for storing auto-transition rules (configuration)
CREATE TABLE IF NOT EXISTS lifecycle_transition_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL DEFAULT 'auto',

  -- Condition configuration
  condition_type VARCHAR(50) NOT NULL CHECK (condition_type IN (
    'time_based', 'event_based', 'score_based', 'activity_based'
  )),
  condition_config JSONB NOT NULL, -- e.g., {"hours": 2} or {"days": 30}

  -- Execution settings
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0, -- Higher priority rules checked first

  -- Metadata
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for rule lookups
CREATE INDEX idx_transition_rules_active
ON lifecycle_transition_rules(from_state, is_active)
WHERE is_active = TRUE;

-- Seed default transition rules
INSERT INTO lifecycle_transition_rules (rule_name, from_state, to_state, trigger_type, condition_type, condition_config, description, priority) VALUES
  ('qualified_to_outreach', 'QUALIFIED', 'OUTREACH', 'auto', 'time_based', '{"hours": 2}', 'Auto-transition to outreach 2 hours after qualification', 10),
  ('engaged_to_dormant', 'ENGAGED', 'DORMANT', 'auto', 'activity_based', '{"days_inactive": 30}', 'Mark as dormant after 30 days of no activity', 5),
  ('negotiating_to_dormant', 'NEGOTIATING', 'DORMANT', 'auto', 'activity_based', '{"days_inactive": 14}', 'Mark as dormant after 14 days of no negotiation activity', 5),
  ('dormant_reengagement', 'DORMANT', 'OUTREACH', 'auto', 'time_based', '{"days": 60}', 'Re-engage dormant opportunities after 60 days', 3),
  ('outreach_to_dormant', 'OUTREACH', 'DORMANT', 'auto', 'event_based', '{"max_attempts": 5, "no_response": true}', 'Mark as dormant after max outreach attempts with no response', 8)
ON CONFLICT (rule_name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE opportunity_lifecycle IS 'Tracks complete lifecycle journey of opportunities through various states';
COMMENT ON TABLE lifecycle_transition_rules IS 'Configuration for automatic state transition rules';
COMMENT ON COLUMN opportunity_lifecycle.state IS 'Current lifecycle state: DISCOVERED, QUALIFIED, OUTREACH, ENGAGED, NEGOTIATING, DORMANT, CLOSED';
COMMENT ON COLUMN opportunity_lifecycle.sub_state IS 'For CLOSED state: WON, LOST, or DISQUALIFIED';
COMMENT ON COLUMN opportunity_lifecycle.trigger_type IS 'How transition was triggered: auto (automated), manual (user), event (system event)';
COMMENT ON COLUMN opportunity_lifecycle.metadata IS 'Flexible JSON storage for state-specific data';
