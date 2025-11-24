-- Sprint 41: Feedback Loop & Learning System
-- Migration: Create feedback loop infrastructure
-- Date: 2025-11-20

-- ============================================================================
-- 1. FEEDBACK COLLECTION TABLES
-- ============================================================================

-- Main feedback table
CREATE TABLE IF NOT EXISTS agent_core.feedback (
  id SERIAL PRIMARY KEY,
  decision_id UUID REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,
  user_id INTEGER,
  feedback_type VARCHAR(50) NOT NULL,
  -- Types: 'thumbs_up', 'thumbs_down', 'correction', 'rating', 'comment'
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  correction_data JSONB, -- Corrected values if user provided them
  context JSONB, -- Page, filters, user state when feedback given
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_feedback_decision_id ON agent_core.feedback(decision_id);
CREATE INDEX idx_feedback_user_id ON agent_core.feedback(user_id);
CREATE INDEX idx_feedback_type ON agent_core.feedback(feedback_type);
CREATE INDEX idx_feedback_created_at ON agent_core.feedback(created_at);

-- ============================================================================
-- 2. DECISION QUALITY SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_core.decision_quality_scores (
  id SERIAL PRIMARY KEY,
  decision_id UUID UNIQUE REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,
  quality_score DECIMAL(5,2) CHECK (quality_score BETWEEN 0 AND 100),
  confidence_adjusted_score DECIMAL(5,2),
  feedback_count INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  positive_ratio DECIMAL(5,2),
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quality_scores_decision_id ON agent_core.decision_quality_scores(decision_id);
CREATE INDEX idx_quality_scores_quality_score ON agent_core.decision_quality_scores(quality_score);

-- ============================================================================
-- 3. FEEDBACK AGGREGATIONS (Materialized View)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_core.feedback_summary AS
SELECT
  d.decision_id,
  d.tool_name as agent_type,
  d.primitive_type as decision_type,
  COUNT(f.id) as total_feedback,
  COUNT(*) FILTER (WHERE f.feedback_type IN ('thumbs_up')) as thumbs_up_count,
  COUNT(*) FILTER (WHERE f.feedback_type IN ('thumbs_down')) as thumbs_down_count,
  COUNT(*) FILTER (WHERE f.rating IS NOT NULL AND f.rating >= 4) as positive_ratings,
  COUNT(*) FILTER (WHERE f.rating IS NOT NULL AND f.rating <= 2) as negative_ratings,
  AVG(f.rating) FILTER (WHERE f.rating IS NOT NULL) as avg_rating,
  COUNT(DISTINCT f.user_id) as unique_users,
  MAX(f.created_at) as last_feedback_at
FROM agent_core.agent_decisions d
LEFT JOIN agent_core.feedback f ON f.decision_id = d.decision_id
GROUP BY d.decision_id, d.tool_name, d.primitive_type;

CREATE UNIQUE INDEX idx_feedback_summary_decision_id ON agent_core.feedback_summary(decision_id);
CREATE INDEX idx_feedback_summary_agent_type ON agent_core.feedback_summary(agent_type);

-- ============================================================================
-- 4. A/B TESTING INFRASTRUCTURE
-- ============================================================================

-- Experiments table
CREATE TABLE IF NOT EXISTS agent_core.experiments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  control_model VARCHAR(100),
  variant_model VARCHAR(100),
  traffic_split DECIMAL(3,2) DEFAULT 0.50 CHECK (traffic_split BETWEEN 0 AND 1),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'active', 'completed', 'stopped'
  winner VARCHAR(50), -- 'control', 'variant', 'inconclusive'
  config JSONB, -- Experiment configuration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_experiments_status ON agent_core.experiments(status);
CREATE INDEX idx_experiments_dates ON agent_core.experiments(start_date, end_date);

-- User assignments for experiments
CREATE TABLE IF NOT EXISTS agent_core.experiment_assignments (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES agent_core.experiments(id) ON DELETE CASCADE,
  user_id INTEGER,
  variant VARCHAR(50) NOT NULL, -- 'control' or 'variant'
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(experiment_id, user_id)
);

CREATE INDEX idx_experiment_assignments_exp_id ON agent_core.experiment_assignments(experiment_id);
CREATE INDEX idx_experiment_assignments_user_id ON agent_core.experiment_assignments(user_id);

-- Experiment metrics
CREATE TABLE IF NOT EXISTS agent_core.experiment_metrics (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES agent_core.experiments(id) ON DELETE CASCADE,
  variant VARCHAR(50) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  sample_size INTEGER,
  metadata JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_experiment_metrics_exp_id ON agent_core.experiment_metrics(experiment_id);
CREATE INDEX idx_experiment_metrics_variant ON agent_core.experiment_metrics(experiment_id, variant);
CREATE INDEX idx_experiment_metrics_name ON agent_core.experiment_metrics(metric_name);

-- ============================================================================
-- 5. MODEL VERSIONS & TRAINING
-- ============================================================================

-- Track model versions for retraining
CREATE TABLE IF NOT EXISTS agent_core.model_versions (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  model_type VARCHAR(50), -- 'lead_scoring', 'contact_tier', etc.
  training_data_size INTEGER,
  training_config JSONB,
  performance_metrics JSONB, -- Accuracy, F1, etc.
  status VARCHAR(50) DEFAULT 'training', -- 'training', 'testing', 'active', 'archived'
  is_production BOOLEAN DEFAULT false,
  trained_at TIMESTAMP DEFAULT NOW(),
  promoted_at TIMESTAMP,
  created_by VARCHAR(100),
  notes TEXT,
  UNIQUE(model_name, version)
);

CREATE INDEX idx_model_versions_name ON agent_core.model_versions(model_name);
CREATE INDEX idx_model_versions_status ON agent_core.model_versions(status);
CREATE INDEX idx_model_versions_production ON agent_core.model_versions(is_production);

-- Training data samples
CREATE TABLE IF NOT EXISTS agent_core.training_samples (
  id SERIAL PRIMARY KEY,
  model_type VARCHAR(50) NOT NULL,
  input_data JSONB NOT NULL,
  expected_output JSONB NOT NULL,
  source VARCHAR(100), -- 'user_feedback', 'manual_label', 'synthetic'
  source_id INTEGER, -- Reference to feedback or decision
  quality_score DECIMAL(5,2),
  is_validated BOOLEAN DEFAULT false,
  validated_by INTEGER,
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_training_samples_model_type ON agent_core.training_samples(model_type);
CREATE INDEX idx_training_samples_source ON agent_core.training_samples(source, source_id);
CREATE INDEX idx_training_samples_validated ON agent_core.training_samples(is_validated);

-- ============================================================================
-- 6. FEEDBACK INSIGHTS & PATTERNS
-- ============================================================================

-- Store identified patterns from feedback analysis
CREATE TABLE IF NOT EXISTS agent_core.feedback_patterns (
  id SERIAL PRIMARY KEY,
  pattern_type VARCHAR(100), -- 'failure_mode', 'success_factor', 'edge_case'
  agent_type VARCHAR(100),
  description TEXT,
  frequency INTEGER,
  severity VARCHAR(50), -- 'low', 'medium', 'high', 'critical'
  example_decisions UUID[], -- Array of decision IDs
  identified_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolution_notes TEXT
);

CREATE INDEX idx_feedback_patterns_type ON agent_core.feedback_patterns(pattern_type);
CREATE INDEX idx_feedback_patterns_agent ON agent_core.feedback_patterns(agent_type);
CREATE INDEX idx_feedback_patterns_severity ON agent_core.feedback_patterns(severity);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate decision quality score
CREATE OR REPLACE FUNCTION agent_core.calculate_quality_score(decision_id_param UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_positive INTEGER;
  v_negative INTEGER;
  v_total INTEGER;
  v_avg_rating DECIMAL(5,2);
  v_quality_score DECIMAL(5,2);
BEGIN
  -- Get feedback counts
  SELECT
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up' OR (rating >= 4)),
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_down' OR (rating <= 2)),
    COUNT(*),
    AVG(rating)
  INTO v_positive, v_negative, v_total, v_avg_rating
  FROM agent_core.feedback
  WHERE decision_id = decision_id_param;

  -- Calculate quality score (0-100)
  IF v_total = 0 THEN
    RETURN NULL; -- No feedback yet
  END IF;

  -- Weighted formula
  v_quality_score := (
    (v_positive::DECIMAL / v_total * 100 * 0.6) + -- Positive ratio (60% weight)
    (COALESCE(v_avg_rating, 3) / 5 * 100 * 0.4) -- Rating (40% weight)
  );

  RETURN ROUND(v_quality_score, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to refresh feedback summary materialized view
CREATE OR REPLACE FUNCTION agent_core.refresh_feedback_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY agent_core.feedback_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Auto-update timestamp triggers
CREATE OR REPLACE FUNCTION agent_core.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON agent_core.feedback
  FOR EACH ROW EXECUTE FUNCTION agent_core.update_updated_at_column();

CREATE TRIGGER update_quality_scores_updated_at BEFORE UPDATE ON agent_core.decision_quality_scores
  FOR EACH ROW EXECUTE FUNCTION agent_core.update_updated_at_column();

CREATE TRIGGER update_experiments_updated_at BEFORE UPDATE ON agent_core.experiments
  FOR EACH ROW EXECUTE FUNCTION agent_core.update_updated_at_column();

-- ============================================================================
-- 9. SAMPLE DATA (for testing)
-- ============================================================================

-- Insert a sample experiment
INSERT INTO agent_core.experiments (name, description, control_model, variant_model, status)
VALUES (
  'Lead Scoring V2 Test',
  'Testing improved lead scoring algorithm with feedback-based training',
  'lead_scoring_v1',
  'lead_scoring_v2',
  'draft'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. GRANTS (if needed)
-- ============================================================================

-- Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA agent_core TO upr_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agent_core TO upr_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA agent_core TO upr_app;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'agent_core'
  AND table_name IN (
    'feedback',
    'decision_quality_scores',
    'experiments',
    'experiment_assignments',
    'experiment_metrics',
    'model_versions',
    'training_samples',
    'feedback_patterns'
  );

  RAISE NOTICE 'Created % feedback loop tables in agent_core schema', table_count;
END $$;
