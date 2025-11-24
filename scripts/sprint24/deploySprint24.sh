#!/bin/bash
# Sprint 24 Deployment Script
# Deploys ContactTier rule engine v2.0 with shadow mode to Cloud Run

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════"
echo "Sprint 24 Deployment - ContactTier Rule Engine v2.0"
echo "════════════════════════════════════════════════════════════"
echo ""

# Step 1: Build Docker image
echo "📦 Step 1: Building Docker image..."
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --timeout=20m \
  2>&1 | tee /tmp/sprint24_build.log

if [ $? -eq 0 ]; then
  echo "✅ Docker image built successfully"
else
  echo "❌ Docker build failed"
  exit 1
fi

echo ""

# Step 2: Deploy to Cloud Run
echo "🚀 Step 2: Deploying to Cloud Run..."
gcloud run deploy upr-web-service \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --platform=managed \
  2>&1 | tee /tmp/sprint24_deploy.log

if [ $? -eq 0 ]; then
  echo "✅ Deployed to Cloud Run successfully"
else
  echo "❌ Cloud Run deployment failed"
  exit 1
fi

echo ""

# Step 3: Get service URL and revision
echo "📊 Step 3: Checking deployment status..."
SERVICE_URL=$(gcloud run services describe upr-web-service --region=us-central1 --format="value(status.url)")
REVISION=$(gcloud run services describe upr-web-service --region=us-central1 --format="value(status.latestReadyRevisionName)")

echo "Service URL: $SERVICE_URL"
echo "Revision: $REVISION"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Sprint 24 Deployment Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "1. Test ContactTier rule engine: API_URL=\"$SERVICE_URL\" node scripts/sprint24/testContactTierRuleEngine.js"
echo "2. Run smoke test: API_URL=\"$SERVICE_URL\" node scripts/sprint23/smokeTestSprint23.js"
echo "3. Monitor shadow mode: bash scripts/sprint23/checkShadowModeProgress.sh"
echo ""
