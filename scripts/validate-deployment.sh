#!/bin/bash
# Deployment Validation Script
# Run before/after deployments to catch configuration drift
#
# Usage: ./scripts/validate-deployment.sh [staging|production]

set -e

ENV=${1:-staging}
REGION="us-central1"

echo "=========================================="
echo "🔍 DEPLOYMENT VALIDATION: $ENV"
echo "=========================================="

# Service names based on environment
if [ "$ENV" = "production" ]; then
  SAAS_SERVICE="premiumradar-saas-service"
else
  SAAS_SERVICE="premiumradar-saas-staging"
fi
OS_SERVICE="upr-os-service"

# Required env vars for SaaS service
SAAS_REQUIRED="PR_OS_TOKEN UPR_OS_BASE_URL DATABASE_URL"

# Required env vars for OS service  
OS_REQUIRED="PR_OS_TOKEN DATABASE_URL ANTHROPIC_API_KEY"

check_service_env() {
  local SERVICE=$1
  local REQUIRED=$2
  local MISSING=""
  local HAS_ERROR=0

  echo ""
  echo "Checking $SERVICE..."

  # Get current env vars (both direct and from secrets)
  ENV_YAML=$(gcloud run services describe "$SERVICE" \
    --region "$REGION" \
    --format="yaml(spec.template.spec.containers[0].env)" 2>/dev/null || echo "")

  for VAR in $REQUIRED; do
    if echo "$ENV_YAML" | grep -q "name: $VAR"; then
      echo "  ✅ $VAR"
    else
      echo "  ❌ $VAR (MISSING!)"
      MISSING="$MISSING $VAR"
      HAS_ERROR=1
    fi
  done

  if [ $HAS_ERROR -eq 1 ]; then
    echo ""
    echo "⚠️  MISSING:$MISSING"
  fi
  
  return $HAS_ERROR
}

# Check both services
ERRORS=0

echo ""
echo "📋 Checking Environment Variables"
echo "------------------------------------------------"

check_service_env "$SAAS_SERVICE" "$SAAS_REQUIRED" || ERRORS=$((ERRORS + 1))
check_service_env "$OS_SERVICE" "$OS_REQUIRED" || ERRORS=$((ERRORS + 1))

echo ""
echo "=========================================="
echo "🔗 Connectivity Tests"
echo "=========================================="

# Get service URLs
SAAS_URL=$(gcloud run services describe "$SAAS_SERVICE" --region "$REGION" --format="value(status.url)" 2>/dev/null)
OS_URL=$(gcloud run services describe "$OS_SERVICE" --region "$REGION" --format="value(status.url)" 2>/dev/null)

echo ""
echo "Testing health endpoints..."

# Test SaaS health
if curl -s --max-time 10 "$SAAS_URL/api/health" | grep -q '"status":"healthy"'; then
  echo "  ✅ SaaS health: OK"
else
  echo "  ❌ SaaS health: FAILED"
  ERRORS=$((ERRORS + 1))
fi

# Test OS health
if curl -s --max-time 10 "$OS_URL/health" | grep -q '"status":"ok"'; then
  echo "  ✅ OS health: OK"
else
  echo "  ❌ OS health: FAILED"
  ERRORS=$((ERRORS + 1))
fi

# Test SaaS → OS connectivity
echo ""
echo "Testing SaaS → OS connectivity..."
SAAS_HEALTH=$(curl -s --max-time 10 "$SAAS_URL/api/health" 2>/dev/null)
if echo "$SAAS_HEALTH" | grep -q '"reachable":true'; then
  echo "  ✅ SaaS → OS: Connected"
else
  echo "  ❌ SaaS → OS: NOT Connected (check PR_OS_TOKEN)"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED - Ready for use"
  exit 0
else
  echo "❌ $ERRORS CHECK(S) FAILED"
  echo ""
  echo "Fix missing env vars:"
  echo "  gcloud run services update SERVICE --region $REGION --update-secrets=VAR=SECRET:latest"
  exit 1
fi
