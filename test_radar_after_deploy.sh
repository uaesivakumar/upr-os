#!/bin/bash

echo "🧪 RADAR Post-Deployment Verification"
echo "======================================"
echo ""

# Test 1: Check database
echo "Test 1: Database Runs"
echo "---------------------"
DB_URL=$(gcloud secrets versions access latest --secret="DATABASE_URL" 2>/dev/null)
if [ -z "$DB_URL" ]; then
    echo "❌ Failed to get DATABASE_URL from secrets"
    exit 1
fi

psql "$DB_URL" -c "SELECT run_id, status, companies_found, companies_accepted, cost_usd, created_at FROM discovery_runs ORDER BY created_at DESC LIMIT 5;" 2>&1 | head -20

echo ""
echo "Test 2: API Health Check"
echo "------------------------"
PROD_URL="https://upr-web-service-191599223867.us-central1.run.app"
curl -s "$PROD_URL/api/radar/health" | python3 -m json.tool

echo ""
echo "Test 3: Cloud Run Logs (Recent RADAR Activity)"
echo "-----------------------------------------------"
echo "Checking for errors in last 20 logs..."
gcloud run services logs read upr-web-service --limit=20 --region=us-central1 --format=json 2>&1 | grep -i "error\|failed" | head -10 || echo "✅ No errors found"

echo ""
echo "Test 4: Database Discovery Sources"
echo "-----------------------------------"
psql "$DB_URL" -c "SELECT name, type, enabled, avg_precision, avg_cpa_usd FROM discovery_sources ORDER BY name;" 2>&1 | head -15

echo ""
echo "======================================"
echo "✅ Verification complete!"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Open: https://upr.sivakumar.ai/radar"
echo "2. Open DevTools Console (F12 > Console)"
echo "3. Look for [RADAR] logs"
echo "4. Expected behavior:"
echo "   - Page loads showing existing runs in table"
echo "   - Console shows: '[RADAR] 📡 Fetching data...'"
echo "   - Console shows: '[RADAR] ✅ State updated: {runsCount: N}'"
echo "5. Click: 'Start Radar Run' button"
echo "6. Expected:"
echo "   - Console shows: '[RADAR] 🚀 Starting manual run...'"
echo "   - Console shows: '[RADAR] ✅ Run created: <uuid>'"
echo "   - New run appears in table immediately"
echo "   - Auto-refresh starts (every 15 seconds)"
echo ""
echo "🐛 IF ISSUES:"
echo "- Check console for [RADAR] error logs"
echo "- Look for 401 unauthorized (auth issue)"
echo "- Look for API response errors"
echo "- Run: gcloud run services logs tail upr-web-service"
echo ""
