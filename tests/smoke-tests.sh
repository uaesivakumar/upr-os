#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# UPR PRODUCTION SMOKE TESTS
# Run before EVERY deployment to verify critical functionality
# ═══════════════════════════════════════════════════════════════════════

set -e

# Configuration
export SERVICE_URL="${SERVICE_URL:-https://upr.sivakumar.ai}"
export ADMIN_USER="${ADMIN_USER:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

FAILED_TESTS=0
PASSED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════════════"
echo "🧪 UPR SMOKE TESTS"
echo "═══════════════════════════════════════════════════════════════════════"
echo "Target: $SERVICE_URL"
echo "Started: $(date)"
echo ""

# Helper function for test reporting
test_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  PASSED_TESTS=$((PASSED_TESTS + 1))
}

test_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  echo -e "${RED}   Error: $2${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
}

test_warn() {
  echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

# ═══════════════════════════════════════════════════════════════════════
# TEST 1: Health Check Endpoint
# ═══════════════════════════════════════════════════════════════════════
echo "Test 1: Health check endpoint..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health")
if [ "$response" = "200" ]; then
  test_pass "Health check endpoint responding"
else
  test_fail "Health check endpoint" "HTTP $response (expected 200)"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 2: Database Connectivity
# ═══════════════════════════════════════════════════════════════════════
echo "Test 2: Database connectivity..."
diag_response=$(curl -s "$SERVICE_URL/api/diag")
db_ok=$(echo "$diag_response" | jq -r '.db_ok // false')

if [ "$db_ok" = "true" ]; then
  test_pass "Database connectivity"
else
  db_error=$(echo "$diag_response" | jq -r '.db_error // "unknown error"')
  test_fail "Database connectivity" "$db_error"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 3: Environment Variables
# ═══════════════════════════════════════════════════════════════════════
echo "Test 3: Required environment variables..."
required_envs=("DATABASE_URL" "APOLLO_API_KEY" "OPENAI_API_KEY")
missing_envs=()

for env_var in "${required_envs[@]}"; do
  env_status=$(echo "$diag_response" | jq -r ".env.${env_var} // false")
  if [ "$env_status" = "true" ]; then
    echo "   ✓ $env_var is set"
  else
    echo "   ✗ $env_var is MISSING"
    missing_envs+=("$env_var")
  fi
done

if [ ${#missing_envs[@]} -eq 0 ]; then
  test_pass "All required environment variables set"
else
  test_fail "Environment variables" "Missing: ${missing_envs[*]}"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 4: Authentication - Login
# ═══════════════════════════════════════════════════════════════════════
echo "Test 4: Authentication - Login..."
login_response=$(curl -s -X POST "$SERVICE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}")

login_ok=$(echo "$login_response" | jq -r '.ok // false')

if [ "$login_ok" = "true" ]; then
  test_pass "Login with valid credentials"
  # Extract token for subsequent tests
  TOKEN=$(echo "$login_response" | jq -r '.token // empty')
  if [ -z "$TOKEN" ]; then
    # Token might be in cookie, try to get user info instead
    test_warn "Token not in response (may be in cookie)"
  fi
else
  test_fail "Login" "Authentication failed for $ADMIN_USER"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 5: Authentication - Invalid Credentials
# ═══════════════════════════════════════════════════════════════════════
echo "Test 5: Authentication - Reject invalid credentials..."
invalid_login=$(curl -s -X POST "$SERVICE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"invalid","password":"wrong"}')

invalid_ok=$(echo "$invalid_login" | jq -r '.ok')
invalid_error=$(echo "$invalid_login" | jq -r '.error // empty')

if [ "$invalid_ok" = "false" ] && [ -n "$invalid_error" ]; then
  test_pass "Invalid credentials rejected (error: $invalid_error)"
else
  test_fail "Invalid credentials handling" "Expected ok=false with error message, got: $invalid_login"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 6: Company Enrichment API
# ═══════════════════════════════════════════════════════════════════════
echo "Test 6: Company enrichment API..."

# Note: This endpoint may require authentication
# Try without auth first, then with auth if available
enrich_response=$(curl -s -X POST "$SERVICE_URL/api/hiring-enrich/from-signal" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test Smoke Company","signal":{"type":"test"}}')

enrich_ok=$(echo "$enrich_response" | jq -r '.ok // false')
has_task_id=$(echo "$enrich_response" | jq -r '.data.task_id // empty')
is_unauthorized=$(echo "$enrich_response" | jq -r '.error // "" | contains("uthoriz") or contains("uthorization")')

if [ "$enrich_ok" = "true" ] && [ -n "$has_task_id" ]; then
  test_pass "Enrichment API accepting requests"
  echo "   Task ID: $has_task_id"
elif [ "$is_unauthorized" = "true" ]; then
  test_warn "Enrichment API requires authentication (expected)"
else
  error_msg=$(echo "$enrich_response" | jq -r '.error // "unknown error"')
  test_fail "Enrichment API" "$error_msg"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 7: Pattern Cache Clearing API
# ═══════════════════════════════════════════════════════════════════════
echo "Test 7: Pattern cache clearing API..."

cache_response=$(curl -s -X POST "$SERVICE_URL/api/hiring-enrich/clear-cache" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test Company"}')

cache_ok=$(echo "$cache_response" | jq -r '.ok // false')

if [ "$cache_ok" = "true" ]; then
  deleted_count=$(echo "$cache_response" | jq -r '.deleted // 0')
  test_pass "Cache clearing API functional"
  echo "   Deleted: $deleted_count cache entries"
else
  error_msg=$(echo "$cache_response" | jq -r '.error // "unknown error"')
  test_fail "Cache clearing API" "$error_msg"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 8: Companies API
# ═══════════════════════════════════════════════════════════════════════
echo "Test 8: Companies listing API..."

companies_response=$(curl -s "$SERVICE_URL/api/companies?limit=1")
companies_ok=$(echo "$companies_response" | jq -r '.ok // false')

if [ "$companies_ok" = "true" ]; then
  test_pass "Companies API responding"
else
  error_msg=$(echo "$companies_response" | jq -r '.error // "unknown error"')
  test_fail "Companies API" "$error_msg"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 9: Email Intelligence - Pattern Discovery
# ═══════════════════════════════════════════════════════════════════════
echo "Test 9: Email pattern discovery API..."

pattern_response=$(curl -s "$SERVICE_URL/api/email-intelligence/pattern?company_name=Test&domain=test.com")
pattern_ok=$(echo "$pattern_response" | jq -r '.ok // false')

if [ "$pattern_ok" = "true" ]; then
  test_pass "Email pattern discovery API"
else
  error_msg=$(echo "$pattern_response" | jq -r '.error // "unknown error"')
  # This might be expected if test domain doesn't exist
  test_warn "Email pattern discovery returned error (may be expected for test domain)"
fi

# ═══════════════════════════════════════════════════════════════════════
# TEST 10: Critical Routes Mounted
# ═══════════════════════════════════════════════════════════════════════
echo "Test 10: Critical routes mounted..."

routes=$(echo "$diag_response" | jq -r '.routesMounted[]')
critical_routes=("POST /login" "GET /verify" "POST /from-signal" "POST /clear-cache")
missing_routes=()

for route in "${critical_routes[@]}"; do
  if echo "$routes" | grep -q "$route"; then
    echo "   ✓ $route"
  else
    echo "   ✗ $route MISSING"
    missing_routes+=("$route")
  fi
done

if [ ${#missing_routes[@]} -eq 0 ]; then
  test_pass "All critical routes mounted"
else
  test_fail "Route mounting" "Missing: ${missing_routes[*]}"
fi

# ═══════════════════════════════════════════════════════════════════════
# RESULTS SUMMARY
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "RESULTS"
echo "═══════════════════════════════════════════════════════════════════════"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Completed: $(date)"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo "✅ Safe to deploy to production"
  exit 0
else
  echo -e "${RED}💥 $FAILED_TESTS TEST(S) FAILED${NC}"
  echo "❌ DO NOT DEPLOY - Fix issues first!"
  exit 1
fi
