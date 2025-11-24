#!/bin/bash

# ============================================================================
# UPR PHASE 1 SPRINT 3 - FIRST DISCOVERY RUN
# Automated test script - paste entire block into Claude terminal
# ============================================================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   UPR SPRINT 3 - FIRST DISCOVERY RUN TEST                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# STEP 1: Login and get JWT token
echo "STEP 1: Getting JWT token..."
echo "Enter your username:"
read USERNAME
echo "Enter your password:"
read -s PASSWORD

TOKEN_RESPONSE=$(curl -s -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

echo ""
echo "Login Response:"
echo "$TOKEN_RESPONSE" | jq '.' 2>/dev/null || echo "$TOKEN_RESPONSE"
echo ""

# Extract token (adjust this based on your actual response structure)
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // .data.token // .access_token' 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to get token. Please check credentials."
    exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:20}..."
echo ""
sleep 2

# STEP 2: Test RADAR health
echo "STEP 2: Testing RADAR health..."
HEALTH=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/health)

echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
echo ""
sleep 2

# STEP 3: List discovery sources
echo "STEP 3: Listing discovery sources..."
SOURCES=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/sources)

echo "$SOURCES" | jq '.' 2>/dev/null || echo "$SOURCES"
echo ""
sleep 2

# STEP 4: Check current stats
echo "STEP 4: Checking current statistics..."
STATS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/stats)

echo "$STATS" | jq '.' 2>/dev/null || echo "$STATS"
echo ""
sleep 2

# STEP 5: Trigger discovery run
echo "STEP 5: Triggering discovery run..."
echo "⚠️  This will cost approximately \$0.50-\$2.00"
echo "Press Enter to continue or Ctrl+C to cancel..."
read

RUN_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"promptVersion":"v1.1-uae-heuristic","budgetLimitUsd":2.00}' \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/runs)

echo ""
echo "Discovery Run Triggered:"
echo "$RUN_RESPONSE" | jq '.' 2>/dev/null || echo "$RUN_RESPONSE"
echo ""

# Extract run_id
RUN_ID=$(echo "$RUN_RESPONSE" | jq -r '.data.run_id // .run_id' 2>/dev/null)

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    echo "❌ Failed to get run_id. Check response above."
    exit 1
fi

echo "✅ Discovery run started!"
echo "Run ID: $RUN_ID"
echo ""
sleep 2

# STEP 6: Monitor progress
echo "STEP 6: Monitoring discovery run (will check every 15 seconds)..."
echo "This typically takes 5-10 minutes. Press Ctrl+C to stop monitoring."
echo ""

COUNTER=0
while [ $COUNTER -lt 40 ]; do
    sleep 15
    COUNTER=$((COUNTER + 1))

    STATUS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
      https://upr-web-service-191599223867.us-central1.run.app/api/radar/runs/$RUN_ID)

    STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status // .status' 2>/dev/null)
    FOUND=$(echo "$STATUS_RESPONSE" | jq -r '.data.companies_found // .companies_found // 0' 2>/dev/null)
    ACCEPTED=$(echo "$STATUS_RESPONSE" | jq -r '.data.companies_accepted // .companies_accepted // 0' 2>/dev/null)
    COST=$(echo "$STATUS_RESPONSE" | jq -r '.data.cost_usd // .cost_usd // 0' 2>/dev/null)

    echo "[$COUNTER] Status: $STATUS | Found: $FOUND | Accepted: $ACCEPTED | Cost: \$COST"

    if [ "$STATUS" = "completed" ]; then
        echo ""
        echo "✅ Discovery run completed!"
        echo ""
        echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo ""
        echo "❌ Discovery run failed!"
        echo ""
        echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
        exit 1
    fi
done

echo ""
sleep 2

# STEP 7: Get final statistics
echo "STEP 7: Getting updated statistics..."
FINAL_STATS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/stats)

echo "$FINAL_STATS" | jq '.' 2>/dev/null || echo "$FINAL_STATS"
echo ""
sleep 2

# STEP 8: Check source performance
echo "STEP 8: Checking source performance..."
PERFORMANCE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/sources/performance)

echo "$PERFORMANCE" | jq '.' 2>/dev/null || echo "$PERFORMANCE"
echo ""
sleep 2

# STEP 9: Check dead letters
echo "STEP 9: Checking dead letter queue..."
DEAD_LETTERS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://upr-web-service-191599223867.us-central1.run.app/api/radar/dead-letters?limit=10)

echo "$DEAD_LETTERS" | jq '.' 2>/dev/null || echo "$DEAD_LETTERS"
echo ""
sleep 2

# STEP 10: Database validation (if DATABASE_URL is set)
if [ ! -z "$DATABASE_URL" ]; then
    echo "STEP 10: Validating database entries..."

    echo "Companies discovered:"
    psql "$DATABASE_URL" -c "
    SELECT
        legal_name,
        domain_norm,
        ROUND(uae_presence_confidence::numeric, 2) as confidence
    FROM entities_company
    WHERE metadata->>'discovered_by' = 'radar'
    ORDER BY created_at DESC
    LIMIT 10;
    " 2>/dev/null || echo "Database query failed (make sure DATABASE_URL is set)"

    echo ""
    echo "Cost tracking:"
    psql "$DATABASE_URL" -c "
    SELECT
        COUNT(*) as api_calls,
        ROUND(SUM(cost_usd)::numeric, 4) as total_cost
    FROM usage_events
    WHERE run_id = '$RUN_ID';
    " 2>/dev/null || echo "Database query failed"

    echo ""
else
    echo "STEP 10: Skipping database validation (DATABASE_URL not set)"
    echo ""
fi

# FINAL SUMMARY
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               SPRINT 3 TEST COMPLETE                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Run ID: $RUN_ID"
echo ""
echo "Summary:"
echo "- Discovery run status: $STATUS"
echo "- Companies found: $FOUND"
echo "- Companies accepted: $ACCEPTED"
echo "- Total cost: \$COST"
echo ""
echo "Next steps:"
echo "1. Review discovered companies in database"
echo "2. Check data quality manually"
echo "3. Run 2-3 more discovery scans"
echo "4. Proceed to Sprint 4 (Dashboard UI)"
echo ""
echo "✅ Phase 1 Sprint 3 testing complete!"
echo ""
