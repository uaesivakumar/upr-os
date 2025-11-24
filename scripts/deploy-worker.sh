#!/bin/bash
set -e

echo "🚀 Deploying upr-worker with secrets..."

gcloud run deploy upr-worker \
  --source . \
  --region us-central1 \
  --no-allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=900s \
  --min-instances=1 \
  --no-cpu-throttling \
  --set-env-vars WORKER_MODE=true \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,\
APOLLO_API_KEY=APOLLO_API_KEY:latest,\
SERPAPI_KEY=SERPAPI_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
NEVERBOUNCE_API_KEY=NEVERBOUNCE_API_KEY:latest,\
TENANT_ID=TENANT_ID:latest,\
REDIS_URL=REDIS_URL:latest,\
HUNTER_API_KEY=HUNTER_API_KEY:latest

echo "✅ Worker deployment complete!"
