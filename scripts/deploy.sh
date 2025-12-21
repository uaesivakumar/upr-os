#!/bin/bash
# UPR OS Service Deployment Script
# This script ensures all required secrets are preserved during deployment

set -e

REGION="us-central1"
SERVICE="upr-os-service"
PROJECT="applied-algebra-474804-e6"
IMAGE="us-central1-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE:latest"

# Phase 1.5: Capture git commit for Sales-Bench trace code_commit_sha
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Git commit: $GIT_COMMIT"

echo "=========================================="
echo "Deploying UPR OS Service"
echo "=========================================="

# ============================================
# PRE-DEPLOYMENT CHECKS
# ============================================
echo ""
echo "Running pre-deployment checks..."

# Check we're in the right directory
if [ ! -f "server.js" ] || [ ! -d "os/envelope" ]; then
  echo "ERROR: Must run from upr-os root directory"
  echo "Current directory: $(pwd)"
  exit 1
fi

# Check required files exist
REQUIRED_FILES="server.js package.json Dockerfile os/envelope/factory.js"
for file in $REQUIRED_FILES; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Required file missing: $file"
    exit 1
  fi
done

# Check all secrets exist in Secret Manager
REQUIRED_SECRETS="DATABASE_URL REDIS_URL JWT_SECRET APOLLO_API_KEY SERPAPI_KEY OPENAI_API_KEY ANTHROPIC_API_KEY PR_OS_TOKEN"
echo "Verifying secrets in Secret Manager..."
for secret in $REQUIRED_SECRETS; do
  if ! gcloud secrets describe $secret --project=$PROJECT &>/dev/null; then
    echo "ERROR: Secret not found in Secret Manager: $secret"
    exit 1
  fi
done
echo "All secrets verified."

# Run basic syntax check
echo "Running syntax check..."
if ! node --check server.js 2>/dev/null; then
  echo "ERROR: JavaScript syntax error in server.js"
  exit 1
fi
echo "Syntax check passed."

echo ""
echo "Pre-deployment checks PASSED"
echo ""

# ============================================
# BUILD
# ============================================
echo "Building Docker image..."
gcloud builds submit --region=$REGION --tag=$IMAGE .

# ============================================
# SAVE CURRENT STATE FOR ROLLBACK
# ============================================
echo "Saving current revision for rollback..."
PREVIOUS_REVISION=$(gcloud run services describe $SERVICE --region=$REGION --format="value(status.traffic[0].revisionName)" 2>/dev/null || echo "")
if [ -n "$PREVIOUS_REVISION" ]; then
  echo "Previous revision: $PREVIOUS_REVISION"
else
  echo "No previous revision found (first deployment)"
fi

# ============================================
# DEPLOY
# ============================================
echo ""
echo "Deploying with secrets..."
gcloud run deploy $SERVICE \
  --region=$REGION \
  --image=$IMAGE \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets="\
DATABASE_URL=DATABASE_URL:latest,\
REDIS_URL=REDIS_URL:latest,\
JWT_SECRET=JWT_SECRET:latest,\
APOLLO_API_KEY=APOLLO_API_KEY:latest,\
SERPAPI_KEY=SERPAPI_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
PR_OS_TOKEN=PR_OS_TOKEN:latest" \
  --set-env-vars="NODE_ENV=production,GIT_COMMIT=$GIT_COMMIT"

echo ""
echo "Deployment complete!"
SERVICE_URL="https://$SERVICE-191599223867.$REGION.run.app"
echo "Service URL: $SERVICE_URL"

# ============================================
# POST-DEPLOYMENT VERIFICATION
# ============================================
echo ""
echo "Running post-deployment verification..."

# Wait for container to start
echo "Waiting for container startup..."
sleep 10

# Health check with retries
MAX_RETRIES=3
RETRY_DELAY=5
HEALTH_OK=false

for i in $(seq 1 $MAX_RETRIES); do
  echo "Health check attempt $i/$MAX_RETRIES..."
  HEALTH=$(curl -s --max-time 10 "$SERVICE_URL/api/os/health" 2>/dev/null)

  if echo "$HEALTH" | grep -q '"status":"healthy"'; then
    HEALTH_OK=true
    break
  fi

  if [ $i -lt $MAX_RETRIES ]; then
    echo "Health check failed, retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi
done

if [ "$HEALTH_OK" = true ]; then
  echo ""
  echo "=========================================="
  echo "DEPLOYMENT SUCCESSFUL"
  echo "=========================================="
  echo "Service: $SERVICE_URL"
  echo "Health: PASSED"

  # Run full validation
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/validate-deployment.sh" ]; then
    echo ""
    echo "Running full validation..."
    "$SCRIPT_DIR/validate-deployment.sh" staging || echo "Warning: Validation had issues"
  fi
else
  echo ""
  echo "=========================================="
  echo "DEPLOYMENT FAILED - ROLLING BACK"
  echo "=========================================="
  echo "Health check failed after $MAX_RETRIES attempts"
  echo "Response: $HEALTH"

  if [ -n "$PREVIOUS_REVISION" ]; then
    echo ""
    echo "Rolling back to: $PREVIOUS_REVISION"
    gcloud run services update-traffic $SERVICE --region=$REGION --to-revisions=$PREVIOUS_REVISION=100
    echo "Rollback complete"
  else
    echo "No previous revision to rollback to!"
  fi

  exit 1
fi
