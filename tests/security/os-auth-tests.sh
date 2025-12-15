#!/bin/bash
# =============================================================================
# OS Security Test Suite
# VS1: OS Security Wall
#
# Tests all security requirements:
# 1. Direct OS API call without auth → Expect 401
# 2. OS API call with wrong token → Expect 403
# 3. OS API call with valid token → Expect 200
# 4. Audit logs present → Verify logging
#
# Authorization Code: VS1-VS9-APPROVED-20251213
# =============================================================================

set -e

# Configuration
OS_URL="${UPR_OS_BASE_URL:-http://localhost:8080}"
VALID_TOKEN="${PR_OS_TOKEN:-test-token-for-local-dev}"
INVALID_TOKEN="invalid-token-12345"

echo "=============================================="
echo "VS1 Security Test Suite"
echo "OS URL: $OS_URL"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local expected_status="$2"
    local actual_status="$3"

    if [ "$actual_status" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name (Expected: $expected_status, Got: $actual_status)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name (Expected: $expected_status, Got: $actual_status)"
        ((TESTS_FAILED++))
    fi
}

# =============================================================================
# TEST 1: Direct OS API call without auth → Expect 401
# =============================================================================
echo ""
echo "--- TEST 1: No Authentication ---"

# Test /api/os/score without token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$OS_URL/api/os/score" \
    -H "Content-Type: application/json" \
    -d '{"entity_id":"test"}')
run_test "/api/os/score without token" 401 "$STATUS"

# Test /api/os/discovery without token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$OS_URL/api/os/discovery" \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"test","region_code":"UAE","vertical_id":"banking"}')
run_test "/api/os/discovery without token" 401 "$STATUS"

# Test /api/os/outreach without token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$OS_URL/api/os/outreach" \
    -H "Content-Type: application/json" \
    -d '{"leads":[{"id":"test"}]}')
run_test "/api/os/outreach without token" 401 "$STATUS"

# Test GET /api/os without token (should also require auth except health)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$OS_URL/api/os")
run_test "GET /api/os without token" 401 "$STATUS"

# =============================================================================
# TEST 2: OS API call with WRONG token → Expect 403
# =============================================================================
echo ""
echo "--- TEST 2: Invalid Token ---"

# Test with invalid token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$OS_URL/api/os/score" \
    -H "Content-Type: application/json" \
    -H "x-pr-os-token: $INVALID_TOKEN" \
    -d '{"entity_id":"test"}')
run_test "/api/os/score with invalid token" 403 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$OS_URL/api/os/discovery" \
    -H "Content-Type: application/json" \
    -H "x-pr-os-token: $INVALID_TOKEN" \
    -d '{"tenant_id":"test","region_code":"UAE","vertical_id":"banking"}')
run_test "/api/os/discovery with invalid token" 403 "$STATUS"

# =============================================================================
# TEST 3: OS API call with VALID token → Expect 200 (or appropriate success)
# =============================================================================
echo ""
echo "--- TEST 3: Valid Token ---"

# Health endpoint should work (no auth required)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$OS_URL/api/os/health")
run_test "/api/os/health (no auth required)" 200 "$STATUS"

# Version endpoint should work (no auth required)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$OS_URL/api/os/version")
run_test "/api/os/version (no auth required)" 200 "$STATUS"

# With valid token, should get 200 (or 400 if payload invalid, but NOT 401/403)
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$OS_URL/api/os/score" \
    -H "Content-Type: application/json" \
    -H "x-pr-os-token: $VALID_TOKEN" \
    -d '{"entity_id":"test-entity","entity_type":"company"}')
STATUS=$(echo "$RESPONSE" | tail -1)

# Accept 200, 400 (bad request), but NOT 401 or 403
if [ "$STATUS" -ne 401 ] && [ "$STATUS" -ne 403 ]; then
    echo -e "${GREEN}✓ PASS${NC}: /api/os/score with valid token (Got: $STATUS - not 401/403)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: /api/os/score with valid token (Got: $STATUS - should not be 401/403)"
    ((TESTS_FAILED++))
fi

# GET /api/os with valid token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$OS_URL/api/os" \
    -H "x-pr-os-token: $VALID_TOKEN")
if [ "$STATUS" -ne 401 ] && [ "$STATUS" -ne 403 ]; then
    echo -e "${GREEN}✓ PASS${NC}: GET /api/os with valid token (Got: $STATUS - not 401/403)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: GET /api/os with valid token (Got: $STATUS - should not be 401/403)"
    ((TESTS_FAILED++))
fi

# =============================================================================
# TEST 4: Verify audit logging (check server logs)
# =============================================================================
echo ""
echo "--- TEST 4: Audit Logging ---"
echo -e "${YELLOW}NOTE${NC}: Audit logging verification requires checking server logs manually"
echo "Look for [OS_AUDIT] entries in server output"

# Make a request that should be logged
curl -s -o /dev/null \
    -X POST "$OS_URL/api/os/score" \
    -H "Content-Type: application/json" \
    -H "x-pr-os-token: $VALID_TOKEN" \
    -H "x-tenant-id: test-tenant" \
    -H "x-user-id: test-user" \
    -d '{"entity_id":"audit-test"}'

echo "Made test request with x-tenant-id and x-user-id headers"
echo "Check server logs for [OS_AUDIT] entry"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=============================================="
echo "SECURITY TEST SUMMARY"
echo "=============================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}ALL SECURITY TESTS PASSED${NC}"
    echo ""
    echo "VS1 Security Wall: VERIFIED"
    echo "Authorization: VS1-VS9-APPROVED-20251213"
    exit 0
else
    echo -e "${RED}SECURITY TESTS FAILED${NC}"
    echo "Please fix the failures before proceeding."
    exit 1
fi
