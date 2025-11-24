-- Sprint 22: Feedback Collection & Learning System Schemas
-- Created: 2025-11-15
-- Purpose: Enable decision tracking, feedback collection, and ML training preparation

-- =================================================================
-- Table 1: agent_decisions
-- Purpose: Log every SIVA tool decision for feedback collection
-- =================================================================

CREATE TABLE IF NOT EXISTS agent_core.agent_decisions (
  -- Primary Key
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Decision Metadata
  tool_name VARCHAR(100) NOT NULL,  -- e.g., 'CompanyQualityTool'
  rule_name VARCHAR(100),            -- e.g., 'evaluate_company_quality'
  rule_version VARCHAR(20),          -- e.g., 'v1.0'
  primitive_type VARCHAR(50),        -- e.g., 'STRICT', 'DELEGATED', 'HYBRID'

  -- Input/Output
  input_data JSONB NOT NULL,         -- Complete input to the tool
  output_data JSONB NOT NULL,        -- Complete output from the tool

  -- Decision Quality Indicators
  confidence_score DECIMAL(3,2),     -- 0.00-1.00
  key_factors TEXT[],                -- Array of key decision factors
  edge_cases_applied TEXT[],         -- Edge cases that triggered

  -- Performance
  latency_ms INTEGER,                -- Execution time

  -- Timestamps
  decided_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for common queries
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_decisions_tool ON agent_core.agent_decisions(tool_name);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_rule ON agent_core.agent_decisions(rule_name, rule_version);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_decided_at ON agent_core.agent_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_confidence ON agent_core.agent_decisions(confidence_score);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_agent_decisions_input_gin ON agent_core.agent_decisions USING GIN (input_data);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_output_gin ON agent_core.agent_decisions USING GIN (output_data);

COMMENT ON TABLE agent_core.agent_decisions IS 'Sprint 22: Logs all SIVA tool decisions for feedback collection and learning';
COMMENT ON COLUMN agent_core.agent_decisions.decision_id IS 'Unique identifier returned to client for feedback submission';
COMMENT ON COLUMN agent_core.agent_decisions.rule_version IS 'Enables A/B testing different rule versions';
COMMENT ON COLUMN agent_core.agent_decisions.confidence_score IS 'Agent confidence in decision (0-1), used for active learning';

-- =================================================================
-- Table 2: decision_feedback
-- Purpose: Collect real-world outcomes for ML training
-- =================================================================

CREATE TABLE IF NOT EXISTS agent_core.decision_feedback (
  -- Primary Key
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Decision
  decision_id UUID NOT NULL REFERENCES agent_core.agent_decisions(decision_id) ON DELETE CASCADE,

  -- Feedback Data
  outcome_positive BOOLEAN,          -- Did the decision lead to success?
  outcome_type VARCHAR(50),          -- e.g., 'converted', 'engaged', 'ignored', 'bounced'
  outcome_value DECIMAL(10,2),       -- Business value (e.g., AED revenue, engagement score)

  -- Feedback Source
  feedback_source VARCHAR(50),       -- e.g., 'api', 'manual', 'automated'
  feedback_by VARCHAR(100),          -- User ID or system that provided feedback

  -- Additional Context
  notes TEXT,                        -- Free-form feedback notes
  metadata JSONB,                    -- Additional context (campaign_id, etc.)

  -- Timestamps
  feedback_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_decision_feedback_decision ON agent_core.decision_feedback(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_feedback_outcome ON agent_core.decision_feedback(outcome_positive);
CREATE INDEX IF NOT EXISTS idx_decision_feedback_feedback_at ON agent_core.decision_feedback(feedback_at DESC);

COMMENT ON TABLE agent_core.decision_feedback IS 'Sprint 22: Real-world outcomes for SIVA decisions, enables supervised learning';
COMMENT ON COLUMN agent_core.decision_feedback.outcome_positive IS 'Binary outcome: true=success, false=failure, null=pending';
COMMENT ON COLUMN agent_core.decision_feedback.outcome_value IS 'Quantitative outcome for regression training (revenue, engagement score, etc.)';

-- =================================================================
-- Table 3: training_samples
-- Purpose: Curated dataset for ML model training
-- =================================================================

CREATE TABLE IF NOT EXISTS agent_core.training_samples (
  -- Primary Key
  sample_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sample Metadata
  tool_name VARCHAR(100) NOT NULL,
  sample_type VARCHAR(50),           -- e.g., 'golden', 'production', 'synthetic', 'adversarial'

  -- Training Data
  input_features JSONB NOT NULL,     -- Normalized input features for ML
  expected_output JSONB NOT NULL,    -- Ground truth output
  actual_output JSONB,               -- System output (if from production)

  -- Quality Indicators
  quality_score DECIMAL(3,2),        -- Sample quality (0-1)
  is_validated BOOLEAN DEFAULT FALSE,-- Human-validated
  validated_by VARCHAR(100),         -- Who validated it
  validated_at TIMESTAMP,

  -- Metadata
  source_decision_id UUID REFERENCES agent_core.agent_decisions(decision_id),
  notes TEXT,
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_samples_tool ON agent_core.training_samples(tool_name);
CREATE INDEX IF NOT EXISTS idx_training_samples_type ON agent_core.training_samples(sample_type);
CREATE INDEX IF NOT EXISTS idx_training_samples_quality ON agent_core.training_samples(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_samples_validated ON agent_core.training_samples(is_validated);

-- GIN indexes for JSONB
CREATE INDEX IF NOT EXISTS idx_training_samples_input_gin ON agent_core.training_samples USING GIN (input_features);
CREATE INDEX IF NOT EXISTS idx_training_samples_output_gin ON agent_core.training_samples USING GIN (expected_output);

COMMENT ON TABLE agent_core.training_samples IS 'Sprint 22: Curated training dataset for ML model development';
COMMENT ON COLUMN agent_core.training_samples.sample_type IS 'golden=manual, production=from live, synthetic=generated, adversarial=edge cases';
COMMENT ON COLUMN agent_core.training_samples.quality_score IS 'Sample quality for weighted training (high quality = more weight)';

-- =================================================================
-- View: decision_performance
-- Purpose: Analytics view for decision quality over time
-- =================================================================

CREATE OR REPLACE VIEW agent_core.decision_performance AS
SELECT
  d.tool_name,
  d.rule_name,
  d.rule_version,
  COUNT(*) as total_decisions,
  COUNT(f.feedback_id) as decisions_with_feedback,
  AVG(CASE WHEN f.outcome_positive = TRUE THEN 1.0 ELSE 0.0 END) as success_rate,
  AVG(d.confidence_score) as avg_confidence,
  AVG(d.latency_ms) as avg_latency_ms,
  AVG(f.outcome_value) as avg_outcome_value,
  DATE(d.decided_at) as decision_date
FROM agent_core.agent_decisions d
LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
GROUP BY d.tool_name, d.rule_name, d.rule_version, DATE(d.decided_at)
ORDER BY decision_date DESC, total_decisions DESC;

COMMENT ON VIEW agent_core.decision_performance IS 'Sprint 22: Analytics view for monitoring decision quality and A/B testing';

-- =================================================================
-- Grant Permissions
-- =================================================================

-- Grant access to application role (assuming 'upr_app' role exists)
GRANT SELECT, INSERT ON agent_core.agent_decisions TO upr_app;
GRANT SELECT, INSERT, UPDATE ON agent_core.decision_feedback TO upr_app;
GRANT SELECT, INSERT, UPDATE ON agent_core.training_samples TO upr_app;
GRANT SELECT ON agent_core.decision_performance TO upr_app;

-- =================================================================
-- Sample Queries (for documentation)
-- =================================================================

-- Find low-confidence decisions that need human review
-- SELECT decision_id, tool_name, confidence_score, decided_at
-- FROM agent_core.agent_decisions
-- WHERE confidence_score < 0.7
-- ORDER BY decided_at DESC LIMIT 100;

-- Get feedback summary by tool
-- SELECT tool_name,
--        COUNT(*) as total,
--        SUM(CASE WHEN outcome_positive THEN 1 ELSE 0 END) as successes,
--        ROUND(AVG(CASE WHEN outcome_positive THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_pct
-- FROM agent_core.agent_decisions d
-- JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
-- GROUP BY tool_name;

-- Compare rule versions (A/B testing)
-- SELECT rule_version,
--        AVG(CASE WHEN outcome_positive THEN 1.0 ELSE 0.0 END) as success_rate,
--        COUNT(*) as sample_size
-- FROM agent_core.agent_decisions d
-- JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
-- WHERE rule_name = 'evaluate_company_quality'
-- GROUP BY rule_version;
