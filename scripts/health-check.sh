#!/bin/bash
# Health check for all services
# Usage: ./scripts/health-check.sh

REGION="us-central1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏥 UPR Services Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_service() {
  SERVICE=$1
  echo "Checking $SERVICE..."

  # Get service status
  STATUS=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")
  URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)" 2>/dev/null || echo "")

  if [ "$STATUS" = "True" ]; then
    # Try to ping the service
    if [ -n "$URL" ]; then
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" --max-time 10 || echo "000")
      if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
        echo "  ✅ HEALTHY (HTTP $HTTP_CODE)"
      else
        echo "  ⚠️  DEPLOYED but unreachable (HTTP $HTTP_CODE)"
      fi
    else
      echo "  ✅ DEPLOYED"
    fi
  elif [ "$STATUS" = "NOT_FOUND" ]; then
    echo "  ❌ NOT FOUND"
  else
    echo "  ⚠️  ISSUES DETECTED"
  fi
  echo ""
}

# Check all services
check_service "upr-web-service"
check_service "upr-hiring-signals-worker"
check_service "upr-worker"
check_service "upr-enrichment-worker"
check_service "coming-soon-service"

# Check databases
echo "Checking databases..."
DB_STATUS=$(gcloud sql instances describe upr-postgres --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
if [ "$DB_STATUS" = "RUNNABLE" ]; then
  echo "  ✅ upr-postgres: RUNNABLE"
else
  echo "  ⚠️  upr-postgres: $DB_STATUS"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
