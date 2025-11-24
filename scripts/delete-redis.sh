#!/bin/bash
# Delete Redis/Memorystore instance (saves ~$35/month)
# WARNING: Only run this if you're SURE your app doesn't need Redis

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
INSTANCE_NAME="upr-redis-instance"

echo "⚠️  WARNING: You are about to DELETE the Redis instance!"
echo ""
echo "Instance: $INSTANCE_NAME"
echo "Region: $REGION"
echo "Savings: ~$35/month"
echo ""
read -p "Are you ABSOLUTELY SURE? Type 'DELETE' to confirm: " confirm

if [ "$confirm" != "DELETE" ]; then
  echo "❌ Aborted. Redis instance NOT deleted."
  exit 0
fi

echo ""
echo "🗑️  Deleting Redis instance..."
gcloud redis instances delete $INSTANCE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID

echo ""
echo "✅ Redis instance deleted!"
echo "💰 You'll save ~$35/month"
echo ""
echo "⚠️  IMPORTANT: Remove REDIS_URL from your Cloud Run service configs"
echo "   and update your code to not depend on Redis."
