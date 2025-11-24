-- Backfill Signal Confidence Scores (SQL-based)
-- Sprint 18, Task 7: Signal Confidence Scoring
--
-- This script updates all hiring_signals that don't have confidence_score
-- or source_type populated.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/backfillSignalConfidenceSQL.sql

-- Step 1: Extract source reliability scores from SIVA metadata
-- This creates a temporary function to parse the JSON from notes field
CREATE OR REPLACE FUNCTION extract_source_reliability_from_notes(notes_text TEXT)
RETURNS INTEGER AS $$
DECLARE
  metadata_json JSONB;
  reliability_score INTEGER;
BEGIN
  -- Extract SIVA metadata JSON from notes
  IF notes_text IS NULL OR notes_text = '' THEN
    RETURN NULL;
  END IF;

  -- Find [SIVA_PHASE2_METADATA] section
  IF notes_text NOT LIKE '%[SIVA_PHASE2_METADATA]%' THEN
    RETURN NULL;
  END IF;

  -- Extract JSON after the marker
  BEGIN
    -- Get everything after [SIVA_PHASE2_METADATA]
    metadata_json := (
      SELECT jsonb_extract_path_text(
        substring(notes_text FROM '\[SIVA_PHASE2_METADATA\]\s*(\{.*\})$')::jsonb,
        'source', 'reliability_score'
      )::INTEGER
    );

    RETURN metadata_json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Update all signals with missing confidence_score
DO $$
DECLARE
  v_total_signals INTEGER;
  v_updated_signals INTEGER;
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_duration INTERVAL;
BEGIN
  v_start_time := clock_timestamp();

  -- Count signals needing update
  SELECT COUNT(*) INTO v_total_signals
  FROM hiring_signals
  WHERE confidence_score IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Signal Confidence Backfill';
  RAISE NOTICE 'Sprint 18, Task 7';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Signals to process: %', v_total_signals;
  RAISE NOTICE 'Starting backfill...';
  RAISE NOTICE '';

  -- Update confidence_score and source_type
  WITH updated AS (
    UPDATE hiring_signals
    SET
      confidence_score = calculate_signal_confidence(
        COALESCE(extract_source_reliability_from_notes(notes), 50), -- Default to 50 if not found
        source_date,
        description,
        evidence_quote,
        company,
        domain,
        trigger_type
      ),
      source_type = extract_source_type_from_url(source_url),
      updated_at = NOW()
    WHERE confidence_score IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated_signals FROM updated;

  v_end_time := clock_timestamp();
  v_duration := v_end_time - v_start_time;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BACKFILL COMPLETE';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Total processed: %', v_total_signals;
  RAISE NOTICE '✅ Total updated: %', v_updated_signals;
  RAISE NOTICE '⏱️  Duration: %', v_duration;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- Step 3: Show sample of updated signals
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Sample of backfilled signals:';
  RAISE NOTICE '─────────────────────────────────────────────────────────';

  FOR rec IN (
    SELECT
      company,
      trigger_type,
      confidence_score,
      source_type,
      CASE
        WHEN confidence_score >= 0.75 THEN 'HIGH'
        WHEN confidence_score >= 0.50 THEN 'MEDIUM'
        ELSE 'LOW'
      END as confidence_level,
      TO_CHAR(source_date, 'YYYY-MM-DD') as source_date
    FROM hiring_signals
    WHERE confidence_score IS NOT NULL
    ORDER BY confidence_score DESC
    LIMIT 10
  )
  LOOP
    RAISE NOTICE '% (%) | Confidence: % (%) | Type: % | Date: %',
      rec.company,
      rec.trigger_type,
      rec.confidence_score,
      rec.confidence_level,
      rec.source_type,
      rec.source_date;
  END LOOP;

  RAISE NOTICE '─────────────────────────────────────────────────────────';
END $$;

-- Step 4: Show confidence distribution
DO $$
DECLARE
  v_high_count INTEGER;
  v_medium_count INTEGER;
  v_low_count INTEGER;
  v_total_count INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE confidence_score >= 0.75),
    COUNT(*) FILTER (WHERE confidence_score >= 0.50 AND confidence_score < 0.75),
    COUNT(*) FILTER (WHERE confidence_score < 0.50),
    COUNT(*)
  INTO v_high_count, v_medium_count, v_low_count, v_total_count
  FROM hiring_signals
  WHERE confidence_score IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE 'Confidence Distribution:';
  RAISE NOTICE '─────────────────────────────────────────────────────────';
  RAISE NOTICE 'HIGH (0.75-1.00):   % signals (%% of total)',
    v_high_count,
    ROUND(v_high_count::NUMERIC / NULLIF(v_total_count, 0) * 100, 1);
  RAISE NOTICE 'MEDIUM (0.50-0.74): % signals (%% of total)',
    v_medium_count,
    ROUND(v_medium_count::NUMERIC / NULLIF(v_total_count, 0) * 100, 1);
  RAISE NOTICE 'LOW (0.00-0.49):    % signals (%% of total)',
    v_low_count,
    ROUND(v_low_count::NUMERIC / NULLIF(v_total_count, 0) * 100, 1);
  RAISE NOTICE '─────────────────────────────────────────────────────────';
  RAISE NOTICE '';
END $$;

-- Cleanup temporary function
DROP FUNCTION IF EXISTS extract_source_reliability_from_notes(TEXT);
