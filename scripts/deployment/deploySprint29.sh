#!/bin/bash
# Sprint 29 Deployment Script
# Deploys Agent Hub REST API + MCP endpoints to GCP Cloud Run

set -e  # Exit on error

echo "════════════════════════════════════════════════════════"
echo "Sprint 29: Agent Hub Deployment to Cloud Run"
echo "════════════════════════════════════════════════════════"
echo ""

# Check if gcloud is configured
if ! command -v gcloud &> /dev/null; then
  echo "❌ Error: gcloud CLI not found"
  exit 1
fi

# Set project
PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
SERVICE_NAME="upr-web-service"

echo "📍 Project: $PROJECT_ID"
echo "📍 Region: $REGION"
echo "📍 Service: $SERVICE_NAME"
echo ""

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
echo ""

gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --quiet \
  2>&1 | tee /tmp/sprint29_deployment.log

echo ""
echo "════════════════════════════════════════════════════════"
echo "Deployment Complete"
echo "════════════════════════════════════════════════════════"
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)')
echo "✅ Service URL: $SERVICE_URL"
echo ""

# Test endpoints
echo "🧪 Testing Agent Hub endpoints..."
echo ""

echo "1. Health check:"
curl -s "$SERVICE_URL/api/agent-hub/v1/health" | jq .
echo ""

echo "2. List tools:"
curl -s "$SERVICE_URL/api/agent-hub/v1/tools" | jq '.tools[] | {name, display_name, status}'
echo ""

echo "3. List workflows:"
curl -s "$SERVICE_URL/api/agent-hub/v1/workflows" | jq '.workflows[] | {name, version, description}'
echo ""

echo "════════════════════════════════════════════════════════"
echo "✅ Sprint 29 Deployment Complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Agent Hub REST API Endpoints:"
echo "  - POST $SERVICE_URL/api/agent-hub/v1/execute-tool"
echo "  - POST $SERVICE_URL/api/agent-hub/v1/execute-workflow"
echo "  - GET  $SERVICE_URL/api/agent-hub/v1/tools"
echo "  - GET  $SERVICE_URL/api/agent-hub/v1/workflows"
echo "  - GET  $SERVICE_URL/api/agent-hub/v1/health"
echo ""
