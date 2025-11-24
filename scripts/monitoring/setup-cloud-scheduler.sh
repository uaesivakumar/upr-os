#!/bin/bash
#
# Setup Cloud Scheduler for Automated Rule Performance Monitoring
# Sprint 28 - Phase 10: Feedback & Reinforcement Analytics
#
# This script creates a Cloud Scheduler job that triggers automated monitoring
# every 6 hours to check shadow mode agreement rates and alert if below thresholds
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Project: applied-algebra-474804-e6
# - Service account: upr-cloud-run@applied-algebra-474804-e6.iam.gserviceaccount.com
# - Cloud Run service: upr-web-service running on us-central1

set -euo pipefail

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
SCHEDULER_JOB_NAME="rule-performance-monitor"
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"
SERVICE_ACCOUNT="upr-cloud-run@${PROJECT_ID}.iam.gserviceaccount.com"

echo "════════════════════════════════════════════════════════════"
echo "Setting up Cloud Scheduler for Automated Monitoring"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Job Name: ${SCHEDULER_JOB_NAME}"
echo "Target URL: ${SERVICE_URL}/api/monitoring/check-rule-performance"
echo "Schedule: Every 6 hours (0 */6 * * *)"
echo ""

# Check if Cloud Scheduler API is enabled
echo "📋 Checking Cloud Scheduler API..."
gcloud services enable cloudscheduler.googleapis.com --project="${PROJECT_ID}" 2>/dev/null || true
echo "✅ Cloud Scheduler API enabled"
echo ""

# Delete existing job if it exists
echo "🗑️  Checking for existing scheduler job..."
if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" &>/dev/null; then
  echo "⚠️  Job '${SCHEDULER_JOB_NAME}' already exists. Deleting..."
  gcloud scheduler jobs delete "${SCHEDULER_JOB_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --quiet
  echo "✅ Existing job deleted"
else
  echo "ℹ️  No existing job found"
fi
echo ""

# Create the scheduler job
echo "🚀 Creating Cloud Scheduler job..."
gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
  --location="${REGION}" \
  --schedule="0 */6 * * *" \
  --uri="${SERVICE_URL}/api/monitoring/check-rule-performance" \
  --http-method=POST \
  --headers="Content-Type=application/json,User-Agent=CloudScheduler/Sprint28" \
  --message-body='{"source":"cloud-scheduler","triggered_at":"scheduled"}' \
  --oidc-service-account-email="${SERVICE_ACCOUNT}" \
  --oidc-token-audience="${SERVICE_URL}" \
  --attempt-deadline=600s \
  --max-retry-attempts=3 \
  --max-retry-duration=3600s \
  --min-backoff=5s \
  --max-backoff=300s \
  --max-doublings=5 \
  --time-zone="UTC" \
  --description="Automated Rule Performance Monitoring - Runs every 6 hours to check shadow mode agreement rates" \
  --project="${PROJECT_ID}"

echo "✅ Cloud Scheduler job created successfully!"
echo ""

# Verify the job was created
echo "📊 Verifying job configuration..."
gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}"
echo ""

# Test the job immediately (optional)
read -p "🧪 Do you want to trigger a test run now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔄 Triggering test run..."
  gcloud scheduler jobs run "${SCHEDULER_JOB_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}"
  echo "✅ Test run triggered. Check logs at:"
  echo "   https://console.cloud.google.com/cloudscheduler?project=${PROJECT_ID}"
  echo ""

  echo "⏳ Waiting 10 seconds for execution..."
  sleep 10

  echo "📋 Recent job execution logs:"
  gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=${SCHEDULER_JOB_NAME}" \
    --limit=5 \
    --format="table(timestamp,severity,jsonPayload.message)" \
    --project="${PROJECT_ID}" \
    2>/dev/null || echo "⚠️  No logs available yet. Check Cloud Console for execution status."
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Cloud Scheduler Setup Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "1. Monitor job executions: https://console.cloud.google.com/cloudscheduler?project=${PROJECT_ID}"
echo "2. Check logs: https://console.cloud.google.com/logs?project=${PROJECT_ID}"
echo "3. Set up Slack webhook (optional): SLACK_WEBHOOK_URL environment variable"
echo "4. Configure Sentry alerts: SENTRY_DSN environment variable"
echo ""
echo "The job will run every 6 hours and check:"
echo "  - Success rate < 85% (100+ feedback samples)"
echo "  - Avg confidence < 0.75 (200+ decisions)"
echo "  - Pending feedback > 100 (unanalyzed decisions)"
echo "  - Match rate degraded > 10% (inline vs rule mismatch)"
echo ""
