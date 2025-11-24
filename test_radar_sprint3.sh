#!/bin/bash

################################################################################
# UPR Phase 1 Sprint 3 - First Discovery Run Test Script
#
# This script guides you through testing the RADAR discovery pipeline
# Execute each section and verify results before proceeding
################################################################################

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL="https://upr-web-service-191599223867.us-central1.run.app"
TOKEN=""  # You'll set this after login

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   UPR SPRINT 3 - FIRST DISCOVERY RUN TEST SCRIPT          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

################################################################################
# SECTION 1: AUTHENTICATION
################################################################################
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 1: AUTHENTICATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}ACTION REQUIRED: Get JWT Token${NC}"
echo ""
echo "Option 1: Via Dashboard"
echo "  1. Visit: https://upr.sivakumar.ai"
echo "  2. Login with your credentials"
echo "  3. Open browser DevTools (F12)"
echo "  4. Go to Application > Cookies"
echo "  5. Copy the 'token' or 'jwt' cookie value"
echo ""
echo "Option 2: Via API"
echo "  curl -X POST $BASE_URL/api/auth/login \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}'"
echo ""
read -p "Enter your JWT token: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ No token provided. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Token saved${NC}"
echo ""

################################################################################
# SECTION 2: HEALTH CHECKS
################################################################################
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 2: HEALTH CHECKS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Test 2.1: RADAR Health Endpoint${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/health" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: status=healthy, radar_enabled=true, 5 sources available${NC}"
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 2.2: Diagnostic Endpoint${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/diag" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: db_ok=true${NC}"
echo ""
read -p "Press Enter to continue..."

################################################################################
# SECTION 3: API ENDPOINT TESTING
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 3: API ENDPOINT TESTING${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Test 3.1: List Discovery Sources${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/sources" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: 5 sources (gulf-news, khaleej-times, the-national, bayt, linkedin)${NC}"
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 3.2: Get Tenant Statistics${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/stats" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: total_runs=0 (first time), total_companies=0${NC}"
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 3.3: List Existing Runs${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/runs?limit=10" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: Empty array [] (no runs yet)${NC}"
echo ""
read -p "Press Enter to continue..."

################################################################################
# SECTION 4: FIRST DISCOVERY RUN
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 4: FIRST DISCOVERY RUN${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${RED}⚠️  WARNING: This will execute a real discovery run and incur costs!${NC}"
echo -e "${YELLOW}Estimated cost: \$0.50 - \$2.00${NC}"
echo ""
echo "What will happen:"
echo "  1. Search 5 UAE news/job sources via SerpAPI (\$0.005/search × ~15 = \$0.075)"
echo "  2. Crawl ~30-50 URLs for UAE signals"
echo "  3. Extract company details via GPT-4 (~\$0.30-\$1.50)"
echo "  4. Save validated companies to database"
echo "  5. Track all costs in usage_events table"
echo ""
read -p "Continue with first discovery run? (yes/no) " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${YELLOW}Test 4.1: Trigger Manual Discovery Run${NC}"
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"promptVersion":"v1.1-uae-heuristic","budgetLimitUsd":2.00}' \
  "$BASE_URL/api/radar/runs")

echo "$RESPONSE" | python3 -m json.tool
echo ""

# Extract run_id
RUN_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('run_id', ''))" 2>/dev/null)

if [ -z "$RUN_ID" ]; then
    echo -e "${RED}❌ Failed to get run_id. Check response above.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Discovery run triggered!${NC}"
echo -e "${BLUE}Run ID: $RUN_ID${NC}"
echo ""

################################################################################
# SECTION 5: MONITORING
################################################################################
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 5: MONITORING EXECUTION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}The discovery run is now executing. This typically takes 5-10 minutes.${NC}"
echo ""
echo "You can monitor progress in multiple ways:"
echo ""
echo "1. Poll Run Status (recommended):"
echo "   watch -n 5 \"curl -s -H 'Authorization: Bearer $TOKEN' $BASE_URL/api/radar/runs/$RUN_ID | python3 -m json.tool\""
echo ""
echo "2. View Cloud Run Logs:"
echo "   gcloud run services logs tail upr-web-service --format=json"
echo ""
echo "3. Check this script's monitoring (polling every 15 seconds):"
echo ""

echo -e "${BLUE}Starting automatic monitoring...${NC}"
echo ""

for i in {1..40}; do
    sleep 15

    STATUS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
      "$BASE_URL/api/radar/runs/$RUN_ID")

    STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('status', 'unknown'))" 2>/dev/null)
    COMPANIES_FOUND=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('companies_found', 0))" 2>/dev/null)
    COMPANIES_ACCEPTED=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('companies_accepted', 0))" 2>/dev/null)
    COST=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('cost_usd', 0))" 2>/dev/null)

    echo -e "[$i] Status: ${BLUE}$STATUS${NC} | Found: $COMPANIES_FOUND | Accepted: $COMPANIES_ACCEPTED | Cost: \$$COST"

    if [ "$STATUS" = "completed" ]; then
        echo ""
        echo -e "${GREEN}✅ Discovery run completed!${NC}"
        echo ""
        echo "$STATUS_RESPONSE" | python3 -m json.tool
        break
    elif [ "$STATUS" = "failed" ]; then
        echo ""
        echo -e "${RED}❌ Discovery run failed!${NC}"
        echo ""
        echo "$STATUS_RESPONSE" | python3 -m json.tool
        break
    fi

    if [ $i -eq 40 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  Run still in progress after 10 minutes. Check manually:${NC}"
        echo "   curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/api/radar/runs/$RUN_ID"
    fi
done

################################################################################
# SECTION 6: VALIDATION
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 6: RESULTS VALIDATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Test 6.1: Get Final Run Details${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/runs/$RUN_ID" | python3 -m json.tool
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 6.2: Updated Tenant Statistics${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/stats" | python3 -m json.tool
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 6.3: Source Performance Metrics${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/sources/performance" | python3 -m json.tool
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 6.4: Check Dead Letter Queue${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/dead-letters?limit=10" | python3 -m json.tool
echo ""
echo -e "${GREEN}Expected: Empty array or minimal failures${NC}"
echo ""
read -p "Press Enter to continue..."

echo ""
echo -e "${YELLOW}Test 6.5: Daily Statistics (Last 7 Days)${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/radar/stats/daily?days=7" | python3 -m json.tool
echo ""

################################################################################
# SECTION 7: DATABASE VALIDATION
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 7: DATABASE VALIDATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Now you should validate the database directly:${NC}"
echo ""
echo "1. Check discovery_runs table:"
echo "   SELECT run_id, status, companies_found, companies_accepted, cost_usd, latency_ms"
echo "   FROM discovery_runs"
echo "   ORDER BY created_at DESC"
echo "   LIMIT 1;"
echo ""
echo "2. Check discovered companies:"
echo "   SELECT id, legal_name, domain_norm, uae_presence_confidence,"
echo "          metadata->>'discovered_by' as source"
echo "   FROM entities_company"
echo "   WHERE metadata->>'discovered_by' = 'radar'"
echo "   ORDER BY created_at DESC"
echo "   LIMIT 10;"
echo ""
echo "3. Check usage_events for cost tracking:"
echo "   SELECT event_type, model, tokens_used, cost_usd,"
echo "          run_id"
echo "   FROM usage_events"
echo "   WHERE run_id IS NOT NULL"
echo "   ORDER BY created_at DESC"
echo "   LIMIT 20;"
echo ""
echo "4. Verify total cost doesn't exceed budget:"
echo "   SELECT SUM(cost_usd) as total_cost"
echo "   FROM usage_events"
echo "   WHERE run_id = '$RUN_ID';"
echo ""

################################################################################
# SECTION 8: SUMMARY
################################################################################
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   SPRINT 3 TEST COMPLETE                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ All API tests executed${NC}"
echo -e "${GREEN}✅ First discovery run completed${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review discovered companies in database"
echo "2. Check data quality and confidence scores"
echo "3. Analyze source performance metrics"
echo "4. Run 2-3 more manual scans to gather data"
echo "5. Proceed to Sprint 4 (Dashboard UI) once satisfied"
echo ""
echo -e "${BLUE}Run ID for reference: $RUN_ID${NC}"
echo ""

exit 0
