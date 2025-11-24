#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════════════════════"
echo "SIGNAL DEDUPLICATION FIX DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Get DATABASE_URL
export DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not found in secrets"
  exit 1
fi

echo "✅ DATABASE_URL loaded from secrets"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 1: Backup Current Signals
# ═══════════════════════════════════════════════════════════════════════
echo "STEP 1: Creating backup of hiring_signals table..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
-- Create backup table
CREATE TABLE IF NOT EXISTS hiring_signals_backup_20251023 AS
SELECT * FROM hiring_signals;

-- Show backup count
SELECT
  COUNT(*) as backup_count,
  COUNT(*) FILTER (WHERE review_status = 'pending') as pending_count
FROM hiring_signals_backup_20251023;

\echo ''
\echo '✅ Backup created: hiring_signals_backup_20251023'
SQL

echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 2: Show Before Stats
# ═══════════════════════════════════════════════════════════════════════
echo "STEP 2: Analyzing current state (BEFORE fix)..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
\echo 'Current duplicate signals by company:'
\echo ''

SELECT
  company,
  COUNT(*) as total_signals,
  COUNT(DISTINCT trigger_type) as unique_triggers,
  SUM(hiring_likelihood_score) as composite_score,
  array_agg(DISTINCT trigger_type ORDER BY trigger_type) as triggers
FROM hiring_signals
WHERE review_status = 'pending'
GROUP BY company
HAVING COUNT(*) > COUNT(DISTINCT trigger_type)
ORDER BY COUNT(*) DESC
LIMIT 10;

\echo ''
\echo 'G42 signals (BEFORE):'

SELECT
  company,
  trigger_type,
  source_date,
  hiring_likelihood_score,
  created_at
FROM hiring_signals
WHERE company ILIKE '%G42%'
  AND review_status = 'pending'
ORDER BY created_at DESC;

\echo ''
\echo 'Overall stats (BEFORE):'

SELECT
  COUNT(*) as total_signals,
  COUNT(DISTINCT LOWER(TRIM(company))) as unique_companies,
  COUNT(*) - COUNT(DISTINCT (LOWER(TRIM(company)), trigger_type, COALESCE(source_date, created_at::date))) as estimated_duplicates
FROM hiring_signals
WHERE review_status = 'pending';
SQL

echo ""
read -p "Press Enter to continue with migration..."
echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 3: Run Migration
# ═══════════════════════════════════════════════════════════════════════
echo "STEP 3: Running deduplication migration..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" -f db/migrations/2025_10_23_fix_signal_duplication.sql

echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 4: Verify Deduplication
# ═══════════════════════════════════════════════════════════════════════
echo "STEP 4: Verifying deduplication (AFTER fix)..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
\echo 'G42 signals (AFTER):'

SELECT
  company,
  COUNT(*) as total_signals,
  COUNT(DISTINCT trigger_type) as unique_triggers,
  SUM(hiring_likelihood_score) as composite_score,
  array_agg(DISTINCT trigger_type ORDER BY trigger_type) as triggers
FROM hiring_signals
WHERE company ILIKE '%G42%'
  AND review_status = 'pending'
GROUP BY company;

\echo ''
\echo 'Overall stats (AFTER):'

SELECT
  COUNT(*) as total_signals,
  COUNT(DISTINCT LOWER(TRIM(company))) as unique_companies
FROM hiring_signals
WHERE review_status = 'pending';

\echo ''
\echo 'Checking for remaining duplicates (should be 0):'

SELECT
  company,
  trigger_type,
  COUNT(*) as duplicate_count
FROM hiring_signals
WHERE review_status = 'pending'
GROUP BY company, trigger_type, COALESCE(source_date, created_at::date)
HAVING COUNT(*) > 1;

\echo ''
\echo 'Before/After comparison:'

SELECT
  'BEFORE' as status,
  COUNT(*) as total_rows
FROM hiring_signals_backup_20251023

UNION ALL

SELECT
  'AFTER' as status,
  COUNT(*) as total_rows
FROM hiring_signals;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ MIGRATION COMPLETE"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Review the AFTER stats above"
echo "2. Verify G42 score reduced from 20 to 9-14"
echo "3. Deploy updated code: ./scripts/deploy-server.sh"
echo "4. Test with fresh RADAR run"
echo ""
