#!/bin/bash
# Safe deployment script that GUARANTEES correct configuration

set -e

echo "🚀 UPR Safe Deployment"
echo "======================"
echo ""

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
REPOSITORY="upr-app-repo"

# Step 1: Build and push images
echo "📦 Building Docker images..."
echo ""

echo "Building web service..."
gcloud builds submit --tag us-central1-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/upr-web-service:latest

echo ""
echo "Building worker service..."
gcloud builds submit --tag us-central1-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/upr-enrichment-worker:latest

# Step 2: Deploy using declarative configs
echo ""
echo "🎯 Deploying web service..."
gcloud run services replace cloud-run-web-service.yaml \
  --region ${REGION} \
  --platform managed

echo ""
echo "🎯 Deploying worker service..."
gcloud run services replace cloud-run-worker.yaml \
  --region ${REGION} \
  --platform managed

# Step 3: Validate deployment
echo ""
echo "🔍 Validating deployment..."
./scripts/validate-deployment.sh

# Step 4: Health check
echo ""
echo "❤️  Running health checks..."
echo "Testing web service..."
curl -f https://upr.sivakumar.ai/health || (echo "❌ Health check failed!" && exit 1)

echo ""
echo "✅ Deployment complete and validated!"
echo "🌐 Web: https://upr.sivakumar.ai"
echo ""
echo "Services deployed:"
echo "  - upr-web-service (with REDIS_URL + VPC)"
echo "  - upr-enrichment-worker (with REDIS_URL + VPC)"
