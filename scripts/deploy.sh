#!/bin/bash
# UPR OS Service Deployment Script
# This script ensures all required secrets are preserved during deployment

set -e

REGION="us-central1"
SERVICE="upr-os-service"
PROJECT="applied-algebra-474804-e6"
IMAGE="us-central1-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE:latest"

echo "=========================================="
echo "Deploying UPR OS Service"
echo "=========================================="

# Step 1: Build the image
echo ""
echo "Building Docker image..."
gcloud builds submit --region=$REGION --tag=$IMAGE .

# Step 2: Deploy with all required secrets
echo ""
echo "Deploying with secrets..."
gcloud run deploy $SERVICE \
  --region=$REGION \
  --image=$IMAGE \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets="PR_OS_TOKEN=PR_OS_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production"

echo ""
echo "Deployment complete!"
echo ""
echo "Service URL: https://$SERVICE-191599223867.$REGION.run.app"

# Step 3: Verify health
echo ""
echo "Verifying health..."
sleep 5
HEALTH=$(curl -s "https://$SERVICE-191599223867.$REGION.run.app/api/os/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"healthy"'; then
  echo "Health check: PASSED"
else
  echo "Health check: FAILED"
  echo "$HEALTH"
  exit 1
fi
