-- Migration: ML Infrastructure & Feature Store
-- Date: 2025-10-17
-- Purpose: Advanced ML/Data Science stack for predictive intelligence

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- 1. FEATURE STORE (centralized features for all ML models)
-- =====================================================
CREATE TABLE IF NOT EXISTS feature_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'company', 'person', 'email'
  entity_id UUID NOT NULL,

  -- Feature vectors
  features JSONB NOT NULL,
  feature_version TEXT NOT NULL DEFAULT 'v1', -- v1, v2, etc. (for A/B testing features)

  -- Metadata
  computed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(entity_type, entity_id, feature_version)
);

CREATE INDEX IF NOT EXISTS feature_store_entity_idx ON feature_store(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS feature_store_version_idx ON feature_store(feature_version);

-- =====================================================
-- 2. ML MODEL REGISTRY (track all trained models)
-- =====================================================
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model identity
  model_name TEXT NOT NULL, -- 'conversion_predictor', 'send_time_optimizer', etc.
  model_version TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'sklearn', 'pytorch', 'tensorflow', 'xgboost'

  -- Model artifacts
  model_path TEXT NOT NULL, -- S3 or local path to serialized model
  feature_columns JSONB NOT NULL, -- List of required features

  -- Performance metrics
  metrics JSONB NOT NULL, -- {accuracy, precision, recall, f1, auc_roc, etc}

  -- Training info
  training_samples INTEGER,
  training_date TIMESTAMPTZ,
  hyperparameters JSONB,

  -- Status
  status TEXT DEFAULT 'training', -- 'training', 'deployed', 'archived'
  deployed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_models_name_idx ON ml_models(model_name);
CREATE INDEX IF NOT EXISTS ml_models_status_idx ON ml_models(status) WHERE status = 'deployed';

-- =====================================================
-- 3. MODEL PREDICTIONS (store all predictions for analysis)
-- =====================================================
CREATE TABLE IF NOT EXISTS ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model info
  model_id UUID REFERENCES ml_models(id),
  model_name TEXT NOT NULL,

  -- Prediction
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  prediction JSONB NOT NULL, -- {score, class, probabilities, etc}
  confidence NUMERIC(5,4), -- 0.0-1.0

  -- Ground truth (for evaluation)
  actual_outcome JSONB,
  outcome_recorded_at TIMESTAMPTZ,

  -- Metadata
  features_used JSONB,
  prediction_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_predictions_model_idx ON ml_predictions(model_id);
CREATE INDEX IF NOT EXISTS ml_predictions_entity_idx ON ml_predictions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ml_predictions_created_idx ON ml_predictions(created_at DESC);

-- =====================================================
-- 4. EXPERIMENTATION FRAMEWORK (A/B testing, multi-armed bandits)
-- =====================================================
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Experiment identity
  name TEXT NOT NULL,
  description TEXT,
  experiment_type TEXT NOT NULL, -- 'ab_test', 'multivariate', 'bandit'

  -- Configuration
  variants JSONB NOT NULL, -- [{id: 'A', name: '...', config: {...}}, ...]
  allocation_strategy TEXT DEFAULT 'uniform', -- 'uniform', 'thompson_sampling', 'epsilon_greedy'

  -- Metrics to track
  primary_metric TEXT NOT NULL, -- 'conversion_rate', 'reply_rate', etc.
  secondary_metrics JSONB,

  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'running', 'completed', 'paused'
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Results
  winner_variant_id TEXT,
  statistical_significance NUMERIC(5,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  experiment_id UUID REFERENCES experiments(id),

  -- Assignment
  entity_type TEXT NOT NULL, -- 'email', 'company', 'person'
  entity_id UUID NOT NULL,
  variant_id TEXT NOT NULL,

  -- Outcome
  outcome JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(experiment_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS experiment_assignments_exp_idx ON experiment_assignments(experiment_id);

-- =====================================================
-- 5. KNOWLEDGE GRAPH (company/person relationships)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  node_type TEXT NOT NULL, -- 'company', 'person', 'technology', 'location', 'event'
  entity_id UUID, -- References companies or people table

  -- Node properties
  name TEXT NOT NULL,
  properties JSONB,

  -- Embeddings for node similarity
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationship
  source_node_id UUID REFERENCES knowledge_graph_nodes(id),
  target_node_id UUID REFERENCES knowledge_graph_nodes(id),
  relationship_type TEXT NOT NULL, -- 'works_at', 'invests_in', 'partners_with', 'competes_with', 'uses_technology', 'operates_in'

  -- Edge properties
  properties JSONB,
  confidence NUMERIC(3,2), -- 0.0-1.0

  -- Source
  source TEXT, -- 'linkedin', 'news', 'user_input', 'ml_inferred'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_nodes_type_idx ON knowledge_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS kg_nodes_entity_idx ON knowledge_graph_nodes(entity_id);
CREATE INDEX IF NOT EXISTS kg_edges_source_idx ON knowledge_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS kg_edges_target_idx ON knowledge_graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS kg_edges_type_idx ON knowledge_graph_edges(relationship_type);

-- =====================================================
-- 6. TIME SERIES STORE (for forecasting models)
-- =====================================================
CREATE TABLE IF NOT EXISTS time_series_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity
  entity_type TEXT NOT NULL, -- 'company', 'campaign_type', 'global'
  entity_id UUID,

  -- Metric
  metric_name TEXT NOT NULL, -- 'engagement_rate', 'conversion_rate', 'email_volume'
  metric_value NUMERIC,

  -- Time
  timestamp TIMESTAMPTZ NOT NULL,
  granularity TEXT NOT NULL, -- 'hourly', 'daily', 'weekly'

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ts_metrics_entity_idx ON time_series_metrics(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ts_metrics_name_idx ON time_series_metrics(metric_name);
CREATE INDEX IF NOT EXISTS ts_metrics_time_idx ON time_series_metrics(timestamp DESC);

-- =====================================================
-- 7. EMAIL OUTCOMES TABLE (if not exists - for ML training)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Email context
  company_id UUID,
  person_id UUID,
  campaign_type_id UUID,

  -- Email content hash (for deduplication)
  content_hash TEXT,

  -- Delivery
  sent_at TIMESTAMPTZ NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  bounced BOOLEAN DEFAULT FALSE,

  -- Engagement
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,

  -- Conversion
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  conversion_value NUMERIC,

  -- Metadata
  send_time_hour INTEGER, -- 0-23
  send_day_of_week INTEGER, -- 0-6

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_outcomes_company_idx ON email_outcomes(company_id);
CREATE INDEX IF NOT EXISTS email_outcomes_person_idx ON email_outcomes(person_id);
CREATE INDEX IF NOT EXISTS email_outcomes_sent_idx ON email_outcomes(sent_at DESC);
CREATE INDEX IF NOT EXISTS email_outcomes_converted_idx ON email_outcomes(converted) WHERE converted = TRUE;

-- =====================================================
-- 8. SIGNALS TABLE (if not exists - for feature engineering)
-- =====================================================
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL,
  signal_type TEXT NOT NULL, -- 'hiring', 'funding', 'news', 'product_launch'

  -- Signal details
  title TEXT,
  description TEXT,
  url TEXT,

  -- Time
  published_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signals_company_idx ON signals(company_id);
CREATE INDEX IF NOT EXISTS signals_type_idx ON signals(signal_type);
CREATE INDEX IF NOT EXISTS signals_published_idx ON signals(published_at DESC);

-- =====================================================
-- 9. PEOPLE TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  title TEXT,
  function TEXT, -- 'HR', 'Finance', 'Admin', 'Leadership', 'Operations'

  company_id UUID,

  -- Contact
  email TEXT,
  linkedin_url TEXT,
  location TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS people_company_idx ON people(company_id);

-- =====================================================
-- 10. ADD UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables if they have updated_at column
-- (Skip if tables don't exist or don't have updated_at)

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- ML Infrastructure ready:
-- - Feature store for all entities
-- - Model registry and predictions
-- - A/B testing framework
-- - Knowledge graph for relationships
-- - Time series for forecasting
-- - Email outcomes for training
