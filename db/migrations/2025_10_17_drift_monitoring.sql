-- Drift Monitoring - Data drift detection and alerting

-- Drift detection logs
CREATE TABLE IF NOT EXISTS drift_logs (
  id SERIAL PRIMARY KEY,

  -- Feature info
  feature_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,

  -- Drift detection
  is_drift BOOLEAN NOT NULL,

  -- Metrics
  psi NUMERIC, -- Population Stability Index
  ks_statistic NUMERIC, -- Kolmogorov-Smirnov statistic
  ks_p_value NUMERIC, -- KS test p-value
  mean_shift NUMERIC, -- Mean shift in standard deviations

  -- Statistics
  baseline_stats JSONB, -- {mean, stddev, count}
  recent_stats JSONB, -- {mean, stddev, count}

  detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS drift_logs_feature_idx ON drift_logs(feature_name);
CREATE INDEX IF NOT EXISTS drift_logs_detected_idx ON drift_logs(detected_at DESC);
CREATE INDEX IF NOT EXISTS drift_logs_drift_idx ON drift_logs(is_drift) WHERE is_drift = TRUE;
CREATE INDEX IF NOT EXISTS drift_logs_feature_entity_idx ON drift_logs(feature_name, entity_type);

COMMENT ON TABLE drift_logs IS 'Data drift detection logs (PSI, KS test, mean shift)';
COMMENT ON COLUMN drift_logs.psi IS 'Population Stability Index: >0.2 indicates drift';
COMMENT ON COLUMN drift_logs.ks_statistic IS 'Kolmogorov-Smirnov statistic: measures distribution difference';
COMMENT ON COLUMN drift_logs.ks_p_value IS 'KS p-value: <0.05 indicates significant drift';
COMMENT ON COLUMN drift_logs.mean_shift IS 'Mean shift in standard deviations: >2 indicates drift';
