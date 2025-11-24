-- Sprint 43: Golden Dataset System
-- Migration: 2025_11_20_golden_dataset_system.sql
--
-- Creates comprehensive training data management system with:
-- - Dataset versioning (Git-like)
-- - Example quality scoring
-- - Labeling workflows
-- - Analytics tracking

-- Create training schema
CREATE SCHEMA IF NOT EXISTS training;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Golden dataset metadata
CREATE TABLE IF NOT EXISTS training.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  parent_version_id UUID REFERENCES training.datasets(id),
  is_active BOOLEAN DEFAULT true,
  quality_score DECIMAL(5,2),
  example_count INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  UNIQUE(name, version)
);

CREATE INDEX idx_datasets_name ON training.datasets(name);
CREATE INDEX idx_datasets_active ON training.datasets(is_active) WHERE is_active = true;
CREATE INDEX idx_datasets_created_at ON training.datasets(created_at DESC);

COMMENT ON TABLE training.datasets IS 'Dataset versions with metadata and quality metrics';

-- Training examples
CREATE TABLE IF NOT EXISTS training.examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id) ON DELETE CASCADE,
  example_type VARCHAR(50) NOT NULL, -- 'contact_tier', 'lead_score', 'company_quality', etc.
  input_data JSONB NOT NULL,
  expected_output JSONB NOT NULL,
  source_decision_id UUID, -- Link to production decision in agent_core.agent_decisions
  quality_score DECIMAL(5,2),
  labels JSONB DEFAULT '{}', -- Additional labels (confidence, difficulty, edge_case, etc.)
  validation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'validated', 'rejected'
  validated_by VARCHAR(255),
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_examples_dataset ON training.examples(dataset_id);
CREATE INDEX idx_examples_type ON training.examples(example_type);
CREATE INDEX idx_examples_validation_status ON training.examples(validation_status);
CREATE INDEX idx_examples_quality_score ON training.examples(quality_score DESC);
CREATE INDEX idx_examples_source_decision ON training.examples(source_decision_id) WHERE source_decision_id IS NOT NULL;

COMMENT ON TABLE training.examples IS 'Individual training examples with input/output pairs';

-- Quality metrics per example
CREATE TABLE IF NOT EXISTS training.example_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID REFERENCES training.examples(id) ON DELETE CASCADE,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  computed_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_example_quality_example ON training.example_quality(example_id);
CREATE INDEX idx_example_quality_metric ON training.example_quality(metric_name);

COMMENT ON TABLE training.example_quality IS 'Detailed quality metrics for each example';

-- ============================================================================
-- VERSIONING SYSTEM (Git-like)
-- ============================================================================

-- Dataset commits
CREATE TABLE IF NOT EXISTS training.dataset_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id) ON DELETE CASCADE,
  commit_hash VARCHAR(64) UNIQUE NOT NULL,
  parent_commit_hash VARCHAR(64),
  message TEXT NOT NULL,
  author VARCHAR(255) NOT NULL,
  committed_at TIMESTAMP DEFAULT NOW(),
  examples_added INTEGER DEFAULT 0,
  examples_removed INTEGER DEFAULT 0,
  examples_modified INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_commits_dataset ON training.dataset_commits(dataset_id);
CREATE INDEX idx_commits_hash ON training.dataset_commits(commit_hash);
CREATE INDEX idx_commits_parent ON training.dataset_commits(parent_commit_hash);
CREATE INDEX idx_commits_time ON training.dataset_commits(committed_at DESC);

COMMENT ON TABLE training.dataset_commits IS 'Version history with Git-like commit tracking';

-- Example changes per commit
CREATE TABLE IF NOT EXISTS training.example_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id UUID REFERENCES training.dataset_commits(id) ON DELETE CASCADE,
  example_id UUID REFERENCES training.examples(id) ON DELETE CASCADE,
  change_type VARCHAR(20) NOT NULL, -- 'added', 'removed', 'modified'
  before_data JSONB,
  after_data JSONB,
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_changes_commit ON training.example_changes(commit_id);
CREATE INDEX idx_changes_example ON training.example_changes(example_id);
CREATE INDEX idx_changes_type ON training.example_changes(change_type);

COMMENT ON TABLE training.example_changes IS 'Detailed change history for dataset commits';

-- ============================================================================
-- LABELING SYSTEM
-- ============================================================================

-- Labeling sessions
CREATE TABLE IF NOT EXISTS training.labeling_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labeler_id VARCHAR(255) NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  examples_labeled INTEGER DEFAULT 0,
  session_type VARCHAR(50), -- 'initial_labeling', 'validation', 'correction'
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_sessions_labeler ON training.labeling_sessions(labeler_id);
CREATE INDEX idx_sessions_started ON training.labeling_sessions(started_at DESC);
CREATE INDEX idx_sessions_type ON training.labeling_sessions(session_type);

COMMENT ON TABLE training.labeling_sessions IS 'Labeling work sessions for tracking productivity';

-- Label history
CREATE TABLE IF NOT EXISTS training.label_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID REFERENCES training.examples(id) ON DELETE CASCADE,
  session_id UUID REFERENCES training.labeling_sessions(id) ON DELETE SET NULL,
  labeler_id VARCHAR(255) NOT NULL,
  label_type VARCHAR(50),
  label_value JSONB NOT NULL,
  previous_value JSONB,
  labeled_at TIMESTAMP DEFAULT NOW(),
  confidence DECIMAL(5,2),
  notes TEXT
);

CREATE INDEX idx_label_history_example ON training.label_history(example_id);
CREATE INDEX idx_label_history_session ON training.label_history(session_id);
CREATE INDEX idx_label_history_labeler ON training.label_history(labeler_id);
CREATE INDEX idx_label_history_time ON training.label_history(labeled_at DESC);

COMMENT ON TABLE training.label_history IS 'Complete audit trail of labeling changes';

-- ============================================================================
-- ANALYTICS
-- ============================================================================

-- Dataset analytics
CREATE TABLE IF NOT EXISTS training.dataset_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id) ON DELETE CASCADE,
  metric_name VARCHAR(100) NOT NULL,
  metric_value JSONB NOT NULL,
  computed_at TIMESTAMP DEFAULT NOW(),
  time_period VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'all_time'
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_analytics_dataset ON training.dataset_analytics(dataset_id);
CREATE INDEX idx_analytics_metric ON training.dataset_analytics(metric_name);
CREATE INDEX idx_analytics_time ON training.dataset_analytics(computed_at DESC);
CREATE INDEX idx_analytics_period ON training.dataset_analytics(time_period);

COMMENT ON TABLE training.dataset_analytics IS 'Pre-computed analytics for dashboard performance';

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update example count trigger
CREATE OR REPLACE FUNCTION training.update_example_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE training.datasets
    SET example_count = example_count + 1
    WHERE id = NEW.dataset_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE training.datasets
    SET example_count = example_count - 1
    WHERE id = OLD.dataset_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_example_count
AFTER INSERT OR DELETE ON training.examples
FOR EACH ROW EXECUTE FUNCTION training.update_example_count();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION training.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_example_timestamp
BEFORE UPDATE ON training.examples
FOR EACH ROW EXECUTE FUNCTION training.update_timestamp();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active datasets with stats
CREATE OR REPLACE VIEW training.v_active_datasets AS
SELECT
  d.id,
  d.name,
  d.version,
  d.description,
  d.created_at,
  d.created_by,
  d.quality_score,
  d.example_count,
  d.tags,
  COUNT(DISTINCT e.id) FILTER (WHERE e.validation_status = 'validated') as validated_count,
  COUNT(DISTINCT e.id) FILTER (WHERE e.validation_status = 'pending') as pending_count,
  COUNT(DISTINCT e.id) FILTER (WHERE e.validation_status = 'rejected') as rejected_count,
  AVG(e.quality_score) as avg_example_quality,
  MAX(dc.committed_at) as last_commit_at
FROM training.datasets d
LEFT JOIN training.examples e ON d.id = e.dataset_id
LEFT JOIN training.dataset_commits dc ON d.id = dc.dataset_id
WHERE d.is_active = true
GROUP BY d.id, d.name, d.version, d.description, d.created_at, d.created_by,
         d.quality_score, d.example_count, d.tags;

COMMENT ON VIEW training.v_active_datasets IS 'Active datasets with computed statistics';

-- Example quality summary
CREATE OR REPLACE VIEW training.v_example_quality_summary AS
SELECT
  e.id,
  e.example_type,
  e.quality_score,
  e.validation_status,
  CASE
    WHEN e.quality_score >= 90 THEN 'Gold'
    WHEN e.quality_score >= 75 THEN 'Silver'
    WHEN e.quality_score >= 60 THEN 'Bronze'
    ELSE 'Rejected'
  END as quality_tier,
  e.created_at,
  e.validated_at,
  COUNT(lh.id) as label_count,
  MAX(lh.labeled_at) as last_labeled_at
FROM training.examples e
LEFT JOIN training.label_history lh ON e.id = lh.example_id
GROUP BY e.id, e.example_type, e.quality_score, e.validation_status, e.created_at, e.validated_at;

COMMENT ON VIEW training.v_example_quality_summary IS 'Example quality with tier classification';

-- Labeler productivity
CREATE OR REPLACE VIEW training.v_labeler_productivity AS
SELECT
  ls.labeler_id,
  ls.session_type,
  COUNT(DISTINCT ls.id) as total_sessions,
  SUM(ls.examples_labeled) as total_examples_labeled,
  AVG(ls.examples_labeled) as avg_examples_per_session,
  AVG(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at)) / 60) as avg_session_duration_minutes,
  MAX(ls.started_at) as last_session_at
FROM training.labeling_sessions ls
WHERE ls.ended_at IS NOT NULL
GROUP BY ls.labeler_id, ls.session_type;

COMMENT ON VIEW training.v_labeler_productivity IS 'Labeler performance metrics';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create default dataset
INSERT INTO training.datasets (name, version, description, created_by, is_active)
VALUES
  ('golden-v1', '1.0.0', 'Initial golden dataset for production training', 'system', true)
ON CONFLICT (name, version) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT USAGE ON SCHEMA training TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA training TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA training TO your_app_user;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Golden Dataset System migration completed successfully';
  RAISE NOTICE '   - Created schema: training';
  RAISE NOTICE '   - Created 10 tables';
  RAISE NOTICE '   - Created 3 views';
  RAISE NOTICE '   - Created triggers for auto-updates';
  RAISE NOTICE '   - Initialized default dataset';
END $$;
