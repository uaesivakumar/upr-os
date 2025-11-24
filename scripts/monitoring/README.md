# Automated Monitoring - Sprint 28

## Overview

This directory contains automated monitoring scripts for Phase 10 (Feedback & Reinforcement Analytics) of the SIVA framework.

The monitoring system runs every 6 hours via Cloud Scheduler to check:
- ✅ Rule engine success rates
- ✅ Confidence score trends
- ✅ Shadow mode agreement rates (inline vs rule engine)
- ✅ Pending feedback accumulation
- ✅ A/B test performance

## Architecture

```
┌─────────────────────┐
│  Cloud Scheduler    │  Every 6 hours
│  (0 */6 * * *)      │
└──────────┬──────────┘
           │ HTTP POST
           ▼
┌─────────────────────────────────────────┐
│  Cloud Run Service                      │
│  /api/monitoring/check-rule-performance │
└──────────┬──────────────────────────────┘
           │ executes
           ▼
┌─────────────────────────────────────────┐
│  checkRulePerformance.js                │
│  - Queries agent_decisions table        │
│  - Analyzes metrics vs thresholds       │
│  - Sends alerts to Sentry/Slack         │
│  - Creates training samples             │
└─────────────────────────────────────────┘
```

## Files

### Scripts

- **`checkRulePerformance.js`** - Main monitoring script
  - Checks 4 key metrics against thresholds
  - Sends alerts to Sentry and Slack
  - Auto-generates training samples from failures
  - Exit code 0 (success) or 1 (critical alerts)

- **`analyzeABTest.js`** - A/B test analysis script
  - Compares control vs test version performance
  - Statistical significance testing
  - Recommendation engine

### Configuration

- **`cloud-scheduler-config.yaml`** - Cloud Scheduler job configuration
  - Schedule: `0 */6 * * *` (every 6 hours)
  - Timeout: 600s (10 minutes)
  - Retry: 3 attempts with exponential backoff

### Deployment

- **`setup-cloud-scheduler.sh`** - Automated setup script
  - Creates/updates Cloud Scheduler job
  - Configures OIDC authentication
  - Tests the configuration

### Routes

- **`/routes/monitoring.js`** - HTTP endpoints for monitoring
  - `POST /api/monitoring/check-rule-performance` - Triggered by Cloud Scheduler
  - `POST /api/monitoring/analyze-ab-test` - Manual A/B test analysis
  - `GET /api/monitoring/health` - Health check

## Setup

### Prerequisites

1. **GCP Project**: `applied-algebra-474804-e6`
2. **Cloud Run Service**: `upr-web-service` (us-central1)
3. **Service Account**: `upr-cloud-run@applied-algebra-474804-e6.iam.gserviceaccount.com`
4. **Environment Variables**:
   - `DATABASE_URL` - PostgreSQL connection string
   - `SENTRY_DSN` - Sentry error tracking
   - `SLACK_WEBHOOK_URL` - Slack notifications (optional)

### Installation

1. **Deploy the monitoring route** (already in server.js):
   ```bash
   # The route is automatically included when you deploy the Cloud Run service
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Set up Cloud Scheduler**:
   ```bash
   cd scripts/monitoring
   ./setup-cloud-scheduler.sh
   ```

3. **Verify setup**:
   ```bash
   gcloud scheduler jobs describe rule-performance-monitor \
     --location=us-central1 \
     --project=applied-algebra-474804-e6
   ```

4. **Test immediately** (optional):
   ```bash
   gcloud scheduler jobs run rule-performance-monitor \
     --location=us-central1 \
     --project=applied-algebra-474804-e6
   ```

## Monitoring Thresholds

The system triggers alerts when:

| Metric | Threshold | Sample Size | Severity |
|--------|-----------|-------------|----------|
| Success Rate | < 85% | 100+ feedback | 🔴 Critical |
| Avg Confidence | < 0.75 | 200+ decisions | 🟡 Warning |
| Pending Feedback | > 100 decisions | N/A | 🔵 Info |
| Match Rate (Shadow) | < 90% | 50+ decisions | 🟡 Warning |

## Alert Actions

When alerts trigger:

1. **Sentry Alert** - Error/warning/info level based on severity
2. **Slack Notification** - If `SLACK_WEBHOOK_URL` configured
3. **Training Samples** - Auto-created from failed decisions (critical only)
4. **Exit Code 1** - For critical alerts (Cloud Scheduler marks as failed)

## Manual Execution

### Check Rule Performance
```bash
# Check all tools
node scripts/monitoring/checkRulePerformance.js

# Check specific tool
node scripts/monitoring/checkRulePerformance.js --tool=CompanyQualityTool
```

### Analyze A/B Tests
```bash
# Analyze all tools
node scripts/monitoring/analyzeABTest.js

# Analyze specific tool
node scripts/monitoring/analyzeABTest.js --tool=ContactTierTool
```

### Trigger via HTTP
```bash
# Manual trigger (requires authentication)
curl -X POST \
  https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/check-rule-performance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{"source":"manual"}'
```

## Logs and Debugging

### View Scheduler Logs
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=rule-performance-monitor" \
  --limit=20 \
  --format="table(timestamp,severity,jsonPayload.message)" \
  --project=applied-algebra-474804-e6
```

### View Cloud Run Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=upr-web-service AND textPayload=~'Monitoring'" \
  --limit=50 \
  --project=applied-algebra-474804-e6
```

### View Sentry Events
- Dashboard: https://sentry.io/organizations/upr/issues/
- Filter: `alert_type:rule_performance`

## Configuration Updates

### Change Schedule
```bash
gcloud scheduler jobs update http rule-performance-monitor \
  --schedule="0 */4 * * *" \  # Every 4 hours instead of 6
  --location=us-central1 \
  --project=applied-algebra-474804-e6
```

### Update Thresholds
Edit `checkRulePerformance.js`:
```javascript
const THRESHOLDS = {
  MIN_SUCCESS_RATE: 0.90,           // 90% instead of 85%
  MIN_CONFIDENCE: 0.80,             // 0.80 instead of 0.75
  MAX_PENDING_FEEDBACK: 50,         // 50 instead of 100
  MAX_MATCH_RATE_DEGRADATION: 0.05  // 5% instead of 10%
};
```

### Add Slack Notifications
```bash
# Set environment variable in Cloud Run
gcloud run services update upr-web-service \
  --update-env-vars SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  --region=us-central1 \
  --project=applied-algebra-474804-e6
```

## Database Schema

The monitoring system reads from:

```sql
-- Agent decisions (Sprint 22+)
agent_core.agent_decisions (
  decision_id UUID PRIMARY KEY,
  tool_name TEXT,
  rule_version TEXT,
  input_data JSONB,
  output_data JSONB,  -- Contains {inline, rule, comparison, ab_test}
  confidence_score DECIMAL,
  latency_ms INTEGER,
  decided_at TIMESTAMP
)

-- Decision feedback (Sprint 22+)
agent_core.decision_feedback (
  feedback_id UUID PRIMARY KEY,
  decision_id UUID REFERENCES agent_decisions,
  outcome_positive BOOLEAN,
  outcome_type TEXT,
  notes TEXT,
  created_at TIMESTAMP
)

-- Training samples (Sprint 22+)
agent_core.training_samples (
  sample_id TEXT PRIMARY KEY,
  tool_name TEXT,
  rule_version TEXT,
  input_data JSONB,
  expected_output JSONB,
  actual_output JSONB,
  sample_type TEXT,
  quality_score DECIMAL,
  created_at TIMESTAMP
)
```

## Troubleshooting

### Job Not Triggering
1. Check Cloud Scheduler is enabled: `gcloud services list --enabled | grep scheduler`
2. Verify service account has `run.invoker` role
3. Check schedule syntax is valid: https://crontab.guru/#0_*/6_*_*_*

### Script Failures
1. Check database connectivity: `GET /api/monitoring/health`
2. Verify environment variables are set
3. Check Cloud Run logs for errors

### No Alerts Despite Issues
1. Verify sample size requirements are met (100+ feedback, 200+ decisions)
2. Check time window (last 7 days) has sufficient data
3. Confirm Sentry DSN is configured

## Sprint 28 Status

✅ **Completed**:
- Cloud Scheduler configuration created
- HTTP endpoint implemented (`/api/monitoring/check-rule-performance`)
- Monitoring route registered in server.js
- Setup script with OIDC authentication
- Documentation and troubleshooting guide

⏳ **Pending**:
- Deploy to production
- Run initial test
- Configure Slack webhook (optional)
- Verify alerts trigger correctly

## Related Documentation

- [Sprint 27: A/B Testing Infrastructure](../../docs/SPRINT_27_AB_TESTING.md)
- [Phase 10: Feedback Loop Architecture](../../docs/PHASE_10_FEEDBACK_LOOP.md)
- [SIVA Tools API](../../docs/SIVA_TOOLS_API.md)
