#!/bin/bash
# FinOps Deployment Script
# Deploys optimized Cloud Run configurations

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"

echo "🚀 Deploying FinOps-optimized Cloud Run services..."

# Deploy web service
echo "📦 Deploying upr-web-service..."
gcloud run services replace cloud-run-web-service.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

# Deploy enrichment worker
echo "📦 Deploying upr-enrichment-worker..."
gcloud run services replace cloud-run-worker.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

echo "✅ Deployments complete!"
echo ""
echo "💰 Expected savings: $50-80/month from concurrency + CPU throttling"
echo "📊 Next steps:"
echo "  1. Monitor performance for 24 hours"
echo "  2. Apply lifecycle policy to storage buckets"
echo "  3. Enable billing export to BigQuery"
