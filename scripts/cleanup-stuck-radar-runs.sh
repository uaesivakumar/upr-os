#!/bin/bash
# Cleanup stuck RADAR discovery runs
# Usage: ./scripts/cleanup-stuck-radar-runs.sh
# Cron: 0 */6 * * * (every 6 hours)

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 RADAR Run Cleanup - Stuck Runs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

export PGPASSWORD='UprApp2025!Pass31cd5b023e349c88'
DB_HOST="34.121.0.240"
DB_USER="upr_app"
DB_NAME="upr_production"

# Timeout threshold: runs stuck for more than 2 hours
TIMEOUT_HOURS=2

echo "Checking for stuck RADAR runs (running > ${TIMEOUT_HOURS} hours)..."
echo ""

# Find and fix stuck runs
STUCK_RUNS=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM discovery_runs
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '${TIMEOUT_HOURS} hours';
")

if [ "$STUCK_RUNS" -gt 0 ]; then
  echo "⚠️  Found $STUCK_RUNS stuck run(s)"
  echo ""

  # Show stuck runs
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT
    run_id,
    trigger,
    started_at,
    EXTRACT(EPOCH FROM (NOW() - started_at))/3600 as hours_stuck,
    companies_found
  FROM discovery_runs
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '${TIMEOUT_HOURS} hours'
  ORDER BY started_at;
  "

  echo ""
  echo "Marking stuck runs as failed..."

  # Update stuck runs
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  UPDATE discovery_runs
  SET
    status = 'failed',
    ended_at = NOW(),
    error_summary = 'Auto-timeout: Run exceeded ${TIMEOUT_HOURS} hour limit - likely worker crash or initialization failure'
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '${TIMEOUT_HOURS} hours'
  RETURNING run_id, started_at, ended_at;
  "

  echo ""
  echo "✅ Cleaned up $STUCK_RUNS stuck run(s)"

else
  echo "✅ No stuck runs found (all healthy)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking for completed runs missing ended_at..."
echo ""

# Fix completed runs that don't have ended_at set
INCOMPLETE_RUNS=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM discovery_runs
WHERE status = 'completed'
  AND ended_at IS NULL;
")

if [ "$INCOMPLETE_RUNS" -gt 0 ]; then
  echo "⚠️  Found $INCOMPLETE_RUNS completed run(s) without ended_at"
  echo ""

  # Set ended_at to created_at + 5 minutes (estimate)
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  UPDATE discovery_runs
  SET ended_at = started_at + INTERVAL '5 minutes'
  WHERE status = 'completed'
    AND ended_at IS NULL
  RETURNING run_id, started_at, ended_at;
  "

  echo ""
  echo "✅ Fixed $INCOMPLETE_RUNS incomplete run(s)"
else
  echo "✅ All completed runs have proper timestamps"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get stats
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  status,
  COUNT(*) as count,
  AVG(companies_found) as avg_companies,
  MAX(started_at) as last_run
FROM discovery_runs
GROUP BY status
ORDER BY count DESC;
"

echo ""
echo "✅ RADAR run cleanup complete"
echo ""
