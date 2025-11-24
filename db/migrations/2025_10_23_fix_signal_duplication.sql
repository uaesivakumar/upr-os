-- Migration: Fix Hiring Signals Duplication
-- Date: 2025-10-23
-- Purpose: Prevent duplicate signals from inflating scores
--
-- BUG REPORT:
-- - Signals were being inserted on every RADAR run without deduplication
-- - Same signals counted multiple times (5 signals showing, only 2 unique types)
-- - Scores artificially inflated (20 instead of 9)
--
-- FIX:
-- - Add UNIQUE constraint on (tenant_id, company, trigger_type, source_date)
-- - Remove exact duplicates before adding constraint
-- - Enable ON CONFLICT DO UPDATE in radarAgent.js

-- Step 1: Remove exact duplicates (keep the most recent one)
-- This ensures we can add the UNIQUE constraint without violations
DO $$
DECLARE
  deleted_count INT;
BEGIN
  -- Delete duplicate signals, keeping only the most recent for each unique combination
  WITH duplicates AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY
          tenant_id,
          LOWER(TRIM(company)),
          trigger_type,
          COALESCE(source_date, created_at::date)
        ORDER BY created_at DESC, id DESC
      ) as row_num
    FROM hiring_signals
    WHERE review_status = 'pending'
  )
  DELETE FROM hiring_signals
  WHERE id IN (
    SELECT id FROM duplicates WHERE row_num > 1
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE '✅ Removed % duplicate signals', deleted_count;
END $$;

-- Step 2: Add UNIQUE constraint to prevent future duplicates
-- This ensures each company can only have ONE signal per trigger_type per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_hiring_signals_dedup
ON hiring_signals (
  tenant_id,
  LOWER(TRIM(company)),
  trigger_type,
  COALESCE(source_date, created_at::date)
)
WHERE review_status = 'pending';

COMMENT ON INDEX idx_hiring_signals_dedup IS
  'Prevents duplicate hiring signals for same company + trigger + date. ' ||
  'Only applies to pending signals (approved/rejected can have duplicates for historical tracking).';

-- Step 3: Verify the fix
DO $$
DECLARE
  total_signals INT;
  unique_combinations INT;
  duplicate_count INT;
BEGIN
  -- Count total pending signals
  SELECT COUNT(*) INTO total_signals
  FROM hiring_signals
  WHERE review_status = 'pending';

  -- Count unique combinations
  SELECT COUNT(DISTINCT (
    tenant_id,
    LOWER(TRIM(company)),
    trigger_type,
    COALESCE(source_date, created_at::date)
  )) INTO unique_combinations
  FROM hiring_signals
  WHERE review_status = 'pending';

  duplicate_count := total_signals - unique_combinations;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE 'DEDUPLICATION RESULTS';
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE 'Total pending signals: %', total_signals;
  RAISE NOTICE 'Unique combinations: %', unique_combinations;
  RAISE NOTICE 'Remaining duplicates: % (should be 0)', duplicate_count;
  RAISE NOTICE '';

  IF duplicate_count = 0 THEN
    RAISE NOTICE '✅ All duplicates removed successfully!';
  ELSE
    RAISE WARNING '⚠️  Found % remaining duplicates - manual review needed', duplicate_count;
  END IF;

  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;

-- Step 4: Show example companies before/after (for verification)
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Sample companies with multiple signals:';
  RAISE NOTICE '─────────────────────────────────────────────────';

  FOR rec IN (
    SELECT
      LOWER(TRIM(company)) as company_key,
      MAX(company) as company_name,
      COUNT(*) as total_signals,
      COUNT(DISTINCT trigger_type) as unique_triggers,
      SUM(hiring_likelihood_score) as total_score,
      array_agg(DISTINCT trigger_type ORDER BY trigger_type) as triggers
    FROM hiring_signals
    WHERE review_status = 'pending'
    GROUP BY LOWER(TRIM(company))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  )
  LOOP
    RAISE NOTICE 'Company: %', rec.company_name;
    RAISE NOTICE '  Signals: % (% unique types)', rec.total_signals, rec.unique_triggers;
    RAISE NOTICE '  Score: %', rec.total_score;
    RAISE NOTICE '  Triggers: %', array_to_string(rec.triggers, ', ');
    RAISE NOTICE '';
  END LOOP;

  RAISE NOTICE '─────────────────────────────────────────────────';
END $$;
