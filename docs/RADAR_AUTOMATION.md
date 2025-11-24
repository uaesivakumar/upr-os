# RADAR Automation System

**Status:** Active
**Implementation Date:** 2025-11-10
**Sprint:** 18 - Task 4
**Priority:** P1

---

## Overview

Automated daily RADAR discovery system that runs at 9 AM Dubai time to continuously discover new business signals without manual intervention.

## System Architecture

```
Cloud Scheduler (9 AM Dubai time)
    ↓
POST /api/radar/run
    ↓
RadarService.createRun() → Database run record
    ↓
runRadarScan() → Background execution
    ↓
Signal Discovery → Database storage
    ↓
Email Digest → Admin notification
    ↓
Sentry Tracking → Error monitoring
```

## Cloud Scheduler Configuration

### Job Details

```bash
Job Name: radar-daily-run
Location: us-central1
Schedule: 0 9 * * * (cron format)
Time Zone: Asia/Dubai
State: ENABLED
Next Run: 2025-11-11T05:00:00Z
```

### HTTP Target

```
Method: POST
URL: https://upr-web-service-191599223867.us-central1.run.app/api/radar/run
Headers:
  Content-Type: application/json
  User-Agent: Google-Cloud-Scheduler

Body:
{
  "source": "scheduled",
  "budgetLimitUsd": 5,
  "notify": true
}
```

### Retry Configuration

```yaml
Max Retry Duration: 0s (disabled)
Max Backoff Duration: 3600s (1 hour)
Max Doublings: 5
Min Backoff Duration: 5s
Attempt Deadline: 180s (3 minutes)
```

**Retry Schedule:**
1. Attempt 1: Immediate
2. Attempt 2: 5s delay
3. Attempt 3: 10s delay
4. Attempt 4: 20s delay
5. Attempt 5: 40s delay
6. Attempt 6: 80s delay

---

## API Endpoint

### POST /api/radar/run

**Purpose:** Trigger scheduled RADAR discovery scan

**Authentication:** None required (public endpoint for Cloud Scheduler)

**Request Body:**
```json
{
  "source": "scheduled",        // Run trigger source
  "budgetLimitUsd": 5,           // Max spend per run ($5)
  "notify": true                 // Send email notification
}
```

**Response:**
```json
{
  "run_id": "uuid-v4",
  "status": "queued",
  "message": "Scheduled radar scan started",
  "budget_limit": 5
}
```

**Status Codes:**
- `200 OK`: Scan started successfully
- `500 Internal Server Error`: Failed to start scan

---

## Features

### 1. Budget Cap Enforcement

- **Default:** $5 per run
- **Configurable:** Via request body
- **Safety:** Prevents runaway costs
- **Tracking:** Recorded in run history

### 2. Email Notifications

**Sent when:**
- Scan completes successfully
- Discoveries > 0
- `notify: true` in request

**Email content:**
```html
Subject: 🎯 RADAR Daily Digest: X new signals

<h2>RADAR Daily Discovery Report</h2>
<p><strong>Run ID:</strong> {run_id}</p>
<p><strong>Discovered:</strong> {count} new signals</p>
<p><strong>Budget Used:</strong> ${budget}</p>
<p><strong>Sources Scanned:</strong> {sources}</p>

<h3>Top Signals:</h3>
<ul>
  <li>Company A - Signal Type</li>
  <li>Company B - Signal Type</li>
  ...
</ul>

<a href="{APP_URL}/radar/runs/{run_id}">View Full Report</a>
```

**Recipient:** `process.env.ADMIN_EMAIL`

### 3. Sentry Error Tracking

**Events tracked:**
1. **Run Start** (info level)
   - Run ID
   - Budget limit
   - Source (scheduled)

2. **Run Success** (captured in job completion)
   - Discoveries count
   - Budget used
   - Sources scanned

3. **Run Error** (error level)
   - Error details
   - Run ID
   - Budget limit
   - Stack trace

**Sentry Tags:**
```javascript
{
  tool: 'radar',
  phase: 'scheduled-run' | 'scheduled-run-error' | 'scheduled-run-init-error',
  run_id: 'uuid-v4'
}
```

### 4. Run History Tracking

All runs stored in database with:
- `run_id` (UUID)
- `tenant_id`
- `trigger` ('scheduled')
- `status` ('queued' → 'running' → 'completed' | 'failed')
- `prompt_version` ('v1.1-uae-heuristic')
- `budget_limit_usd` (5.00)
- `budget_used_usd` (actual spend)
- `created_at` (timestamp)
- `completed_at` (timestamp)

**Query runs:**
```bash
GET /api/radar/runs?limit=20
GET /api/radar/runs/{run_id}
```

---

## Management

### View Scheduler Jobs

```bash
# List all scheduler jobs
gcloud scheduler jobs list --location=us-central1

# Describe specific job
gcloud scheduler jobs describe radar-daily-run --location=us-central1
```

### Manual Trigger

```bash
# Trigger scheduled run immediately (for testing)
gcloud scheduler jobs run radar-daily-run --location=us-central1
```

### Update Schedule

```bash
# Change schedule (e.g., to 8 AM)
gcloud scheduler jobs update http radar-daily-run \
  --location=us-central1 \
  --schedule="0 8 * * *"
```

### Update Budget Cap

```bash
# Change budget to $10
gcloud scheduler jobs update http radar-daily-run \
  --location=us-central1 \
  --message-body='{"source":"scheduled","budgetLimitUsd":10,"notify":true}'
```

### Pause/Resume

```bash
# Pause scheduled runs
gcloud scheduler jobs pause radar-daily-run --location=us-central1

# Resume scheduled runs
gcloud scheduler jobs resume radar-daily-run --location=us-central1
```

### Delete Job

```bash
# Delete scheduler job (CAUTION)
gcloud scheduler jobs delete radar-daily-run --location=us-central1
```

---

## Monitoring

### Cloud Logging

**View recent runs:**
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND \
  resource.labels.job_id=radar-daily-run" \
  --limit=50 \
  --format=json
```

**Filter by status:**
```bash
# Successful runs
gcloud logging read "resource.type=cloud_scheduler_job AND \
  resource.labels.job_id=radar-daily-run AND \
  httpRequest.status=200" \
  --limit=10

# Failed runs
gcloud logging read "resource.type=cloud_scheduler_job AND \
  resource.labels.job_id=radar-daily-run AND \
  httpRequest.status>=400" \
  --limit=10
```

### Sentry Dashboard

**Filter by tags:**
- `tool:radar`
- `phase:scheduled-run`
- `phase:scheduled-run-error`

**Alerts configured for:**
- Error rate > 5% (1 hour window)
- New error type detected
- Budget exceeded

### Database Queries

**Recent runs:**
```sql
SELECT
  run_id,
  status,
  trigger,
  budget_limit_usd,
  budget_used_usd,
  created_at,
  completed_at
FROM discovery_runs
WHERE trigger = 'scheduled'
ORDER BY created_at DESC
LIMIT 20;
```

**Daily statistics:**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(budget_used_usd) as total_cost
FROM discovery_runs
WHERE trigger = 'scheduled'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Expected Results

### Daily Output

**Typical run:**
- Duration: 2-5 minutes
- Discovered signals: 5-15
- Budget used: $1.50-$3.00
- Sources scanned: 3-5

**High-activity day:**
- Duration: 5-10 minutes
- Discovered signals: 20-30
- Budget used: $4.00-$5.00 (hits cap)
- Sources scanned: 5-8

### Email Frequency

- **Daily:** If discoveries > 0
- **None:** If no new signals found
- **Error notification:** Via Sentry (separate)

---

## Troubleshooting

### Issue: Scheduler not triggering

**Check job status:**
```bash
gcloud scheduler jobs describe radar-daily-run --location=us-central1
```

**Look for:**
- `state: ENABLED` (should be enabled)
- `lastAttemptTime` (should update after each run)
- `status.code` (should be 0 for success)

**Fix:**
```bash
# Resume if paused
gcloud scheduler jobs resume radar-daily-run --location=us-central1
```

### Issue: HTTP 401 Unauthorized

**Cause:** Endpoint requires authentication

**Fix:** The `/api/radar/run` endpoint is public (no auth required). If getting 401, check that the endpoint path is correct in scheduler job.

### Issue: HTTP 500 Internal Server Error

**Check logs:**
```bash
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  | grep "radar"
```

**Common causes:**
1. Database connection issue
2. Missing environment variables
3. RadarService error
4. Email service failure

**Fix:** Check Sentry for detailed error trace

### Issue: No email received

**Causes:**
1. No discoveries made (email only sent if discoveries > 0)
2. Email service configuration issue
3. `notify: false` in request body

**Check:**
```bash
# View Cloud Run logs for email send attempt
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  | grep "Email notification"
```

### Issue: Budget exceeded

**Symptoms:**
- Runs consistently use $5.00
- Scan stops before completing all sources

**Actions:**
1. Review source performance: `GET /api/radar/sources/performance`
2. Disable low-performing sources
3. Increase budget if justified
4. Optimize discovery queries

---

## Cost Management

### Budget Breakdown

**Per-run costs:**
- SerpAPI calls: $0.002-$0.005 per query
- OpenAI API: $0.50-$2.00 per run
- Cloud Run: $0.01-$0.05 per run
- **Total:** $1.50-$5.00 per run

**Monthly estimate:**
- Daily runs: 30
- Average per run: $2.50
- **Total:** $75/month

### Cost optimization tips:

1. **Reduce budget cap** if consistently under-used
2. **Disable expensive sources** with low ROI
3. **Optimize prompts** to reduce OpenAI tokens
4. **Cache results** to avoid duplicate queries

---

## Security

### Authentication

- Endpoint is **public** (no auth required)
- Only accessible via HTTPS
- Cloud Scheduler uses Google's IP range

### IP Allowlist (optional)

If additional security needed, restrict access to Cloud Scheduler IPs in Cloud Armor:

```bash
# Google Cloud Scheduler IP ranges
35.190.0.0/16
35.191.0.0/16
```

### Rate Limiting

Cloud Run automatically limits:
- Max 80 concurrent requests per container
- Max 1000 requests per container per second

---

## Roadmap

### Phase 3: RADAR Automation (Sprint 18) ✅

- [x] Cloud Scheduler job created
- [x] POST /api/radar/run endpoint
- [x] Budget cap enforcement
- [x] Email notifications
- [x] Sentry error tracking
- [x] Run history tracking

### Future Enhancements

- [ ] LinkedIn signal source integration (Task 5)
- [ ] Signal confidence scoring (Task 7)
- [ ] Slack notifications (in addition to email)
- [ ] Weekly digest (in addition to daily)
- [ ] Advanced budget management (per-source caps)
- [ ] Signal deduplication
- [ ] ML-based signal prioritization
- [ ] Multi-tenant support (per-tenant schedules)

---

## References

- Cloud Scheduler Docs: https://cloud.google.com/scheduler/docs
- RADAR Service: `server/services/radar.js`
- RADAR Routes: `routes/radar.js`
- RADAR Job: `jobs/radarJob.js`
- Sprint 18 Kickoff: `SPRINT_18_KICKOFF.md`
- Sprint 18 Phase Mapping: `SPRINT_18_PHASE_MAPPING.md`

---

**Last Updated:** 2025-11-10
**Status:** Active and Operational
**Next Scheduled Run:** 2025-11-11 09:00 Asia/Dubai
