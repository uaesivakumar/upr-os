-- File: db/migrations/2025_10_19_hiring_signals_recall_mode.sql
-- RADAR Recall-Mode System: Three-Tier Hiring Signals

-- Drop existing table if it exists (CAREFUL - this loses data)
-- Only run this if you're OK losing existing data
-- DROP TABLE IF EXISTS hiring_signals CASCADE;

-- Create hiring_signals table
CREATE TABLE IF NOT EXISTS hiring_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  run_id UUID,

  -- Company identification
  company TEXT NOT NULL,
  domain TEXT,
  sector TEXT,

  -- Signal details
  trigger_type TEXT,
  description TEXT,

  -- Scoring (all nullable for recall mode)
  hiring_likelihood_score INTEGER CHECK (hiring_likelihood_score BETWEEN 1 AND 5),
  hiring_likelihood TEXT CHECK (hiring_likelihood IN ('Very High', 'High', 'Medium', 'Low', 'Very Low')),

  -- Geography (recall mode - capture everything)
  geo_status TEXT CHECK (geo_status IN ('confirmed', 'probable', 'ambiguous')),
  geo_hints TEXT[],
  location TEXT,

  -- Evidence & sourcing
  source_url TEXT,
  source_date DATE,
  evidence_quote TEXT,
  evidence_note TEXT,

  -- Role clustering
  role_cluster JSONB,

  -- Review workflow
  review_status TEXT CHECK (review_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  reject_reason TEXT,

  -- Metadata
  notes TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS ix_hs_tenant ON hiring_signals(tenant_id);
CREATE INDEX IF NOT EXISTS ix_hs_geo ON hiring_signals(geo_status);
CREATE INDEX IF NOT EXISTS ix_hs_score ON hiring_signals(hiring_likelihood_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_hs_trigger ON hiring_signals(trigger_type);
CREATE INDEX IF NOT EXISTS ix_hs_source_date ON hiring_signals(source_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_hs_review_status ON hiring_signals(review_status);
CREATE INDEX IF NOT EXISTS ix_hs_detected_at ON hiring_signals(detected_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS ix_hs_tenant_review ON hiring_signals(tenant_id, review_status);

-- HOT LEADS VIEW
-- Auto-surface high-confidence, recent, or high-value signals
CREATE OR REPLACE VIEW v_hiring_hot AS
SELECT *
FROM hiring_signals
WHERE review_status = 'pending'
  AND (
    -- High confidence + high score
    (geo_status = 'confirmed' AND hiring_likelihood_score >= 4)

    -- OR recent high-value triggers (time-sensitive)
    OR (
      trigger_type IN ('Hiring Drive', 'Project Award', 'Expansion')
      AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '30 days')
    )
  )
ORDER BY
  hiring_likelihood_score DESC NULLS LAST,
  source_date DESC NULLS LAST,
  detected_at DESC;

-- REVIEW QUEUE VIEW
-- Medium confidence items needing human verification
CREATE OR REPLACE VIEW v_hiring_review AS
SELECT *
FROM hiring_signals
WHERE review_status = 'pending'
  AND (
    -- Confirmed geography but medium score
    (geo_status = 'confirmed' AND hiring_likelihood_score = 3)

    -- OR probable geography with high score
    OR (geo_status = 'probable' AND hiring_likelihood_score >= 4)
  )
  -- Exclude items already in Hot Leads
  AND id NOT IN (SELECT id FROM v_hiring_hot)
ORDER BY
  source_date DESC NULLS LAST,
  hiring_likelihood_score DESC NULLS LAST,
  detected_at DESC;

-- BACKGROUND VIEW
-- Everything else (low confidence, parked for later)
CREATE OR REPLACE VIEW v_hiring_background AS
SELECT *
FROM hiring_signals
WHERE review_status = 'pending'
  AND id NOT IN (
    SELECT id FROM v_hiring_hot
    UNION ALL
    SELECT id FROM v_hiring_review
  )
ORDER BY detected_at DESC;

-- APPROVED VIEW (for outreach)
CREATE OR REPLACE VIEW v_hiring_approved AS
SELECT *
FROM hiring_signals
WHERE review_status = 'approved'
ORDER BY reviewed_at DESC;

-- COUNT VIEW for quick stats
CREATE OR REPLACE VIEW v_hiring_stats AS
SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE id IN (SELECT id FROM v_hiring_hot)) as hot_count,
  COUNT(*) FILTER (WHERE id IN (SELECT id FROM v_hiring_review)) as review_count,
  COUNT(*) FILTER (WHERE id IN (SELECT id FROM v_hiring_background)) as background_count,
  COUNT(*) FILTER (WHERE review_status = 'approved') as approved_count,
  COUNT(*) FILTER (WHERE review_status = 'rejected') as rejected_count,
  COUNT(*) as total_count
FROM hiring_signals
GROUP BY tenant_id;
