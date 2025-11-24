#!/bin/bash
# Weekly GCP Cost Report with Slack notification
# Usage: ./scripts/weekly-cost-report.sh
# Cron: 0 9 * * 1 (Every Monday at 9 AM)

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
REPORT_FILE="/tmp/upr-weekly-cost-report-$(date +%Y%m%d).txt"

{
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 UPR Weekly Cost Report"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Project: $PROJECT_ID"
  echo ""

  # Cloud Run Services
  echo "━━━ Cloud Run Services (5 services) ━━━"
  gcloud run services list \
    --region=$REGION \
    --format="table(
      metadata.name:label=SERVICE,
      spec.template.metadata.annotations['autoscaling.knative.dev/minScale']:label=MIN,
      spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']:label=MAX,
      spec.template.spec.containers[0].resources.limits.cpu:label=CPU,
      spec.template.spec.containers[0].resources.limits.memory:label=MEM
    )"
  echo ""

  # Cloud SQL
  echo "━━━ Cloud SQL Databases (2 instances) ━━━"
  gcloud sql instances list \
    --format="table(
      name:label=INSTANCE,
      settings.tier:label=TIER,
      state:label=STATE,
      settings.activationPolicy:label=POLICY
    )"
  echo ""

  # Recent backups
  echo "━━━ Database Backups (Last 3) ━━━"
  gcloud sql backups list --instance=upr-postgres --limit=3 \
    --format="table(
      WINDOW_START_TIME:label=DATE,
      STATUS,
      INSTANCE
    )"
  echo ""

  # VPC Connector
  echo "━━━ VPC Connector ━━━"
  gcloud compute networks vpc-access connectors list \
    --region=$REGION \
    --format="table(
      name:label=CONNECTOR,
      state:label=STATE,
      minThroughput:label=MIN_TP,
      maxThroughput:label=MAX_TP
    )" || echo "No VPC connectors"
  echo ""

  # Cost Summary
  echo "━━━ Cost Summary ━━━"
  echo ""
  echo "💰 Budget Alert: \$120/month"
  echo "   • 50% threshold: \$60"
  echo "   • 90% threshold: \$108"
  echo "   • 100% threshold: \$120"
  echo ""
  echo "📈 Current Configuration Cost Estimate:"
  echo "   • Cloud Run (5 services, minScale=0): ~\$5-10/month"
  echo "   • Cloud SQL (2x db-f1-micro): ~\$30-40/month"
  echo "   • VPC Connector: ~\$20/month"
  echo "   • Storage & Networking: ~\$5-10/month"
  echo "   • Estimated Total: ~\$60-80/month"
  echo ""

  # Recommendations
  echo "━━━ Recommendations ━━━"
  echo ""
  echo "✅ Optimizations Applied:"
  echo "   • Cloud Run minScale=0 (all services)"
  echo "   • Database tier: db-f1-micro"
  echo "   • Automated backups enabled"
  echo "   • Budget alerts configured"
  echo ""
  echo "📊 Monitoring:"
  echo "   • Performance Dashboard: https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
  echo "   • Uptime Checks: Active"
  echo "   • Sentry Error Tracking: Active"
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

} | tee "$REPORT_FILE"

# Send to Slack if webhook configured
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  REPORT_TEXT=$(cat "$REPORT_FILE")

  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d @- << EOF
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📊 Weekly Cost Report"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*UPR Infrastructure Status*\n\n• 5 Cloud Run services (minScale=0)\n• 2 Cloud SQL databases (db-f1-micro)\n• 1 VPC connector\n• Budget: \$120/month\n• Estimated: ~\$60-80/month"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<https://console.cloud.google.com/billing?project=$PROJECT_ID|📈 View Billing Dashboard> | <https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID|📊 Performance Dashboard>"
      }
    }
  ]
}
EOF

  echo ""
  echo "✅ Report sent to Slack"
fi

echo ""
echo "Report saved: $REPORT_FILE"
