#!/bin/bash
set -e

echo "🚀 Deploying upr-web-service with secrets..."

gcloud run deploy upr-web-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300s \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,\
UPR_ADMIN_USER=UPR_ADMIN_USER:latest,\
UPR_ADMIN_PASS=UPR_ADMIN_PASS:latest,\
JWT_SECRET=JWT_SECRET:latest,\
APOLLO_API_KEY=APOLLO_API_KEY:latest,\
SERPAPI_KEY=SERPAPI_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
NEVERBOUNCE_API_KEY=NEVERBOUNCE_API_KEY:latest,\
TENANT_ID=TENANT_ID:latest,\
RADAR_ENABLED=RADAR_ENABLED:latest,\
MAX_RUN_BUDGET_USD=MAX_RUN_BUDGET_USD:latest,\
REDIS_URL=REDIS_URL:latest,\
HUNTER_API_KEY=HUNTER_API_KEY:latest

echo "✅ Deployment complete!"
echo "🧪 Running smoke tests..."

export SERVICE_URL="https://upr.sivakumar.ai"
export ADMIN_USER=$(gcloud secrets versions access latest --secret=UPR_ADMIN_USER)
export ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=UPR_ADMIN_PASS)

./tests/smoke-tests.sh
