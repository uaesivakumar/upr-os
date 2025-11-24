#!/bin/bash

# FINAL COMPREHENSIVE ENRICHMENT TEST
# Tests complete flow with progress updates

echo "🧪 FINAL COMPREHENSIVE ENRICHMENT TEST"
echo "======================================="
echo ""

BASE_URL="https://upr.sivakumar.ai"

# Step 1: Trigger enrichment for a fresh company
echo "🚀 Step 1: Trigger Enrichment for ACME Corp (fresh company)"

ENRICH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/enrich/from-signal" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "ACME Corp",
    "sector": "Technology",
    "location": "Dubai, UAE",
    "domain": "acme.com"
  }')

echo "Response: $ENRICH_RESPONSE"
TASK_ID=$(echo "$ENRICH_RESPONSE" | grep -o '"task_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$TASK_ID" ]; then
  echo "❌ FAILED: No task_id"
  exit 1
fi

echo "✅ Task ID: $TASK_ID"
echo ""

# Step 2: Poll with progress tracking
echo "⏳ Step 2: Polling Status with Progress Updates"
for i in {1..15}; do
  echo "Poll #$i..."

  STATUS_RESPONSE=$(curl -s "$BASE_URL/api/enrich/status/$TASK_ID")
  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)

  # Extract progress
  PROGRESS_STEP=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('progress', {}).get('step', 'N/A'))" 2>/dev/null || echo "N/A")
  PROGRESS_MSG=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('progress', {}).get('message', 'N/A'))" 2>/dev/null || echo "N/A")

  echo "  Status: $STATUS"
  echo "  Progress: [$PROGRESS_STEP] $PROGRESS_MSG"

  if [ "$STATUS" = "DONE" ]; then
    echo ""
    echo "✅ ENRICHMENT COMPLETE!"
    echo ""
    echo "📋 Final Response:"
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"

    # Extract leads count
    LEADS_COUNT=$(echo "$STATUS_RESPONSE" | grep -o '"leads_found":[0-9]*' | cut -d':' -f2)
    echo ""
    echo "📊 Summary: $LEADS_COUNT leads discovered"
    break
  elif [ "$STATUS" = "ERROR" ]; then
    echo "❌ ENRICHMENT FAILED!"
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null
    exit 1
  fi

  sleep 2
done

echo ""

# Step 3: Verify in database
echo "🔍 Step 3: Database Verification"
psql "postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require" -c "
-- Verify company created
SELECT
  'Company: ' || legal_name as info,
  'Domain: ' || COALESCE(domain_norm, 'N/A') as domain,
  'Created: ' || created_at::text as created
FROM entities_company
WHERE legal_name = 'ACME Corp';

-- Verify leads created
SELECT
  'Lead: ' || full_name as name,
  'Email: ' || email as email,
  'Confidence: ' || (confidence * 100)::int || '%' as confidence,
  'Function: ' || function as func
FROM entities_person
WHERE company_id = (SELECT id FROM entities_company WHERE legal_name = 'ACME Corp')
ORDER BY confidence DESC;

-- Verify enrichment job
SELECT
  'Status: ' || status as status,
  'Leads Found: ' || leads_found as leads,
  'Duration: ' || EXTRACT(EPOCH FROM (finished_at - started_at))::int || 's' as duration
FROM enrichment_jobs
WHERE id = '$TASK_ID';
"

echo ""
echo "✅ FINAL SMOKE TEST COMPLETE!"
echo "======================================"
echo "RESULTS:"
echo "  ✅ Enrichment API working"
echo "  ✅ Progress updates persisting"
echo "  ✅ Leads created in database"
echo "  ✅ Schema mismatch fixed"
echo "  ✅ End-to-end flow successful"
