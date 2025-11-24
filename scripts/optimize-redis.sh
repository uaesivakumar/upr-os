#!/bin/bash
# Redis/Memorystore Optimization
# Current: 1GB BASIC tier (~$35/month, always running)
# Options: Reduce to smallest tier or delete if not critical

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
INSTANCE_NAME="upr-redis-instance"

echo "🔍 Analyzing Redis/Memorystore instance..."
echo ""

# Get current instance info
gcloud redis instances describe $INSTANCE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    name,
    tier,
    memorySizeGb,
    state,
    createTime
  )"

echo ""
echo "💰 Current Redis cost: ~$35-40/month (1GB BASIC, always running)"
echo ""
echo "🎯 Optimization options:"
echo ""
echo "Option 1: Delete Redis (if not critical for production)"
echo "   Savings: ~$35/month"
echo "   Risk: Medium - need to verify if app depends on it"
echo "   Command:"
echo "     gcloud redis instances delete $INSTANCE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
echo "Option 2: Keep Redis but use local Redis for dev"
echo "   Savings: ~$0 (but ensures you need it)"
echo "   Risk: Low"
echo ""
echo "Option 3: Reduce tier (already at smallest for BASIC)"
echo "   Note: BASIC is already the cheapest. Can't reduce further."
echo ""

# Check Redis usage in code
echo "🔍 Checking if Redis is actively used in your codebase..."
echo ""

if grep -r "REDIS_URL" --include="*.js" --include="*.ts" . 2>/dev/null | head -5; then
  echo ""
  echo "⚠️  Redis IS used in your code. Review dependencies before deleting."
else
  echo "✅ No obvious Redis usage found in code."
fi

echo ""
echo "❓ Do you want to:"
echo "   A) Delete Redis instance (saves $35/month)"
echo "   B) Keep it as-is"
echo ""
echo "To delete: ./scripts/delete-redis.sh"
echo "To keep: Do nothing"
