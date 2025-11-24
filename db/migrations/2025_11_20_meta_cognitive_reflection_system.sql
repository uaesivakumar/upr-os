-- Sprint 46: Meta-Cognitive Reflection & Agent Self-Improvement System
-- Multi-agent reflection, meta-cognition, and continuous learning

-- ==========================================================================
-- TABLES
-- ==========================================================================

-- Reasoning Quality Scores
-- Multi-dimensional assessment of agent reasoning quality
CREATE TABLE IF NOT EXISTS reasoning_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),

  -- Overall quality
  overall_quality INTEGER CHECK (overall_quality >= 0 AND overall_quality <= 100),
  quality_tier VARCHAR(20) CHECK (quality_tier IN ('EXCELLENT', 'GOOD', 'FAIR', 'POOR')),

  -- Dimensional scores (0-100)
  logic_score INTEGER CHECK (logic_score >= 0 AND logic_score <= 100),
  evidence_score INTEGER CHECK (evidence_score >= 0 AND evidence_score <= 100),
  coherence_score INTEGER CHECK (coherence_score >= 0 AND coherence_score <= 100),
  depth_score INTEGER CHECK (depth_score >= 0 AND depth_score <= 100),
  clarity_score INTEGER CHECK (clarity_score >= 0 AND clarity_score <= 100),

  -- Analysis
  reasoning_strengths TEXT[],
  reasoning_weaknesses TEXT[],
  fallacies_detected TEXT[],
  improvement_suggestions TEXT[],

  -- Meta-data
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scored_by VARCHAR(50) DEFAULT 'SYSTEM'
);

CREATE INDEX idx_reasoning_quality_decision ON reasoning_quality_scores(decision_id);
CREATE INDEX idx_reasoning_quality_agent ON reasoning_quality_scores(agent_id);
CREATE INDEX idx_reasoning_quality_tier ON reasoning_quality_scores(quality_tier);
CREATE INDEX idx_reasoning_quality_score ON reasoning_quality_scores(overall_quality DESC);

-- Meta-Cognitive Analysis
-- Agent's reflection on own thinking process
CREATE TABLE IF NOT EXISTS metacognitive_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),

  -- Self-awareness
  thinking_process_description TEXT,
  assumptions_made JSONB,
  biases_identified TEXT[],
  confidence_rationale TEXT,

  -- Alternative analysis
  alternatives_considered JSONB,
  counterfactual_analysis JSONB, -- "What if I had..."
  uncertainty_factors TEXT[],

  -- Self-assessment
  decision_difficulty VARCHAR(20) CHECK (decision_difficulty IN ('TRIVIAL', 'EASY', 'MODERATE', 'HARD', 'VERY_HARD')),
  knowledge_gaps TEXT[],
  information_needs TEXT[],

  -- Meta-learning
  what_i_learned TEXT,
  what_i_would_change TEXT,
  future_application TEXT,

  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_metacog_decision ON metacognitive_analysis(decision_id);
CREATE INDEX idx_metacog_agent ON metacognitive_analysis(agent_id);
CREATE INDEX idx_metacog_difficulty ON metacognitive_analysis(decision_difficulty);

-- Agent Self-Assessments
-- Periodic agent self-evaluation
CREATE TABLE IF NOT EXISTS agent_self_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  assessment_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  assessment_period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Performance self-rating (0-100)
  overall_performance_rating INTEGER CHECK (overall_performance_rating >= 0 AND overall_performance_rating <= 100),
  decision_quality_rating INTEGER CHECK (decision_quality_rating >= 0 AND decision_quality_rating <= 100),
  learning_progress_rating INTEGER CHECK (learning_progress_rating >= 0 AND learning_progress_rating <= 100),
  collaboration_rating INTEGER CHECK (collaboration_rating >= 0 AND collaboration_rating <= 100),

  -- Strengths & weaknesses
  identified_strengths JSONB,
  identified_weaknesses JSONB,
  improvement_areas JSONB,

  -- Goals & plans
  learning_goals JSONB,
  action_plan JSONB,
  resources_needed TEXT[],

  -- Calibration
  confidence_calibration_score NUMERIC(5,2), -- How well confidence matches actual performance
  overconfidence_instances INTEGER DEFAULT 0,
  underconfidence_instances INTEGER DEFAULT 0,

  assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_self_assessment_agent ON agent_self_assessments(agent_id);
CREATE INDEX idx_self_assessment_date ON agent_self_assessments(assessed_at DESC);

-- Mistake Detection & Learning
-- Track errors and extract learnings
CREATE TABLE IF NOT EXISTS mistake_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),

  -- Mistake classification
  mistake_type VARCHAR(50) NOT NULL,
  mistake_category VARCHAR(50) CHECK (mistake_category IN ('REASONING_ERROR', 'KNOWLEDGE_GAP', 'BIAS', 'OVERCONFIDENCE', 'INCOMPLETE_ANALYSIS', 'WRONG_ASSUMPTION', 'OTHER')),
  severity VARCHAR(20) CHECK (severity IN ('MINOR', 'MODERATE', 'MAJOR', 'CRITICAL')),

  -- Error analysis
  what_went_wrong TEXT NOT NULL,
  why_it_happened TEXT,
  correct_approach TEXT,
  root_causes TEXT[],

  -- Learning extraction
  key_learning TEXT NOT NULL,
  preventive_measures JSONB,
  similar_situations_to_watch TEXT[],

  -- Application
  applied_successfully BOOLEAN DEFAULT FALSE,
  application_examples JSONB,
  learning_impact_score NUMERIC(3,2) CHECK (learning_impact_score >= 0 AND learning_impact_score <= 10),

  -- Sharing
  shared_with_agents UUID[],
  shared_at TIMESTAMP WITH TIME ZONE,

  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  learned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mistake_decision ON mistake_learning_log(decision_id);
CREATE INDEX idx_mistake_agent ON mistake_learning_log(agent_id);
CREATE INDEX idx_mistake_type ON mistake_learning_log(mistake_type);
CREATE INDEX idx_mistake_category ON mistake_learning_log(mistake_category);
CREATE INDEX idx_mistake_severity ON mistake_learning_log(severity);

-- Collaborative Decisions
-- Multi-agent consensus building
CREATE TABLE IF NOT EXISTS collaborative_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_topic VARCHAR(255) NOT NULL,
  decision_context JSONB NOT NULL,

  -- Participants
  lead_agent_id UUID REFERENCES agents(id),
  participating_agents UUID[],

  -- Decision process
  individual_proposals JSONB, -- Each agent's proposal
  voting_results JSONB,
  consensus_method VARCHAR(50) CHECK (consensus_method IN ('UNANIMOUS', 'MAJORITY', 'WEIGHTED', 'LEADER_DECIDES', 'EXPERT_DECIDES')),

  -- Final decision
  final_decision JSONB NOT NULL,
  confidence_aggregate NUMERIC(3,2),
  agreement_level NUMERIC(3,2), -- 0-1 (1 = unanimous)

  -- Dissent tracking
  dissenting_agents UUID[],
  dissent_reasons JSONB,

  -- Outcome & learning
  outcome_evaluation JSONB,
  collective_learning TEXT,
  process_improvements JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DECIDED', 'IMPLEMENTED', 'EVALUATED')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  decided_at TIMESTAMP WITH TIME ZONE,
  evaluated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_collab_decision_lead ON collaborative_decisions(lead_agent_id);
CREATE INDEX idx_collab_decision_status ON collaborative_decisions(status);
CREATE INDEX idx_collab_decision_date ON collaborative_decisions(created_at DESC);

-- Reflection Triggers
-- Events that trigger agent reflection
CREATE TABLE IF NOT EXISTS reflection_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),

  -- Trigger details
  trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('LOW_CONFIDENCE', 'ERROR_DETECTED', 'FEEDBACK_RECEIVED', 'PERIODIC', 'PERFORMANCE_DROP', 'KNOWLEDGE_GAP', 'MANUAL')),
  trigger_source VARCHAR(100),
  trigger_data JSONB,

  -- Related entities
  decision_id UUID,
  feedback_id UUID,

  -- Reflection status
  reflection_created BOOLEAN DEFAULT FALSE,
  reflection_id UUID REFERENCES agent_reflections(id),

  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reflection_trigger_agent ON reflection_triggers(agent_id);
CREATE INDEX idx_reflection_trigger_type ON reflection_triggers(trigger_type);
CREATE INDEX idx_reflection_trigger_date ON reflection_triggers(triggered_at DESC);

-- Reflection Analytics Summary
-- Pre-calculated analytics for reflection insights
CREATE TABLE IF NOT EXISTS reflection_analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),

  -- Time period
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Reflection metrics
  total_reflections INTEGER DEFAULT 0,
  self_initiated_reflections INTEGER DEFAULT 0,
  triggered_reflections INTEGER DEFAULT 0,
  avg_reflection_depth_score NUMERIC(5,2),

  -- Learning metrics
  total_learnings INTEGER DEFAULT 0,
  learnings_applied INTEGER DEFAULT 0,
  learning_application_rate NUMERIC(5,2),
  avg_learning_impact_score NUMERIC(5,2),

  -- Quality metrics
  avg_reasoning_quality NUMERIC(5,2),
  quality_improvement_rate NUMERIC(5,2), -- Percentage improvement
  mistakes_detected INTEGER DEFAULT 0,
  mistakes_prevented INTEGER DEFAULT 0,

  -- Collaboration metrics
  collaborative_decisions INTEGER DEFAULT 0,
  consensus_participation_rate NUMERIC(5,2),
  learnings_shared INTEGER DEFAULT 0,
  learnings_received INTEGER DEFAULT 0,

  -- Trends
  performance_trend VARCHAR(20) CHECK (performance_trend IN ('IMPROVING', 'STABLE', 'DECLINING')),
  confidence_calibration_trend VARCHAR(20),

  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reflect_analytics_agent ON reflection_analytics_summary(agent_id);
CREATE INDEX idx_reflect_analytics_period ON reflection_analytics_summary(period_type, period_start);

-- Improvement Recommendations
-- Actionable recommendations for agent improvement
CREATE TABLE IF NOT EXISTS improvement_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),

  -- Recommendation details
  recommendation_type VARCHAR(50) NOT NULL,
  recommendation_title VARCHAR(255) NOT NULL,
  recommendation_description TEXT NOT NULL,

  -- Priority & effort
  priority VARCHAR(20) CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  effort_level VARCHAR(20) CHECK (effort_level IN ('LOW', 'MEDIUM', 'HIGH')),
  timeframe VARCHAR(50),

  -- Impact
  expected_impact TEXT,
  impact_score NUMERIC(5,2), -- 0-100
  affected_areas TEXT[],

  -- Action plan
  action_steps JSONB NOT NULL,
  resources_required JSONB,
  success_criteria JSONB,

  -- Implementation
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'REJECTED')),
  implementation_plan JSONB,
  progress_notes TEXT,

  -- Validation
  before_metrics JSONB,
  after_metrics JSONB,
  actual_impact TEXT,
  validated_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_improvement_rec_agent ON improvement_recommendations(agent_id);
CREATE INDEX idx_improvement_rec_priority ON improvement_recommendations(priority);
CREATE INDEX idx_improvement_rec_status ON improvement_recommendations(status);

-- ==========================================================================
-- VIEWS
-- ==========================================================================

-- View: Agent Learning Summary
CREATE OR REPLACE VIEW v_agent_learning_summary AS
SELECT
  a.id as agent_id,
  a.agent_name,
  COUNT(DISTINCT ml.id) as total_mistakes_learned,
  COUNT(DISTINCT CASE WHEN ml.applied_successfully THEN ml.id END) as learnings_applied,
  AVG(ml.learning_impact_score) as avg_learning_impact,
  COUNT(DISTINCT ar.id) as total_reflections,
  AVG(ar.impact_score) as avg_reflection_impact,
  COUNT(DISTINCT cd.id) as collaborative_decisions_participated,
  COUNT(DISTINCT ir.id) as improvement_recommendations_count,
  COUNT(DISTINCT CASE WHEN ir.status = 'COMPLETED' THEN ir.id END) as improvements_completed
FROM agents a
LEFT JOIN mistake_learning_log ml ON a.id = ml.agent_id
LEFT JOIN agent_reflections ar ON a.id = ar.agent_id
LEFT JOIN collaborative_decisions cd ON a.id = ANY(cd.participating_agents)
LEFT JOIN improvement_recommendations ir ON a.id = ir.agent_id
GROUP BY a.id, a.agent_name;

-- View: Reflection Quality Trends
CREATE OR REPLACE VIEW v_reflection_quality_trends AS
SELECT
  DATE(ar.created_at) as reflection_date,
  COUNT(*) as daily_reflections,
  AVG(ar.impact_score) as avg_impact_score,
  COUNT(DISTINCT ar.agent_id) as agents_reflecting,
  COUNT(DISTINCT CASE WHEN array_length(ar.learnings, 1) > 0 THEN ar.id END) as reflections_with_learnings
FROM agent_reflections ar
WHERE ar.created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE(ar.created_at)
ORDER BY reflection_date DESC;

-- View: Collaborative Decision Effectiveness
CREATE OR REPLACE VIEW v_collaborative_decision_effectiveness AS
SELECT
  cd.id,
  cd.decision_topic,
  array_length(cd.participating_agents, 1) as participant_count,
  cd.consensus_method,
  cd.agreement_level,
  cd.confidence_aggregate,
  array_length(cd.dissenting_agents, 1) as dissent_count,
  cd.status,
  cd.created_at,
  cd.decided_at
FROM collaborative_decisions cd
ORDER BY cd.created_at DESC;

-- ==========================================================================
-- FUNCTIONS
-- ==========================================================================

-- Function: Auto-set reasoning quality tier
CREATE OR REPLACE FUNCTION auto_set_reasoning_quality_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_quality >= 85 THEN
    NEW.quality_tier := 'EXCELLENT';
  ELSIF NEW.overall_quality >= 70 THEN
    NEW.quality_tier := 'GOOD';
  ELSIF NEW.overall_quality >= 60 THEN
    NEW.quality_tier := 'FAIR';
  ELSE
    NEW.quality_tier := 'POOR';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Trigger agent reflection on low performance
CREATE OR REPLACE FUNCTION trigger_reflection_on_low_performance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_quality < 60 OR NEW.logic_score < 50 THEN
    INSERT INTO reflection_triggers (
      agent_id, trigger_type, trigger_source, trigger_data, decision_id
    ) VALUES (
      NEW.agent_id,
      'PERFORMANCE_DROP',
      'reasoning_quality_monitor',
      jsonb_build_object(
        'quality_score', NEW.overall_quality,
        'logic_score', NEW.logic_score,
        'weaknesses', NEW.reasoning_weaknesses
      ),
      NEW.decision_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update reflection analytics
CREATE OR REPLACE FUNCTION update_reflection_analytics()
RETURNS TRIGGER AS $$
DECLARE
  agent_rec RECORD;
BEGIN
  -- Get today's date for daily aggregation
  FOR agent_rec IN
    SELECT DISTINCT agent_id FROM agent_reflections
    WHERE created_at >= CURRENT_DATE
  LOOP
    INSERT INTO reflection_analytics_summary (
      agent_id,
      period_type,
      period_start,
      period_end,
      total_reflections,
      avg_reflection_depth_score
    )
    SELECT
      agent_rec.agent_id,
      'DAILY',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '1 day',
      COUNT(*),
      AVG(impact_score)
    FROM agent_reflections
    WHERE agent_id = agent_rec.agent_id
      AND created_at >= CURRENT_DATE
    ON CONFLICT (agent_id, period_type, period_start)
    DO UPDATE SET
      total_reflections = EXCLUDED.total_reflections,
      avg_reflection_depth_score = EXCLUDED.avg_reflection_depth_score,
      calculated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- TRIGGERS
-- ==========================================================================

-- Trigger: Auto-set quality tier
DROP TRIGGER IF EXISTS trigger_auto_set_reasoning_tier ON reasoning_quality_scores;
CREATE TRIGGER trigger_auto_set_reasoning_tier
  BEFORE INSERT OR UPDATE OF overall_quality ON reasoning_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_reasoning_quality_tier();

-- Trigger: Trigger reflection on low performance
DROP TRIGGER IF EXISTS trigger_reflection_low_performance ON reasoning_quality_scores;
CREATE TRIGGER trigger_reflection_low_performance
  AFTER INSERT ON reasoning_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reflection_on_low_performance();

-- Trigger: Update analytics
DROP TRIGGER IF EXISTS trigger_update_reflection_analytics ON agent_reflections;
CREATE TRIGGER trigger_update_reflection_analytics
  AFTER INSERT ON agent_reflections
  FOR EACH ROW
  EXECUTE FUNCTION update_reflection_analytics();

-- ==========================================================================
-- CONFIGURATION
-- ==========================================================================

-- Insert default configuration
INSERT INTO outreach_config (config_key, config_value, description) VALUES
  ('reflection_system', '{
    "auto_reflection_threshold": 60,
    "min_reasoning_quality": 50,
    "collaborative_decision_min_agents": 3,
    "learning_impact_threshold": 5.0,
    "confidence_calibration_window": 30
  }', 'Meta-cognitive reflection system configuration')
ON CONFLICT (config_key) DO NOTHING;

-- Verification queries
SELECT 'Tables created:' as status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('reasoning_quality_scores', 'metacognitive_analysis', 'agent_self_assessments', 'mistake_learning_log', 'collaborative_decisions', 'reflection_triggers', 'reflection_analytics_summary', 'improvement_recommendations');

SELECT 'Views created:' as status;
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
AND table_name LIKE 'v_%learning%' OR table_name LIKE 'v_%reflection%' OR table_name LIKE 'v_%collaborative%';

SELECT 'Functions created:' as status;
SELECT proname FROM pg_proc
WHERE proname IN ('auto_set_reasoning_quality_tier', 'trigger_reflection_on_low_performance', 'update_reflection_analytics');
