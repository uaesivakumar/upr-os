#!/bin/bash
# Sprint 23: Check shadow mode progress across all tools
# Usage: ./checkShadowModeProgress.sh

echo "══════════════════════════════════════════════════════════════"
echo "Shadow Mode Progress Report"
echo "Generated: $(date)"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Set database connection
export PGPASSWORD='SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU='
DB_HOST="34.121.0.240"
DB_USER="upr_app"
DB_NAME="upr_production"

# Overall statistics
echo "📊 OVERALL STATISTICS (Last 7 Days)"
echo "──────────────────────────────────────────────────────────────"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  COUNT(*) as total_decisions,
  COUNT(DISTINCT tool_name) as tools_with_data,
  MIN(created_at) as first_decision,
  MAX(created_at) as latest_decision
FROM agent_core.agent_decisions
WHERE created_at >= NOW() - INTERVAL '7 days';
" -t

echo ""
echo "📈 MATCH RATE BY TOOL (Last 7 Days)"
echo "──────────────────────────────────────────────────────────────"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  tool_name,
  rule_version,
  COUNT(*) as decisions,
  COUNT(CASE WHEN (output_data->'comparison'->>'match')::boolean = true THEN 1 END) as matches,
  ROUND(100.0 * COUNT(CASE WHEN (output_data->'comparison'->>'match')::boolean = true THEN 1 END) / COUNT(*), 2) as match_rate,
  ROUND(AVG((output_data->'comparison'->>'score_diff')::decimal), 2) as avg_diff
FROM agent_core.agent_decisions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY tool_name, rule_version
ORDER BY tool_name, rule_version;
"

echo ""
echo "📅 DAILY TRENDS (Last 7 Days)"
echo "──────────────────────────────────────────────────────────────"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  DATE(created_at) as date,
  COUNT(*) as decisions,
  COUNT(CASE WHEN (output_data->'comparison'->>'match')::boolean = true THEN 1 END) as matches,
  ROUND(100.0 * COUNT(CASE WHEN (output_data->'comparison'->>'match')::boolean = true THEN 1 END) / COUNT(*), 2) as match_rate
FROM agent_core.agent_decisions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
"

echo ""
echo "🔍 TOP 5 MISMATCHES (Last 24 Hours)"
echo "──────────────────────────────────────────────────────────────"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  tool_name,
  (output_data->'inline'->>'quality_score')::int as inline,
  (output_data->'rule'->>'score')::int as rule,
  ABS((output_data->'comparison'->>'score_diff')::decimal) as diff,
  LEFT((input_data->>'company_name')::text, 30) as company
FROM agent_core.agent_decisions
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND (output_data->'comparison'->>'match')::boolean = false
ORDER BY ABS((output_data->'comparison'->>'score_diff')::decimal) DESC
LIMIT 5;
"

echo ""
echo "🎯 SPRINT 23 PROGRESS TRACKER"
echo "──────────────────────────────────────────────────────────────"
echo "Target: 500-1000 real decisions collected (across all 4 tools)"

# Count decisions for each tool (since Sprint 23 start: Nov 15, 2025)
COMPANY_QUALITY_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM agent_core.agent_decisions
WHERE tool_name = 'CompanyQualityTool'
  AND created_at >= '2025-11-15';
" | xargs)

CONTACT_TIER_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM agent_core.agent_decisions
WHERE tool_name = 'ContactTierTool'
  AND created_at >= '2025-11-15';
" | xargs)

TIMING_SCORE_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM agent_core.agent_decisions
WHERE tool_name = 'TimingScoreTool'
  AND created_at >= '2025-11-15';
" | xargs)

BANKING_PRODUCT_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM agent_core.agent_decisions
WHERE tool_name = 'BankingProductMatchTool'
  AND created_at >= '2025-11-15';
" | xargs)

TOTAL_COUNT=$((COMPANY_QUALITY_COUNT + CONTACT_TIER_COUNT + TIMING_SCORE_COUNT + BANKING_PRODUCT_COUNT))

echo "✓ CompanyQualityTool: $COMPANY_QUALITY_COUNT decisions"
echo "✓ ContactTierTool: $CONTACT_TIER_COUNT decisions"
echo "✓ TimingScoreTool: $TIMING_SCORE_COUNT decisions"
echo "✓ BankingProductMatchTool: $BANKING_PRODUCT_COUNT decisions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TOTAL: $TOTAL_COUNT decisions"

# Progress bar based on total decisions across all 4 tools
if [ $TOTAL_COUNT -ge 1000 ]; then
  echo "  [████████████████████] 100% - Ready for final tuning!"
elif [ $TOTAL_COUNT -ge 500 ]; then
  PERCENT=$((TOTAL_COUNT * 100 / 1000))
  echo "  [██████████          ] ${PERCENT}% - Halfway there!"
elif [ $TOTAL_COUNT -ge 100 ]; then
  PERCENT=$((TOTAL_COUNT * 100 / 1000))
  echo "  [████                ] ${PERCENT}% - Good start!"
else
  PERCENT=$((TOTAL_COUNT * 100 / 1000))
  echo "  [█                   ] ${PERCENT}% - Just getting started"
fi

echo ""
echo "📋 NEXT STEPS"
echo "──────────────────────────────────────────────────────────────"
if [ $TOTAL_COUNT -lt 500 ]; then
  echo "⏳ Continue monitoring - need $(( 500 - TOTAL_COUNT )) more decisions"
  echo "💡 Tip: Run this script daily to track progress"
elif [ $TOTAL_COUNT -lt 1000 ]; then
  echo "🎯 Approaching target - consider analyzing patterns"
  echo "💡 Check per-tool match rates and edge cases"
else
  echo "✅ Target reached! Ready for final tuning iteration"
  echo "💡 Next: Analyze top mismatches per tool and adjust rules"
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
