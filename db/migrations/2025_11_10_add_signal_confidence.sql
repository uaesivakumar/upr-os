-- Migration: Add Signal Confidence Scoring
-- Date: 2025-11-10
-- Sprint 18, Task 7: Signal Confidence Scoring
--
-- Purpose: Add confidence scores to hiring signals based on source quality,
--          freshness, and data completeness
--
-- Confidence Formula:
-- - 40% Source Credibility (from SIVA Tool 14 reliability score 0-100)
-- - 30% Freshness (days since source_date, exponential decay)
-- - 30% Completeness (% of key fields populated)
--
-- Output: confidence_score (0.00 to 1.00)

-- Step 1: Add confidence_score and source_type columns
ALTER TABLE hiring_signals
  ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1.00),
  ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('NEWS', 'JOB_BOARD', 'CORPORATE_WEBSITE', 'SOCIAL_MEDIA', 'BLOG', 'UNKNOWN'));

-- Add index for confidence-based queries
CREATE INDEX IF NOT EXISTS ix_hs_confidence_score ON hiring_signals(confidence_score DESC NULLS LAST);

-- Composite index for confidence + review status
CREATE INDEX IF NOT EXISTS ix_hs_confidence_review ON hiring_signals(confidence_score DESC, review_status);

-- Step 2: Create function to calculate confidence score
CREATE OR REPLACE FUNCTION calculate_signal_confidence(
  p_source_reliability_score INTEGER,  -- 0-100 from SIVA Tool 14
  p_source_date DATE,                  -- Signal date
  p_description TEXT,                  -- Signal description
  p_evidence_quote TEXT,               -- Evidence quote
  p_company TEXT,                      -- Company name
  p_domain TEXT,                       -- Company domain
  p_trigger_type TEXT                  -- Trigger type
) RETURNS DECIMAL(3, 2) AS $$
DECLARE
  v_source_score DECIMAL(3, 2);
  v_freshness_score DECIMAL(3, 2);
  v_completeness_score DECIMAL(3, 2);
  v_confidence DECIMAL(3, 2);
  v_days_old INTEGER;
BEGIN
  -- 1. SOURCE CREDIBILITY (40% weight)
  -- Convert 0-100 reliability score to 0-1 scale
  IF p_source_reliability_score IS NULL THEN
    -- Default to 0.5 if not available
    v_source_score := 0.5;
  ELSE
    v_source_score := LEAST(p_source_reliability_score / 100.0, 1.0);
  END IF;

  -- 2. FRESHNESS (30% weight)
  -- Exponential decay: Fresh signals (0-7 days) = 1.0, older signals decay
  IF p_source_date IS NULL THEN
    -- If no date, assume moderate freshness
    v_freshness_score := 0.5;
  ELSE
    v_days_old := CURRENT_DATE - p_source_date;

    IF v_days_old < 0 THEN
      -- Future dates = max freshness (edge case)
      v_freshness_score := 1.0;
    ELSIF v_days_old <= 7 THEN
      -- Very fresh (0-7 days) = 1.0
      v_freshness_score := 1.0;
    ELSIF v_days_old <= 30 THEN
      -- Recent (8-30 days) = 0.8
      v_freshness_score := 0.8;
    ELSIF v_days_old <= 90 THEN
      -- Moderately fresh (31-90 days) = 0.6
      v_freshness_score := 0.6;
    ELSIF v_days_old <= 180 THEN
      -- Older (91-180 days) = 0.4
      v_freshness_score := 0.4;
    ELSE
      -- Very old (180+ days) = 0.2
      v_freshness_score := 0.2;
    END IF;
  END IF;

  -- 3. COMPLETENESS (30% weight)
  -- Check if key fields are populated (7 key fields)
  v_completeness_score := 0.0;

  -- Company (mandatory, always counted)
  IF p_company IS NOT NULL AND LENGTH(TRIM(p_company)) > 0 THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Domain
  IF p_domain IS NOT NULL AND LENGTH(TRIM(p_domain)) > 0 THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Trigger type
  IF p_trigger_type IS NOT NULL AND LENGTH(TRIM(p_trigger_type)) > 0 THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Description (must be meaningful, >20 chars)
  IF p_description IS NOT NULL AND LENGTH(TRIM(p_description)) > 20 THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Evidence quote (must be meaningful, >30 chars)
  IF p_evidence_quote IS NOT NULL AND LENGTH(TRIM(p_evidence_quote)) > 30 THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Source date
  IF p_source_date IS NOT NULL THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- Domain (bonus check - if domain matches company pattern)
  IF p_domain IS NOT NULL AND p_company IS NOT NULL AND
     (p_domain ILIKE '%' || SPLIT_PART(p_company, ' ', 1) || '%' OR
      p_company ILIKE '%' || SPLIT_PART(p_domain, '.', 1) || '%') THEN
    v_completeness_score := v_completeness_score + (1.0 / 7.0);
  END IF;

  -- 4. CALCULATE WEIGHTED CONFIDENCE
  -- Formula: 40% source + 30% freshness + 30% completeness
  v_confidence :=
    (v_source_score * 0.4) +
    (v_freshness_score * 0.3) +
    (v_completeness_score * 0.3);

  -- Ensure result is within bounds
  v_confidence := LEAST(GREATEST(v_confidence, 0.0), 1.0);

  RETURN ROUND(v_confidence::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_signal_confidence IS
  'Calculates signal confidence score (0.00-1.00) based on: ' ||
  '40% source reliability, 30% freshness, 30% completeness. ' ||
  'Used by RADAR to prioritize high-confidence signals.';

-- Step 3: Create helper function to extract source type from URL
CREATE OR REPLACE FUNCTION extract_source_type_from_url(source_url TEXT)
RETURNS TEXT AS $$
BEGIN
  IF source_url IS NULL THEN
    RETURN 'UNKNOWN';
  END IF;

  -- Job boards
  IF source_url ILIKE '%linkedin.com/jobs%' OR
     source_url ILIKE '%bayt.com%' OR
     source_url ILIKE '%naukrigulf.com%' OR
     source_url ILIKE '%indeed.ae%' OR
     source_url ILIKE '%glassdoor.com%' THEN
    RETURN 'JOB_BOARD';
  END IF;

  -- News sites
  IF source_url ILIKE '%gulfnews.com%' OR
     source_url ILIKE '%khaleejtimes.com%' OR
     source_url ILIKE '%thenationalnews.com%' OR
     source_url ILIKE '%arabianbusiness.com%' OR
     source_url ILIKE '%reuters.com%' OR
     source_url ILIKE '%bloomberg.com%' OR
     source_url ILIKE '%zawya.com%' OR
     source_url ILIKE '%tradearabia.com%' OR
     source_url ILIKE '%menafn.com%' THEN
    RETURN 'NEWS';
  END IF;

  -- Social media
  IF source_url ILIKE '%linkedin.com/posts%' OR
     source_url ILIKE '%linkedin.com/feed%' OR
     source_url ILIKE '%twitter.com%' OR
     source_url ILIKE '%facebook.com%' THEN
    RETURN 'SOCIAL_MEDIA';
  END IF;

  -- Blogs
  IF source_url ILIKE '%medium.com%' OR
     source_url ILIKE '%wordpress.com%' OR
     source_url ILIKE '%blog%' THEN
    RETURN 'BLOG';
  END IF;

  -- Corporate websites (has common TLDs but not matching above patterns)
  IF source_url ILIKE '%.com%' OR
     source_url ILIKE '%.ae%' OR
     source_url ILIKE '%.org%' OR
     source_url ILIKE '%.net%' THEN
    RETURN 'CORPORATE_WEBSITE';
  END IF;

  RETURN 'UNKNOWN';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_source_type_from_url IS
  'Extracts source type from URL pattern matching. ' ||
  'Returns: NEWS, JOB_BOARD, CORPORATE_WEBSITE, SOCIAL_MEDIA, BLOG, or UNKNOWN.';

-- Step 4: Verification query
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Signal Confidence Scoring Migration Complete';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Added columns:';
  RAISE NOTICE '   - confidence_score (DECIMAL 0.00-1.00)';
  RAISE NOTICE '   - source_type (TEXT)';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Added indexes:';
  RAISE NOTICE '   - ix_hs_confidence_score (confidence DESC)';
  RAISE NOTICE '   - ix_hs_confidence_review (confidence DESC, review_status)';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created functions:';
  RAISE NOTICE '   - calculate_signal_confidence()';
  RAISE NOTICE '   - extract_source_type_from_url()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run backfill script to populate existing signals';
  RAISE NOTICE '2. Update radarAgent.js to calculate confidence on new signals';
  RAISE NOTICE '3. Update UI to display confidence indicators';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
