#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════════════════════"
echo "SIGNAL DEDUPLICATION VERIFICATION"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Get DATABASE_URL
export DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not found in secrets"
  exit 1
fi

echo "✅ Connected to database"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# CHECK 1: No Duplicates Exist
# ═══════════════════════════════════════════════════════════════════════
echo "CHECK 1: Verifying no duplicate signals exist..."
echo "───────────────────────────────────────────────────────────────────────"

DUPLICATES=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM (
  SELECT
    tenant_id,
    LOWER(TRIM(company)),
    trigger_type,
    COALESCE(source_date, created_at::date),
    COUNT(*) as cnt
  FROM hiring_signals
  WHERE review_status = 'pending'
  GROUP BY
    tenant_id,
    LOWER(TRIM(company)),
    trigger_type,
    COALESCE(source_date, created_at::date)
  HAVING COUNT(*) > 1
) duplicates;
")

DUPLICATES=$(echo "$DUPLICATES" | tr -d ' ')

if [ "$DUPLICATES" = "0" ]; then
  echo "✅ PASS: No duplicate signals found"
else
  echo "❌ FAIL: Found $DUPLICATES duplicate signal groups"
  psql "$DATABASE_URL" <<'SQL'
SELECT
  company,
  trigger_type,
  source_date,
  COUNT(*) as duplicate_count
FROM hiring_signals
WHERE review_status = 'pending'
GROUP BY company, trigger_type, source_date
HAVING COUNT(*) > 1;
SQL
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# CHECK 2: UNIQUE Constraint Exists
# ═══════════════════════════════════════════════════════════════════════
echo "CHECK 2: Verifying UNIQUE constraint exists..."
echo "───────────────────────────────────────────────────────────────────────"

CONSTRAINT_EXISTS=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM pg_indexes
WHERE indexname = 'idx_hiring_signals_dedup';
")

CONSTRAINT_EXISTS=$(echo "$CONSTRAINT_EXISTS" | tr -d ' ')

if [ "$CONSTRAINT_EXISTS" = "1" ]; then
  echo "✅ PASS: UNIQUE constraint idx_hiring_signals_dedup exists"
else
  echo "❌ FAIL: UNIQUE constraint not found"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
# CHECK 3: G42 Signals Normalized
# ═══════════════════════════════════════════════════════════════════════
echo "CHECK 3: Verifying G42 signals normalized..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
SELECT
  company,
  COUNT(*) as total_signals,
  COUNT(DISTINCT trigger_type) as unique_triggers,
  SUM(hiring_likelihood_score) as composite_score,
  CASE
    WHEN SUM(hiring_likelihood_score) BETWEEN 9 AND 14 THEN '✅ CORRECT'
    WHEN SUM(hiring_likelihood_score) >= 20 THEN '❌ STILL INFLATED'
    ELSE '⚠️  UNEXPECTED'
  END as score_status,
  array_agg(DISTINCT trigger_type ORDER BY trigger_type) as triggers
FROM hiring_signals
WHERE company ILIKE '%G42%'
  AND review_status = 'pending'
GROUP BY company;
SQL

echo ""

# ═══════════════════════════════════════════════════════════════════════
# CHECK 4: Score Distribution
# ═══════════════════════════════════════════════════════════════════════
echo "CHECK 4: Overall score distribution..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
WITH company_scores AS (
  SELECT
    LOWER(TRIM(company)) as company_key,
    SUM(hiring_likelihood_score) as composite_score
  FROM hiring_signals
  WHERE review_status = 'pending'
  GROUP BY LOWER(TRIM(company))
)
SELECT
  CASE
    WHEN composite_score BETWEEN 1 AND 5 THEN '1-5 (Low)'
    WHEN composite_score BETWEEN 6 AND 10 THEN '6-10 (Medium)'
    WHEN composite_score BETWEEN 11 AND 15 THEN '11-15 (High)'
    WHEN composite_score >= 16 THEN '16+ (Critical)'
  END as score_range,
  COUNT(*) as company_count
FROM company_scores
GROUP BY
  CASE
    WHEN composite_score BETWEEN 1 AND 5 THEN '1-5 (Low)'
    WHEN composite_score BETWEEN 6 AND 10 THEN '6-10 (Medium)'
    WHEN composite_score BETWEEN 11 AND 15 THEN '11-15 (High)'
    WHEN composite_score >= 16 THEN '16+ (Critical)'
  END
ORDER BY
  CASE
    WHEN score_range = '1-5 (Low)' THEN 1
    WHEN score_range = '6-10 (Medium)' THEN 2
    WHEN score_range = '11-15 (High)' THEN 3
    WHEN score_range = '16+ (Critical)' THEN 4
  END;
SQL

echo ""

# ═══════════════════════════════════════════════════════════════════════
# CHECK 5: Top Scored Companies
# ═══════════════════════════════════════════════════════════════════════
echo "CHECK 5: Top 10 companies by score (after deduplication)..."
echo "───────────────────────────────────────────────────────────────────────"

psql "$DATABASE_URL" <<'SQL'
SELECT
  company,
  COUNT(*) as signals,
  COUNT(DISTINCT trigger_type) as unique_triggers,
  SUM(hiring_likelihood_score) as score,
  array_agg(DISTINCT trigger_type ORDER BY trigger_type) as triggers
FROM hiring_signals
WHERE review_status = 'pending'
GROUP BY company
ORDER BY SUM(hiring_likelihood_score) DESC
LIMIT 10;
SQL

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════════════════════════"
echo "VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════"

if [ "$DUPLICATES" = "0" ] && [ "$CONSTRAINT_EXISTS" = "1" ]; then
  echo "✅ ALL CHECKS PASSED"
  echo ""
  echo "Deduplication is working correctly:"
  echo "  - No duplicate signals in database"
  echo "  - UNIQUE constraint in place"
  echo "  - Scores normalized"
  echo ""
  echo "Safe to proceed with production use."
else
  echo "❌ SOME CHECKS FAILED"
  echo ""
  echo "Issues found:"
  [ "$DUPLICATES" != "0" ] && echo "  - Duplicates still exist: $DUPLICATES groups"
  [ "$CONSTRAINT_EXISTS" != "1" ] && echo "  - UNIQUE constraint missing"
  echo ""
  echo "Review migration and fix issues before deploying."
fi

echo "═══════════════════════════════════════════════════════════════════════"
