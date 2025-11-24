-- Sprint 35: Lead Scoring Engine
-- Database schema for lead scoring, monitoring, decay, and prioritization

-- =============================================================================
-- LEAD SCORES TABLE
-- =============================================================================
DROP TABLE IF EXISTS lead_scores CASCADE;

CREATE TABLE lead_scores (
  opportunity_id UUID PRIMARY KEY,
  q_score INTEGER CHECK (q_score BETWEEN 0 AND 100),
  engagement_score INTEGER CHECK (engagement_score BETWEEN 0 AND 100),
  fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100),
  lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 10000),
  priority_score INTEGER,
  grade VARCHAR(2) CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C', 'D')),
  segment VARCHAR(20),
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP,
  decay_applied BOOLEAN DEFAULT FALSE,
  decay_rate DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_scores_score ON lead_scores(lead_score DESC);
CREATE INDEX idx_lead_scores_priority ON lead_scores(priority_score DESC NULLS LAST);
CREATE INDEX idx_lead_scores_grade ON lead_scores(grade);
CREATE INDEX idx_lead_scores_calculated_at ON lead_scores(calculated_at);
CREATE INDEX idx_lead_scores_last_activity ON lead_scores(last_activity_at);

-- =============================================================================
-- LEAD SCORE HISTORY TABLE
-- =============================================================================
DROP TABLE IF EXISTS lead_score_history CASCADE;

CREATE TABLE lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  q_score INTEGER,
  engagement_score INTEGER,
  fit_score INTEGER,
  lead_score INTEGER,
  priority_score INTEGER,
  grade VARCHAR(2),
  change_reason VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_history_opp ON lead_score_history(opportunity_id);
CREATE INDEX idx_score_history_recorded ON lead_score_history(recorded_at DESC);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Lead Queue View (optimized for quick retrieval)
DROP VIEW IF EXISTS lead_queue_view CASCADE;

CREATE VIEW lead_queue_view AS
SELECT
  ls.opportunity_id,
  ls.lead_score,
  ls.priority_score,
  ls.grade,
  ls.q_score,
  ls.engagement_score,
  ls.fit_score,
  ls.calculated_at,
  ls.last_activity_at,
  ls.decay_applied,
  (SELECT state FROM opportunity_lifecycle
   WHERE opportunity_id = ls.opportunity_id
   ORDER BY entered_at DESC LIMIT 1) as current_state,
  (SELECT EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400
   FROM opportunity_lifecycle
   WHERE opportunity_id = ls.opportunity_id
   ORDER BY entered_at DESC LIMIT 1) as days_in_state,
  (SELECT MAX(occurred_at) FROM opportunity_touchpoints
   WHERE opportunity_id = ls.opportunity_id) as last_contact_at
FROM lead_scores ls
ORDER BY ls.priority_score DESC NULLS LAST, ls.lead_score DESC;

-- Score Distribution View
DROP VIEW IF EXISTS score_distribution_view CASCADE;

CREATE VIEW score_distribution_view AS
SELECT
  grade,
  COUNT(*) as count,
  AVG(lead_score) as avg_score,
  MIN(lead_score) as min_score,
  MAX(lead_score) as max_score,
  AVG(q_score) as avg_q_score,
  AVG(engagement_score) as avg_engagement,
  AVG(fit_score) as avg_fit
FROM lead_scores
GROUP BY grade
ORDER BY
  CASE grade
    WHEN 'A+' THEN 1
    WHEN 'A' THEN 2
    WHEN 'B+' THEN 3
    WHEN 'B' THEN 4
    WHEN 'C' THEN 5
    WHEN 'D' THEN 6
  END;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Calculate priority score
DROP FUNCTION IF EXISTS calculate_priority_score(UUID);

CREATE OR REPLACE FUNCTION calculate_priority_score(opp_id UUID)
RETURNS INTEGER AS $$
DECLARE
  lead_sc INTEGER;
  state_urgency INTEGER := 0;
  days_in_st NUMERIC;
  current_st VARCHAR(50);
  stage_boost INTEGER := 0;
  priority_sc INTEGER;
BEGIN
  -- Get lead score
  SELECT lead_score INTO lead_sc
  FROM lead_scores
  WHERE opportunity_id = opp_id;

  IF lead_sc IS NULL THEN
    RETURN 0;
  END IF;

  -- Get current state and days in state
  SELECT state, EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400
  INTO current_st, days_in_st
  FROM opportunity_lifecycle
  WHERE opportunity_id = opp_id
  ORDER BY entered_at DESC LIMIT 1;

  -- State urgency (days in state factor)
  state_urgency := LEAST(days_in_st * 10, 100)::INTEGER;

  -- Stage boost
  stage_boost := CASE current_st
    WHEN 'NEGOTIATING' THEN 100
    WHEN 'ENGAGED' THEN 50
    WHEN 'OUTREACH' THEN 25
    WHEN 'QUALIFIED' THEN 10
    WHEN 'DORMANT' THEN -50
    ELSE 0
  END;

  -- Calculate priority score
  priority_sc := (lead_sc * 0.5)::INTEGER +
                 (state_urgency * 0.2)::INTEGER +
                 stage_boost;

  RETURN priority_sc;
END;
$$ LANGUAGE plpgsql;

-- Apply score decay
DROP FUNCTION IF EXISTS apply_score_decay(UUID);

CREATE OR REPLACE FUNCTION apply_score_decay(opp_id UUID)
RETURNS JSONB AS $$
DECLARE
  original_eng INTEGER;
  days_inactive NUMERIC;
  decay_rt DECIMAL(5,4);
  decayed_eng INTEGER;
  result JSONB;
BEGIN
  -- Get current engagement score
  SELECT engagement_score INTO original_eng
  FROM lead_scores
  WHERE opportunity_id = opp_id;

  IF original_eng IS NULL THEN
    RETURN '{"error": "No score found"}'::JSONB;
  END IF;

  -- Calculate days since last activity
  SELECT COALESCE(
    EXTRACT(EPOCH FROM (NOW() - MAX(occurred_at))) / 86400,
    EXTRACT(EPOCH FROM (NOW() - calculated_at)) / 86400
  ) INTO days_inactive
  FROM opportunity_touchpoints
  WHERE opportunity_id = opp_id;

  -- Calculate decay rate (max 75%)
  decay_rt := LEAST(0.75, days_inactive * 0.0083);

  -- Apply decay
  decayed_eng := (original_eng * (1 - decay_rt))::INTEGER;

  result := jsonb_build_object(
    'originalEngagement', original_eng,
    'decayedEngagement', decayed_eng,
    'decayRate', decay_rt,
    'daysInactive', days_inactive
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update lead_scores updated_at trigger
DROP FUNCTION IF EXISTS update_lead_scores_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_lead_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_scores_updated_at
  BEFORE UPDATE ON lead_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_scores_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE lead_scores IS 'Current lead scores for all opportunities';
COMMENT ON TABLE lead_score_history IS 'Historical snapshots of lead scores for tracking changes';
COMMENT ON VIEW lead_queue_view IS 'Optimized view for retrieving prioritized lead queue';
COMMENT ON FUNCTION calculate_priority_score IS 'Calculate priority score for lead ranking';
COMMENT ON FUNCTION apply_score_decay IS 'Apply time-based decay to engagement scores';

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('lead_scores', 'lead_score_history')
ORDER BY table_name;
