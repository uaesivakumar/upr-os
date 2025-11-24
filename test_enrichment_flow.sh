#!/bin/bash

# Comprehensive Enrichment Flow Test
# Tests the complete enrichment pipeline end-to-end

echo "🧪 ENRICHMENT FLOW SMOKE TEST"
echo "=============================="
echo ""

BASE_URL="https://upr.sivakumar.ai"

# Step 1: Health check
echo "📊 Step 1: Health Check"
HEALTH=$(curl -s "$BASE_URL/health")
echo "Response: $HEALTH"
echo ""

# Step 2: Trigger enrichment (simulate frontend call)
echo "🚀 Step 2: Trigger Enrichment for G42"
echo "POST $BASE_URL/api/enrich/from-signal"

ENRICH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/enrich/from-signal" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": null,
    "company_name": "G42",
    "sector": "Technology",
    "location": "Abu Dhabi, UAE",
    "domain": "g42.ai"
  }')

echo "Response: $ENRICH_RESPONSE"
echo ""

# Extract task_id from response
TASK_ID=$(echo "$ENRICH_RESPONSE" | grep -o '"task_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$TASK_ID" ]; then
  echo "❌ FAILED: No task_id returned"
  echo "Full response: $ENRICH_RESPONSE"
  exit 1
fi

echo "✅ Task started: $TASK_ID"
echo ""

# Step 3: Poll status (simulate frontend polling)
echo "⏳ Step 3: Polling Status (max 30 seconds)"
for i in {1..10}; do
  echo "Poll attempt $i/10..."

  STATUS_RESPONSE=$(curl -s "$BASE_URL/api/enrich/status/$TASK_ID")
  echo "Response: $STATUS_RESPONSE"

  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  echo "Status: $STATUS"

  # Check for progress updates
  PROGRESS=$(echo "$STATUS_RESPONSE" | grep -o '"progress":{[^}]*}')
  if [ -n "$PROGRESS" ]; then
    echo "Progress: $PROGRESS"
  fi

  if [ "$STATUS" = "DONE" ]; then
    echo "✅ Enrichment completed!"
    echo ""
    echo "📋 Final Response:"
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
    break
  elif [ "$STATUS" = "ERROR" ]; then
    echo "❌ Enrichment failed!"
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
    exit 1
  fi

  sleep 3
done

echo ""

# Step 4: Verify leads in database
echo "🔍 Step 4: Verify Leads in Database"
psql "postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require" -c "
SELECT
  ep.full_name,
  ep.title,
  ep.email,
  ep.function,
  ep.confidence,
  ep.source_url,
  ec.legal_name as company
FROM entities_person ep
JOIN entities_company ec ON ep.company_id = ec.id
WHERE ec.legal_name = 'G42'
ORDER BY ep.confidence DESC;
"

echo ""
echo "✅ SMOKE TEST COMPLETE!"
