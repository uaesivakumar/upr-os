-- Email Pattern Intelligence System (Week 1 Day 1-2) - SAFE ALTER VERSION
-- Extends existing email_patterns table with new columns for RAG system
-- Uses ALTER TABLE to preserve existing data

BEGIN;

-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1: Extend existing email_patterns table
-- ═══════════════════════════════════════════════════════════════════════

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Context metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='region') THEN
    ALTER TABLE email_patterns ADD COLUMN region TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='sector') THEN
    ALTER TABLE email_patterns ADD COLUMN sector TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='company_size') THEN
    ALTER TABLE email_patterns ADD COLUMN company_size TEXT;
  END IF;

  -- Health indicators
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='mx_ok') THEN
    ALTER TABLE email_patterns ADD COLUMN mx_ok BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='catch_all') THEN
    ALTER TABLE email_patterns ADD COLUMN catch_all BOOLEAN DEFAULT false;
  END IF;

  -- Provenance (rename source to last_source if needed)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='last_source') THEN
    ALTER TABLE email_patterns ADD COLUMN last_source TEXT DEFAULT 'manual';
    -- Copy existing source values to last_source
    UPDATE email_patterns SET last_source = COALESCE(source, 'manual');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='verified_at') THEN
    ALTER TABLE email_patterns ADD COLUMN verified_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Usage tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='usage_count') THEN
    ALTER TABLE email_patterns ADD COLUMN usage_count INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='last_used_at') THEN
    ALTER TABLE email_patterns ADD COLUMN last_used_at TIMESTAMPTZ;
  END IF;

  -- Validation stats
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='validation_attempts') THEN
    ALTER TABLE email_patterns ADD COLUMN validation_attempts INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='validation_successes') THEN
    ALTER TABLE email_patterns ADD COLUMN validation_successes INT DEFAULT 0;
  END IF;

  -- RAG vector embedding (384 dimensions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_patterns' AND column_name='embedding') THEN
    ALTER TABLE email_patterns ADD COLUMN embedding VECTOR(384);
  END IF;

  RAISE NOTICE 'Added new columns to email_patterns table';
END $$;

-- Add confidence constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_patterns_confidence_check') THEN
    ALTER TABLE email_patterns ADD CONSTRAINT email_patterns_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Add last_source constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_patterns_last_source_check') THEN
    ALTER TABLE email_patterns ADD CONSTRAINT email_patterns_last_source_check
      CHECK (last_source IN ('rag', 'rules', 'llm', 'nb', 'hybrid', 'manual', 'unknown'));
  END IF;
END $$;

-- Add comments
COMMENT ON TABLE email_patterns IS 'Learned email patterns with vector embeddings for RAG similarity search';
COMMENT ON COLUMN email_patterns.embedding IS 'Vector embedding (384-dim) for similarity search';
COMMENT ON COLUMN email_patterns.last_source IS 'How pattern was discovered: rag/rules/llm/nb/hybrid/manual';

-- Create new indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_email_patterns_vec
  ON email_patterns USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_email_patterns_region
  ON email_patterns(region) WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_patterns_sector
  ON email_patterns(sector) WHERE sector IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_patterns_confidence_desc
  ON email_patterns(confidence DESC) WHERE confidence IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_patterns_usage
  ON email_patterns(usage_count DESC, last_used_at DESC NULLS LAST);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2: Create feedback loop table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pattern_feedback (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  pattern TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('valid', 'bounce', 'unknown', 'delivered', 'replied')),
  email TEXT,
  lead_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE pattern_feedback IS 'Delivery feedback (bounce/valid/delivered) for self-learning';

CREATE INDEX IF NOT EXISTS idx_pattern_feedback_domain
  ON pattern_feedback(domain);

CREATE INDEX IF NOT EXISTS idx_pattern_feedback_event
  ON pattern_feedback(event);

CREATE INDEX IF NOT EXISTS idx_pattern_feedback_created
  ON pattern_feedback(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3: Create domain health cache
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS domain_health (
  domain TEXT PRIMARY KEY,
  mx_ok BOOLEAN DEFAULT true,
  mx_records TEXT[],
  catch_all BOOLEAN DEFAULT false,
  last_checked TIMESTAMPTZ DEFAULT now(),
  check_count INT DEFAULT 0,
  last_error TEXT
);

COMMENT ON TABLE domain_health IS '24-hour cache for MX and catch-all checks';

CREATE INDEX IF NOT EXISTS idx_domain_health_checked
  ON domain_health(last_checked)
  WHERE last_checked < now() - INTERVAL '24 hours';

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 4: Create enrichment telemetry
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS enrichment_telemetry (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  domain TEXT NOT NULL,

  -- Layer performance
  layer_used TEXT NOT NULL CHECK (layer_used IN ('rag', 'rules', 'llm', 'nb_fallback')),
  rag_hit BOOLEAN DEFAULT false,
  rag_confidence DOUBLE PRECISION,
  rules_confidence DOUBLE PRECISION,
  llm_called BOOLEAN DEFAULT false,
  llm_confidence DOUBLE PRECISION,

  -- Costs
  llm_cost_cents DOUBLE PRECISION DEFAULT 0,
  nb_calls INT DEFAULT 0,
  nb_cost_cents DOUBLE PRECISION DEFAULT 0,
  total_cost_cents DOUBLE PRECISION DEFAULT 0,

  -- Performance
  latency_ms INT,

  -- Results
  pattern_found TEXT,
  final_confidence DOUBLE PRECISION,
  emails_generated INT DEFAULT 0,
  emails_validated INT DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE enrichment_telemetry IS 'Observability: cost, latency, and layer performance per enrichment';

CREATE INDEX IF NOT EXISTS idx_enrichment_telemetry_domain
  ON enrichment_telemetry(domain);

CREATE INDEX IF NOT EXISTS idx_enrichment_telemetry_created
  ON enrichment_telemetry(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrichment_telemetry_layer
  ON enrichment_telemetry(layer_used, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 5: Create helper functions
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_pattern_usage(p_domain TEXT)
RETURNS void AS $func$
BEGIN
  UPDATE email_patterns
  SET
    usage_count = usage_count + 1,
    last_used_at = now(),
    updated_at = now()
  WHERE domain = p_domain;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_pattern_success_rate(p_domain TEXT)
RETURNS DOUBLE PRECISION AS $func$
DECLARE
  v_success_rate DOUBLE PRECISION;
BEGIN
  SELECT
    CASE
      WHEN validation_attempts = 0 THEN NULL
      ELSE ROUND((validation_successes::NUMERIC / validation_attempts), 3)
    END INTO v_success_rate
  FROM email_patterns
  WHERE domain = p_domain;

  RETURN v_success_rate;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_pattern_validation(
  p_domain TEXT,
  p_success BOOLEAN
)
RETURNS void AS $func$
BEGIN
  UPDATE email_patterns
  SET
    validation_attempts = validation_attempts + 1,
    validation_successes = validation_successes + CASE WHEN p_success THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE domain = p_domain;
END;
$func$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 6: Create performance views
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_pattern_performance AS
SELECT
  domain,
  pattern,
  confidence,
  region,
  sector,
  company_size,
  last_source,
  usage_count,
  last_used_at,
  validation_attempts,
  validation_successes,
  CASE
    WHEN validation_attempts = 0 THEN NULL
    ELSE ROUND((validation_successes::NUMERIC / validation_attempts), 3)
  END as success_rate,
  ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(verified_at, created_at))) / 86400, 1) as age_days,
  catch_all,
  mx_ok,
  COALESCE(verified_at, created_at) as verified_at,
  created_at,
  updated_at
FROM email_patterns
ORDER BY usage_count DESC, confidence DESC NULLS LAST;

CREATE OR REPLACE VIEW v_enrichment_costs AS
SELECT
  layer_used,
  COUNT(*) as total_enrichments,
  SUM(llm_called::int) as llm_calls,
  ROUND(AVG(llm_cost_cents), 4) as avg_llm_cost_cents,
  ROUND(AVG(nb_cost_cents), 4) as avg_nb_cost_cents,
  ROUND(AVG(total_cost_cents), 4) as avg_total_cost_cents,
  ROUND(AVG(latency_ms), 0) as avg_latency_ms,
  ROUND(AVG(final_confidence), 3) as avg_confidence,
  DATE(created_at) as date
FROM enrichment_telemetry
GROUP BY layer_used, DATE(created_at)
ORDER BY date DESC, total_enrichments DESC;

CREATE OR REPLACE VIEW v_pattern_feedback_summary AS
SELECT
  domain,
  COUNT(*) as total_events,
  SUM(CASE WHEN event = 'valid' THEN 1 ELSE 0 END) as valid_count,
  SUM(CASE WHEN event = 'bounce' THEN 1 ELSE 0 END) as bounce_count,
  SUM(CASE WHEN event = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
  SUM(CASE WHEN event = 'replied' THEN 1 ELSE 0 END) as replied_count,
  MAX(created_at) as last_feedback_at
FROM pattern_feedback
GROUP BY domain
ORDER BY total_events DESC;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'pgvector extension' as check_name,
       CASE WHEN COUNT(*) > 0 THEN '✅ Enabled' ELSE '❌ Missing' END as status
FROM pg_extension WHERE extname = 'vector'
UNION ALL
SELECT 'email_patterns table',
       CASE WHEN COUNT(*) > 0 THEN '✅ Created' ELSE '❌ Missing' END
FROM information_schema.tables WHERE table_name = 'email_patterns'
UNION ALL
SELECT 'pattern_feedback table',
       CASE WHEN COUNT(*) > 0 THEN '✅ Created' ELSE '❌ Missing' END
FROM information_schema.tables WHERE table_name = 'pattern_feedback'
UNION ALL
SELECT 'domain_health table',
       CASE WHEN COUNT(*) > 0 THEN '✅ Created' ELSE '❌ Missing' END
FROM information_schema.tables WHERE table_name = 'domain_health'
UNION ALL
SELECT 'enrichment_telemetry table',
       CASE WHEN COUNT(*) > 0 THEN '✅ Created' ELSE '❌ Missing' END
FROM information_schema.tables WHERE table_name = 'enrichment_telemetry'
UNION ALL
SELECT 'Vector index',
       CASE WHEN COUNT(*) > 0 THEN '✅ Created' ELSE '❌ Missing' END
FROM pg_indexes WHERE tablename = 'email_patterns' AND indexname = 'idx_email_patterns_vec';
