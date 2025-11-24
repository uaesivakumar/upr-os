#!/bin/bash
# Sprint 17 P1: Rate Limiting Test Script

# IMPORTANT: Set this to your production URL or leave as localhost for local testing
# API_URL="https://upr-web-service-191599223867.us-central1.run.app"
API_URL="http://localhost:8080"

echo "🧪 Testing API Rate Limiting"
echo "============================="
echo "Target: $API_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: General API Rate Limit (100 req/15min)
echo -e "\n${YELLOW}📊 Test 1: General API Rate Limit (100 req/15min)${NC}"
echo "Making requests to /api/companies..."
success_count=0
rate_limited_count=0

for i in {1..10}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/api/companies?limit=1")
  if [ "$response" == "200" ] || [ "$response" == "401" ]; then
    echo -e "Request $i: ${GREEN}✅ $response${NC}"
    ((success_count++))
  elif [ "$response" == "429" ]; then
    echo -e "Request $i: ${YELLOW}⚠️  $response (rate limited)${NC}"
    ((rate_limited_count++))
  else
    echo -e "Request $i: ${RED}❌ $response${NC}"
  fi
  sleep 0.1
done

echo "Summary: $success_count success, $rate_limited_count rate-limited"

# Test 2: Health endpoint (should NOT be rate limited)
echo -e "\n${YELLOW}📊 Test 2: Health Endpoint (no rate limit)${NC}"
echo "Making requests to /health..."

for i in {1..10}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/health")
  if [ "$response" == "200" ]; then
    echo -e "Request $i: ${GREEN}✅ $response (not rate limited as expected)${NC}"
  else
    echo -e "Request $i: ${RED}❌ $response (unexpected)${NC}"
  fi
  sleep 0.1
done

# Test 3: Check rate limit headers
echo -e "\n${YELLOW}📊 Test 3: Rate Limit Headers${NC}"
echo "Checking headers from /api/companies..."

response=$(curl -s -i "$API_URL/api/companies?limit=1" 2>&1)
echo "$response" | grep -i "ratelimit" || echo "No RateLimit headers found (might be okay if auth required)"

echo -e "\n${GREEN}✅ Rate limiting tests complete!${NC}"
echo ""
echo "NOTE: For full testing, increase loop counts and verify:"
echo "  - General API: 100 requests should succeed, 101st should fail (429)"
echo "  - Enrichment: 20 requests should succeed, 21st should fail (429)"
echo "  - RADAR: 5 requests should succeed, 6th should fail (429)"
echo "  - Auth: 5 failed logins should succeed, 6th should fail (429)"
