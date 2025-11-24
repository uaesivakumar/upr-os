-- Model Registry Enhancements
-- MLflow-style model management with shadow deployment

-- Traffic split for canary deployments
CREATE TABLE IF NOT EXISTS model_traffic_split (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  model_id UUID REFERENCES ml_models(id) ON DELETE CASCADE,
  traffic_percentage NUMERIC(3,2) NOT NULL, -- 0.00-1.00

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(model_id)
);

-- Model comparison logs
CREATE TABLE IF NOT EXISTS model_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  model_id_1 UUID REFERENCES ml_models(id),
  model_id_2 UUID REFERENCES ml_models(id),

  comparison_type TEXT, -- 'shadow', 'ab_test', 'manual'
  results JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS model_traffic_split_model_idx ON model_traffic_split(model_id);
CREATE INDEX IF NOT EXISTS model_comparisons_model1_idx ON model_comparisons(model_id_1);
CREATE INDEX IF NOT EXISTS model_comparisons_model2_idx ON model_comparisons(model_id_2);
CREATE INDEX IF NOT EXISTS model_comparisons_created_idx ON model_comparisons(created_at DESC);

COMMENT ON TABLE model_traffic_split IS 'Traffic routing for canary deployments (e.g., 10% traffic to new model)';
COMMENT ON TABLE model_comparisons IS 'Model A/B test and shadow deployment comparisons';
COMMENT ON COLUMN model_traffic_split.traffic_percentage IS 'Percentage of traffic (0.10 = 10%)';
