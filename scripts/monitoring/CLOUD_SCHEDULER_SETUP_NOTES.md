# Cloud Scheduler Setup Notes - Sprint 28

## Issue Encountered

Cloud Scheduler requires an App Engine application to be created in the project before it can be used. Currently, the project `applied-algebra-474804-e6` does not have an App Engine application.

## Options for Automated Monitoring

### Option 1: Create App Engine Application (Recommended for Production)

```bash
# Create App Engine app in us-central region
gcloud app create --region=us-central --project=applied-algebra-474804-e6

# Then run the setup script
bash scripts/monitoring/setup-cloud-scheduler.sh
```

**Pros**:
- Native GCP integration
- Reliable scheduling
- Built-in retry logic
- Low cost (free tier available)

**Cons**:
- Requires App Engine (adds infrastructure)
- One-time setup needed

### Option 2: Use Cloud Run Jobs (Alternative)

```bash
# Create a Cloud Run Job instead of Cloud Scheduler
gcloud run jobs create rule-performance-monitor \
  --image gcr.io/applied-algebra-474804-e6/monitoring:latest \
  --region us-central1 \
  --execute-now

# Schedule via external cron (e.g., GitHub Actions, CI/CD)
```

**Pros**:
- No App Engine required
- More flexible
- Can use containerized monitoring scripts

**Cons**:
- Requires external scheduler
- More complex setup

### Option 3: Manual Triggering (Current State)

```bash
# Trigger monitoring manually via HTTP
curl -X POST \
  https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/check-rule-performance \
  -H "Content-Type: application/json" \
  -d '{"source":"manual"}'

# Or run the script directly
node scripts/monitoring/checkRulePerformance.js
```

**Pros**:
- No additional infrastructure
- Works immediately
- Good for testing

**Cons**:
- Manual effort required
- Not truly automated

### Option 4: Compute Engine Cron (Simple Alternative)

If you have a Compute Engine instance:

```bash
# Add to crontab on compute instance
# Run every 6 hours
0 */6 * * * curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/check-rule-performance -H "Content-Type: application/json" -d '{"source":"cron"}'
```

**Pros**:
- Simple setup
- No App Engine needed
- Uses existing infrastructure

**Cons**:
- Requires a running compute instance
- Less reliable than Cloud Scheduler

## Recommendation

For Sprint 28 completion, **Option 3 (Manual Triggering)** is sufficient for testing and validation. The monitoring infrastructure is fully implemented and working.

For production use, create the App Engine app and set up Cloud Scheduler using **Option 1**.

## Current Status

✅ **Monitoring System**: Fully implemented and deployed
✅ **HTTP Endpoint**: Working (`/api/monitoring/check-rule-performance`)
✅ **Monitoring Script**: Tested and functional
✅ **Setup Script**: Ready (`setup-cloud-scheduler.sh`)
⏳ **Cloud Scheduler**: Requires App Engine app creation
⏳ **Automated Scheduling**: Manual for now, can be automated later

## Quick Test

Test the monitoring endpoint immediately:

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/health

curl -X POST \
  https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/check-rule-performance \
  -H "Content-Type: application/json" \
  -d '{"source":"test"}'
```

## Next Steps (Optional - Post-Sprint 28)

1. Decide on App Engine app creation (discuss with team)
2. If approved, run: `gcloud app create --region=us-central --project=applied-algebra-474804-e6`
3. Run setup script: `bash scripts/monitoring/setup-cloud-scheduler.sh`
4. Verify job runs every 6 hours
5. Set up Slack webhook for alerts (optional)

---

**Note**: All monitoring functionality is working. The only missing piece is the automated scheduling, which can be added later based on infrastructure decisions.
