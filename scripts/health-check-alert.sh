#!/bin/bash
# Health check with Slack alerts
# Usage: ./scripts/health-check-alert.sh
# Cron: */5 * * * * /path/to/health-check-alert.sh

REGION="us-central1"
ALERTS=()
WARNINGS=()

check_service() {
  SERVICE=$1

  # Get service status
  STATUS=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")
  URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)" 2>/dev/null || echo "")

  if [ "$STATUS" = "True" ]; then
    # Try to ping the service (only for web services)
    if [ "$SERVICE" = "upr-web-service" ] || [ "$SERVICE" = "coming-soon-service" ]; then
      if [ -n "$URL" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" --max-time 10 || echo "000")
        if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "302" ]; then
          ALERTS+=("❌ $SERVICE: Unreachable (HTTP $HTTP_CODE)")
        fi
      fi
    fi
  elif [ "$STATUS" = "NOT_FOUND" ]; then
    ALERTS+=("❌ $SERVICE: NOT FOUND")
  else
    WARNINGS+=("⚠️ $SERVICE: Status = $STATUS")
  fi
}

# Check all services
check_service "upr-web-service"
check_service "upr-hiring-signals-worker"
check_service "upr-worker"
check_service "upr-enrichment-worker"
check_service "coming-soon-service"

# Check database
DB_STATUS=$(gcloud sql instances describe upr-postgres --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
if [ "$DB_STATUS" != "RUNNABLE" ]; then
  ALERTS+=("❌ Database upr-postgres: $DB_STATUS")
fi

# Send Slack notification if there are alerts
if [ ${#ALERTS[@]} -gt 0 ] || [ ${#WARNINGS[@]} -gt 0 ]; then
  if [ -n "$SLACK_WEBHOOK_URL" ]; then

    # Build message
    MESSAGE="*UPR Health Check Alert*\n\n"

    if [ ${#ALERTS[@]} -gt 0 ]; then
      MESSAGE+="*Critical Issues:*\n"
      for alert in "${ALERTS[@]}"; do
        MESSAGE+="$alert\n"
      done
      MESSAGE+="\n"
    fi

    if [ ${#WARNINGS[@]} -gt 0 ]; then
      MESSAGE+="*Warnings:*\n"
      for warning in "${WARNINGS[@]}"; do
        MESSAGE+="$warning\n"
      done
    fi

    # Send to Slack
    curl -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"$MESSAGE\"}" \
      --silent

    echo "Alert sent to Slack"
  else
    echo "Alerts detected but SLACK_WEBHOOK_URL not configured:"
    for alert in "${ALERTS[@]}"; do
      echo "$alert"
    done
    for warning in "${WARNINGS[@]}"; do
      echo "$warning"
    done
  fi

  exit 1
else
  echo "All services healthy ✅"
  exit 0
fi
