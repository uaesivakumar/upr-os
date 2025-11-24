-- Sprint 34: Lifecycle Analytics & Automation
-- Database schema for scoring, re-engagement, actions, and journey tracking

-- =============================================================================
-- LIFECYCLE SCORES TABLE
-- =============================================================================
DROP TABLE IF EXISTS lifecycle_scores CASCADE;

CREATE TABLE lifecycle_scores (
  opportunity_id UUID PRIMARY KEY,
  engagement_score INTEGER CHECK (engagement_score BETWEEN 0 AND 100),
  velocity_score INTEGER CHECK (velocity_score BETWEEN 0 AND 100),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  composite_score INTEGER CHECK (composite_score BETWEEN 0 AND 100),
  win_probability DECIMAL(5,2) CHECK (win_probability BETWEEN 0 AND 100),
  estimated_close_date DATE,
  churn_risk VARCHAR(20) CHECK (churn_risk IN ('low', 'medium', 'high')),
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lifecycle_scores_composite ON lifecycle_scores(composite_score DESC);
CREATE INDEX idx_lifecycle_scores_win_prob ON lifecycle_scores(win_probability DESC);
CREATE INDEX idx_lifecycle_scores_churn_risk ON lifecycle_scores(churn_risk);
CREATE INDEX idx_lifecycle_scores_calculated_at ON lifecycle_scores(calculated_at);

-- =============================================================================
-- RE-ENGAGEMENT ATTEMPTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS re_engagement_attempts CASCADE;

CREATE TABLE re_engagement_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  template_used VARCHAR(100),
  channel VARCHAR(50), -- 'email', 'linkedin', 'phone'
  response_received BOOLEAN DEFAULT FALSE,
  response_at TIMESTAMP,
  outcome VARCHAR(50), -- 'responded', 'no_response', 'opted_out', 'converted'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_re_engagement_opp ON re_engagement_attempts(opportunity_id);
CREATE INDEX idx_re_engagement_attempted_at ON re_engagement_attempts(attempted_at DESC);
CREATE INDEX idx_re_engagement_outcome ON re_engagement_attempts(outcome);

-- =============================================================================
-- LIFECYCLE ACTION TEMPLATES TABLE
-- =============================================================================
DROP TABLE IF EXISTS lifecycle_action_templates CASCADE;

CREATE TABLE lifecycle_action_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'email', 'task', 'notification'
  trigger_state VARCHAR(50),
  trigger_event VARCHAR(50), -- 'entered', 'exited', 'time_elapsed'
  time_delay_hours INTEGER DEFAULT 0,
  template_content JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_templates_state ON lifecycle_action_templates(trigger_state);
CREATE INDEX idx_action_templates_event ON lifecycle_action_templates(trigger_event);
CREATE INDEX idx_action_templates_active ON lifecycle_action_templates(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- OPPORTUNITY TOUCHPOINTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS opportunity_touchpoints CASCADE;

CREATE TABLE opportunity_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  touchpoint_type VARCHAR(50) NOT NULL, -- 'email', 'meeting', 'call', 'demo', 'proposal'
  channel VARCHAR(50), -- 'email', 'phone', 'linkedin', 'website'
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  outcome VARCHAR(50), -- 'response', 'no_response', 'positive', 'negative', 'neutral'
  content_summary TEXT,
  metadata JSONB DEFAULT '{}',
  attribution_weight DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_opp ON opportunity_touchpoints(opportunity_id);
CREATE INDEX idx_touchpoints_occurred_at ON opportunity_touchpoints(occurred_at DESC);
CREATE INDEX idx_touchpoints_type ON opportunity_touchpoints(touchpoint_type);
CREATE INDEX idx_touchpoints_channel ON opportunity_touchpoints(channel);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Opportunity Journey Summary View
DROP VIEW IF EXISTS opportunity_journey_summary CASCADE;

CREATE VIEW opportunity_journey_summary AS
SELECT
  ol.opportunity_id,
  MIN(ol.entered_at) as journey_started,
  MAX(ol.entered_at) as last_state_change,
  COUNT(DISTINCT ol.state) as states_visited,
  COUNT(*) as total_transitions,
  (SELECT state FROM opportunity_lifecycle
   WHERE opportunity_id = ol.opportunity_id
   ORDER BY entered_at DESC LIMIT 1) as current_state,
  (SELECT COUNT(*) FROM opportunity_touchpoints
   WHERE opportunity_id = ol.opportunity_id) as touchpoint_count,
  ls.composite_score,
  ls.win_probability,
  ls.churn_risk
FROM opportunity_lifecycle ol
LEFT JOIN lifecycle_scores ls ON ol.opportunity_id = ls.opportunity_id
GROUP BY ol.opportunity_id, ls.composite_score, ls.win_probability, ls.churn_risk;

-- Lifecycle Analytics Cache (Materialized View)
DROP MATERIALIZED VIEW IF EXISTS lifecycle_analytics_cache CASCADE;

CREATE MATERIALIZED VIEW lifecycle_analytics_cache AS
SELECT
  DATE_TRUNC('day', entered_at) as cohort_date,
  state,
  sub_state,
  COUNT(*) as opportunity_count,
  AVG(EXTRACT(EPOCH FROM (
    COALESCE(exited_at, NOW()) - entered_at
  )) / 86400) as avg_days_in_state,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (
      COALESCE(exited_at, NOW()) - entered_at
    )) / 86400
  ) as median_days_in_state
FROM opportunity_lifecycle
GROUP BY cohort_date, state, sub_state;

CREATE INDEX idx_analytics_cache_date ON lifecycle_analytics_cache(cohort_date DESC);
CREATE INDEX idx_analytics_cache_state ON lifecycle_analytics_cache(state);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to calculate engagement score (simplified version)
DROP FUNCTION IF EXISTS calculate_engagement_score(UUID);

CREATE OR REPLACE FUNCTION calculate_engagement_score(opp_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 50; -- Base score
  touchpoint_count INTEGER;
  recent_activity_count INTEGER;
  positive_outcomes INTEGER;
BEGIN
  -- Count total touchpoints
  SELECT COUNT(*) INTO touchpoint_count
  FROM opportunity_touchpoints
  WHERE opportunity_id = opp_id;

  -- Count recent activity (last 30 days)
  SELECT COUNT(*) INTO recent_activity_count
  FROM opportunity_touchpoints
  WHERE opportunity_id = opp_id
    AND occurred_at >= NOW() - INTERVAL '30 days';

  -- Count positive outcomes
  SELECT COUNT(*) INTO positive_outcomes
  FROM opportunity_touchpoints
  WHERE opportunity_id = opp_id
    AND outcome = 'positive';

  -- Calculate score
  score := score + (touchpoint_count * 2); -- +2 per touchpoint
  score := score + (recent_activity_count * 5); -- +5 per recent activity
  score := score + (positive_outcomes * 10); -- +10 per positive outcome

  -- Cap at 100
  IF score > 100 THEN
    score := 100;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to get attribution weights
DROP FUNCTION IF EXISTS get_attribution_weights(UUID, VARCHAR);

CREATE OR REPLACE FUNCTION get_attribution_weights(
  opp_id UUID,
  model VARCHAR DEFAULT 'linear'
)
RETURNS TABLE (
  touchpoint_id UUID,
  weight DECIMAL(5,4)
) AS $$
BEGIN
  IF model = 'linear' THEN
    -- Linear attribution: equal weight to all touchpoints
    RETURN QUERY
    SELECT
      id,
      (1.0 / COUNT(*) OVER ())::DECIMAL(5,4)
    FROM opportunity_touchpoints
    WHERE opportunity_id = opp_id
    ORDER BY occurred_at;

  ELSIF model = 'time_decay' THEN
    -- Time decay: more weight to recent touchpoints
    RETURN QUERY
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY occurred_at) as position,
        COUNT(*) OVER () as total
      FROM opportunity_touchpoints
      WHERE opportunity_id = opp_id
    )
    SELECT
      id,
      (POWER(2.0, position - 1) / (POWER(2.0, total) - 1))::DECIMAL(5,4)
    FROM ranked
    ORDER BY position;

  ELSIF model = 'position_based' THEN
    -- Position-based: 40% first, 40% last, 20% middle
    RETURN QUERY
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY occurred_at) as position,
        COUNT(*) OVER () as total
      FROM opportunity_touchpoints
      WHERE opportunity_id = opp_id
    )
    SELECT
      id,
      CASE
        WHEN position = 1 THEN 0.40
        WHEN position = total THEN 0.40
        ELSE (0.20 / GREATEST(total - 2, 1))::DECIMAL(5,4)
      END as weight
    FROM ranked
    ORDER BY position;

  ELSE
    -- Default to linear
    RETURN QUERY
    SELECT
      id,
      (1.0 / COUNT(*) OVER ())::DECIMAL(5,4)
    FROM opportunity_touchpoints
    WHERE opportunity_id = opp_id
    ORDER BY occurred_at;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update lifecycle_scores updated_at
DROP FUNCTION IF EXISTS update_lifecycle_scores_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_lifecycle_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lifecycle_scores_updated_at
  BEFORE UPDATE ON lifecycle_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_lifecycle_scores_updated_at();

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Seed default action templates
INSERT INTO lifecycle_action_templates (name, action_type, trigger_state, trigger_event, time_delay_hours, template_content) VALUES
('Qualified - Schedule Call', 'task', 'QUALIFIED', 'entered', 0, '{
  "title": "Schedule discovery call",
  "description": "Reach out to schedule a discovery call with this qualified opportunity",
  "priority": "high"
}'::jsonb),

('Outreach - Send Email', 'email', 'OUTREACH', 'entered', 2, '{
  "subject": "Introduction from UPR",
  "template": "initial_outreach",
  "priority": "normal"
}'::jsonb),

('Engaged - Follow Up', 'email', 'ENGAGED', 'entered', 24, '{
  "subject": "Following up on our conversation",
  "template": "engagement_followup",
  "priority": "normal"
}'::jsonb),

('Negotiating - Send Proposal', 'task', 'NEGOTIATING', 'entered', 0, '{
  "title": "Prepare and send proposal",
  "description": "Create customized proposal for this opportunity",
  "priority": "high"
}'::jsonb),

('Won - Thank You', 'email', 'CLOSED', 'entered', 1, '{
  "subject": "Thank you for choosing UPR!",
  "template": "thank_you_won",
  "priority": "high",
  "condition": "sub_state = WON"
}'::jsonb),

('Stalled - Nudge', 'email', 'ENGAGED', 'time_elapsed', 720, '{
  "subject": "Checking in",
  "template": "stalled_nudge",
  "priority": "low",
  "condition": "days_in_state > 30"
}'::jsonb);

-- =============================================================================
-- REFRESH MATERIALIZED VIEW
-- =============================================================================

-- Refresh the analytics cache
REFRESH MATERIALIZED VIEW lifecycle_analytics_cache;

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'lifecycle_scores',
    're_engagement_attempts',
    'lifecycle_action_templates',
    'opportunity_touchpoints'
  )
ORDER BY table_name;
