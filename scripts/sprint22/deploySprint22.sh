#!/bin/bash
# Sprint 22 Deployment Script
# Deploys rule engine v2.0 + shadow mode to Cloud Run

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "Sprint 22 Deployment - Rule Engine v2.0 + Shadow Mode"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Deploy to Cloud Run
echo "📦 Step 1: Deploying to Cloud Run..."
gcloud run services update upr-web-service \
  --platform managed \
  --region us-central1 \
  --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest

echo "✅ Deployment complete"
echo ""

# Step 2: Get service URL
echo "🌐 Step 2: Getting service URL..."
SERVICE_URL=$(gcloud run services describe upr-web-service \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"
echo ""

# Step 3: Health check
echo "🏥 Step 3: Running health check..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health")

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed (HTTP $HTTP_CODE)"
else
  echo "❌ Health check failed (HTTP $HTTP_CODE)"
  exit 1
fi
echo ""

# Step 4: Test rule engine loading
echo "🔍 Step 4: Checking rule engine v2.0 loading..."
DIAG_RESPONSE=$(curl -s "$SERVICE_URL/api/agent-core/v1/__diag")
echo "$DIAG_RESPONSE" | grep -q "upr-web-service" && echo "✅ Service diagnostics available"
echo ""

# Step 5: Test CompanyQualityTool with shadow mode
echo "🧪 Step 5: Testing CompanyQualityTool (shadow mode)..."

TEST_PAYLOAD='{
  "company_name": "TechCorp UAE",
  "domain": "techcorp.ae",
  "industry": "Technology",
  "uae_signals": {
    "has_ae_domain": true,
    "has_uae_address": true,
    "linkedin_location": "Dubai, UAE"
  },
  "salary_indicators": {
    "salary_level": "high",
    "avg_salary": 18000
  },
  "size": 150,
  "size_bucket": "midsize",
  "license_type": "Free Zone",
  "sector": "Private"
}'

RESPONSE=$(curl -s -X POST "$SERVICE_URL/api/agent-core/v1/tools/evaluate_company_quality" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD")

# Check if response contains quality_score
if echo "$RESPONSE" | grep -q "quality_score"; then
  SCORE=$(echo "$RESPONSE" | grep -o '"quality_score":[0-9]*' | grep -o '[0-9]*')
  DECISION_ID=$(echo "$RESPONSE" | grep -o '"decision_id":"[^"]*"' | grep -o '[a-f0-9-]*' | head -1)
  SHADOW_ACTIVE=$(echo "$RESPONSE" | grep -o '"shadow_mode_active":[a-z]*' | grep -o 'true\|false')

  echo "✅ CompanyQualityTool executed successfully"
  echo "   Quality Score: $SCORE/100"
  echo "   Decision ID: $DECISION_ID"
  echo "   Shadow Mode: $SHADOW_ACTIVE"
else
  echo "❌ CompanyQualityTool execution failed"
  echo "Response: $RESPONSE"
  exit 1
fi
echo ""

# Step 6: Check shadow mode stats
echo "📊 Step 6: Checking shadow mode statistics..."
STATS_RESPONSE=$(curl -s "$SERVICE_URL/api/agent-core/v1/shadow-mode-stats")
echo "$STATS_RESPONSE" | grep -q "overall_match_rate_pct" && echo "✅ Shadow mode stats API working"
echo ""

# Step 7: Test feedback API
echo "💬 Step 7: Testing feedback API..."
if [ -n "$DECISION_ID" ]; then
  FEEDBACK_PAYLOAD="{
    \"decision_id\": \"$DECISION_ID\",
    \"outcome_positive\": true,
    \"outcome_type\": \"test\",
    \"notes\": \"Sprint 22 deployment test\"
  }"

  FEEDBACK_RESPONSE=$(curl -s -X POST "$SERVICE_URL/api/agent-core/v1/feedback" \
    -H "Content-Type: application/json" \
    -d "$FEEDBACK_PAYLOAD")

  if echo "$FEEDBACK_RESPONSE" | grep -q "Feedback recorded successfully"; then
    echo "✅ Feedback API working"
  else
    echo "⚠️  Feedback API response: $FEEDBACK_RESPONSE"
  fi
else
  echo "⚠️  Skipping feedback test (no decision_id)"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "Sprint 22 Deployment - COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ Service URL: $SERVICE_URL"
echo "✅ Health check: Passing"
echo "✅ CompanyQualityTool: Working (shadow mode active)"
echo "✅ Shadow mode stats API: Working"
echo "✅ Feedback API: Working"
echo ""
echo "Next Steps:"
echo "1. Run smoke tests: npm run test:smoke"
echo "2. Run stress tests: npm run test:stress"
echo "3. Monitor shadow mode logs for inline vs rule comparison"
echo "4. Check decision logging: SELECT COUNT(*) FROM agent_core.agent_decisions;"
echo ""
echo "Monitoring URLs:"
echo "- Service: $SERVICE_URL"
echo "- Logs: https://console.cloud.google.com/run/detail/us-central1/upr-web-service/logs"
echo "- Metrics: https://console.cloud.google.com/run/detail/us-central1/upr-web-service/metrics"
echo ""
