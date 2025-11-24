#!/bin/bash
# Emergency GCP Cost Reduction Script
# This script immediately applies cost optimizations to your Cloud Run services

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"

echo "🚨 EMERGENCY COST REDUCTION - Applying optimizations..."
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Apply the optimized configurations
echo "📦 Deploying optimized web service..."
gcloud run services replace cloud-run-web-service.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

echo ""
echo "📦 Deploying optimized worker service..."
gcloud run services replace cloud-run-worker.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

echo ""
echo "✅ Cost optimizations applied!"
echo ""
echo "🔍 Verifying current configurations..."
echo ""

# Verify web service
echo "--- Web Service ---"
gcloud run services describe upr-web-service \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    spec.template.metadata.annotations['autoscaling.knative.dev/minScale'],
    spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'],
    spec.template.spec.containers[0].resources.limits.cpu,
    spec.template.spec.containers[0].resources.limits.memory
  )"

echo ""
echo "--- Worker Service ---"
gcloud run services describe upr-enrichment-worker \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    spec.template.metadata.annotations['autoscaling.knative.dev/minScale'],
    spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'],
    spec.template.spec.containers[0].resources.limits.cpu,
    spec.template.spec.containers[0].resources.limits.memory,
    spec.template.spec.timeoutSeconds
  )"

echo ""
echo "💰 Expected savings: ~70-90% reduction in Cloud Run costs"
echo ""
echo "🔍 Next steps:"
echo "1. Check other potential cost drivers:"
echo "   ./scripts/check-gcp-costs.sh"
echo "2. Monitor billing for 24-48 hours"
echo "3. Consider additional optimizations if needed"
