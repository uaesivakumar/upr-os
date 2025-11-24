#!/bin/bash
# Setup GCP Uptime Checks for automatic health monitoring
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏰ Setting Up Uptime Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"

# Get service URLs
WEB_URL=$(gcloud run services describe upr-web-service --region $REGION --format="value(status.url)")
COMING_SOON_URL=$(gcloud run services describe coming-soon-service --region $REGION --format="value(status.url)")

# Extract hostnames (remove https://)
WEB_HOST=$(echo "$WEB_URL" | sed 's|https://||')
COMING_SOON_HOST=$(echo "$COMING_SOON_URL" | sed 's|https://||')

echo "Creating uptime check for upr-web-service..."
gcloud monitoring uptime create http "upr-web-service-uptime" \
  --resource-type="uptime-url" \
  --host="$WEB_HOST" \
  --path="/health" \
  --check-interval=5m \
  --timeout=10s \
  --content-matchers="" \
  --display-name="UPR Web Service Uptime" \
  --quiet \
  2>/dev/null || echo "✓ Uptime check already exists"

echo "Creating uptime check for coming-soon-service..."
gcloud monitoring uptime create http "coming-soon-service-uptime" \
  --resource-type="uptime-url" \
  --host="$COMING_SOON_HOST" \
  --path="/" \
  --check-interval=5m \
  --timeout=10s \
  --content-matchers="" \
  --display-name="Coming Soon Service Uptime" \
  --quiet \
  2>/dev/null || echo "✓ Uptime check already exists"

echo ""
echo "✅ Uptime checks configured!"
echo ""
echo "📊 View uptime checks:"
echo "   https://console.cloud.google.com/monitoring/uptime?project=$PROJECT_ID"
echo ""
echo "Next steps:"
echo "1. Configure notification channels (email, Slack)"
echo "2. Link uptime checks to notification channels"
echo "3. Set alert thresholds (e.g., 2 failures in 5 minutes)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
