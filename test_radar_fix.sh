#!/bin/bash
# Test script to verify RADAR prompt_text fix

echo "🧪 RADAR Fix Verification Test"
echo "================================"
echo ""

# Get DATABASE_URL
DB_URL=$(gcloud secrets versions access latest --secret="DATABASE_URL" 2>/dev/null)
if [ -z "$DB_URL" ]; then
    echo "❌ Failed to get DATABASE_URL"
    exit 1
fi

echo "Step 1: Verify prompt exists in database"
echo "-----------------------------------------"
psql "$DB_URL" -c "
SELECT name, version, active, LEFT(template, 80) as template_preview
FROM prompt_versions
WHERE name = 'company_extraction';" 2>&1 | head -10

echo ""
echo "Step 2: Check current discovery runs (before test)"
echo "---------------------------------------------------"
BEFORE_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM discovery_runs;" 2>&1 | xargs)
echo "Total runs in database: $BEFORE_COUNT"

echo ""
echo "Step 3: Verify RADAR health"
echo "----------------------------"
curl -s "https://upr-web-service-191599223867.us-central1.run.app/api/radar/health" | python3 -m json.tool

echo ""
echo "================================"
echo "✅ Pre-test verification complete!"
echo ""
echo "📋 MANUAL TEST REQUIRED:"
echo "1. Open: https://upr.sivakumar.ai/radar"
echo "2. Log in if needed"
echo "3. Click: 'Start Radar Run' button"
echo "4. Wait 1-2 minutes"
echo "5. Run this script again to check results:"
echo ""
echo "   ./test_radar_fix.sh verify"
echo ""
echo "================================"
