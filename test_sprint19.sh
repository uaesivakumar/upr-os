#!/bin/bash

# Sprint 19 Smoke Tests
# Running on revision: upr-web-service-00368-mq7
# Service URL: https://upr-web-service-191599223867.us-central1.run.app

BASE_URL="https://upr-web-service-191599223867.us-central1.run.app"
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=15

echo "════════════════════════════════════════════════════════"
echo "  Sprint 19 Smoke Test Suite"
echo "  Revision: upr-web-service-00368-mq7"
echo "  Date: $(date)"
echo "════════════════════════════════════════════════════════"
echo ""

# Test 1: Service Health Check
echo "Test 1: Service Health Check"
echo "------------------------------------------------------------"
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$response" = "200" ]; then
  echo "✅ PASS - Health check returned 200 OK"
  ((PASS_COUNT++))
else
  echo "❌ FAIL - Health check returned $response (expected 200)"
  ((FAIL_COUNT++))
fi
echo ""

# Test 2: Orchestration API - Get Sources (NO AUTH REQUIRED)
echo "Test 2: Orchestration API - Get Sources"
echo "------------------------------------------------------------"
response=$(curl -s "$BASE_URL/api/orchestration/sources")
if echo "$response" | jq -e '.success' > /dev/null 2>&1 || echo "$response" | jq -e '.sources' > /dev/null 2>&1 || echo "$response" | jq -e 'type == "array"' > /dev/null 2>&1; then
  echo "✅ PASS - Orchestration sources endpoint returns JSON"
  echo "Response: $(echo "$response" | jq -c '.')"
  ((PASS_COUNT++))
else
  echo "❌ FAIL - Orchestration sources endpoint failed"
  echo "Response: $response"
  ((FAIL_COUNT++))
fi
echo ""

# Test 3-7: Require authentication - SKIP
for i in {3..7}; do
  echo "Test $i: SKIPPED (requires authentication)"
  echo ""
done

# Test 8: Unified Discovery - Simple Discovery (NO AUTH REQUIRED - try without)
echo "Test 8: Unified Discovery - Simple Discovery"
echo "------------------------------------------------------------"
response=$(curl -s -X POST "$BASE_URL/api/discovery/signals" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {"location": "UAE"},
    "options": {
      "sources": ["linkedin"],
      "minQuality": 0.6,
      "useCache": true
    }
  }')
if echo "$response" | jq -e '.success' > /dev/null 2>&1 || echo "$response" | jq -e '.discovery' > /dev/null 2>&1; then
  echo "✅ PASS - Discovery endpoint returns JSON"
  signal_count=$(echo "$response" | jq -r '.discovery.totalSignals // "N/A"')
  echo "Signals returned: $signal_count"
  ((PASS_COUNT++))
else
  echo "❌ FAIL - Discovery endpoint failed"
  echo "Response: $response"
  ((FAIL_COUNT++))
fi
echo ""

# Test 9: Unified Discovery - Paginated (NO AUTH REQUIRED - try without)
echo "Test 9: Unified Discovery - Paginated"
echo "------------------------------------------------------------"
response=$(curl -s -X POST "$BASE_URL/api/discovery/signals/paginated" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {"location": "UAE"},
    "options": {"useCache": true},
    "pagination": {"page": 1, "limit": 10}
  }')
if echo "$response" | jq -e '.pagination' > /dev/null 2>&1 || echo "$response" | jq -e '.discovery' > /dev/null 2>&1; then
  echo "✅ PASS - Paginated discovery endpoint returns JSON with pagination"
  page_info=$(echo "$response" | jq -c '.pagination // "N/A"')
  echo "Pagination: $page_info"
  ((PASS_COUNT++))
else
  echo "❌ FAIL - Paginated discovery endpoint failed"
  echo "Response: $response"
  ((FAIL_COUNT++))
fi
echo ""

# Test 10: Unified Discovery - Cache Stats (NO AUTH REQUIRED - try without)
echo "Test 10: Unified Discovery - Cache Stats"
echo "------------------------------------------------------------"
response=$(curl -s -X GET "$BASE_URL/api/discovery/cache/stats")
if echo "$response" | jq -e '.cache' > /dev/null 2>&1 || echo "$response" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ PASS - Cache stats endpoint returns JSON"
  cache_info=$(echo "$response" | jq -c '.cache // "N/A"')
  echo "Cache info: $cache_info"
  ((PASS_COUNT++))
else
  echo "❌ FAIL - Cache stats endpoint failed"
  echo "Response: $response"
  ((FAIL_COUNT++))
fi
echo ""

# Test 11-15: Require authentication - SKIP
for i in {11..15}; do
  echo "Test $i: SKIPPED (requires authentication)"
  echo ""
done

# Summary
echo "════════════════════════════════════════════════════════"
echo "  Test Results Summary"
echo "════════════════════════════════════════════════════════"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "Skipped: $((TOTAL_TESTS - PASS_COUNT - FAIL_COUNT))"
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASS_COUNT / $TOTAL_TESTS) * 100}")
echo "Success Rate: $SUCCESS_RATE%"
echo ""
echo "════════════════════════════════════════════════════════"

if [ $FAIL_COUNT -eq 0 ]; then
  echo "🟢 STATUS: ALL TESTED ENDPOINTS PASS"
  exit 0
else
  echo "🔴 STATUS: SOME TESTS FAILED"
  exit 1
fi
