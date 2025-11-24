# Sprint 18 - KICKOFF

**Date:** November 9, 2025
**Status:** 🟢 READY TO START
**Duration:** 2-3 weeks (estimated)
**Goal:** RADAR Automation + Production Reliability

---

## Sprint 18 Overview

### Strategic Context
Sprint 17 delivered exceptional infrastructure (SIVA Phase 12, database indexing, rate limiting) with production-ready performance (313 leads/sec, p95 < 2s). Sprint 18 builds on this foundation to automate RADAR discovery and harden production reliability.

### Primary Goals
1. **RADAR Automation** - Daily scheduled runs, LinkedIn source integration (11h)
2. **Production Reliability** - Webhook retry, monitoring, error recovery (18h)
3. **Signal Quality** - Confidence scoring for better lead prioritization (5h)

**Total Scope:** 29 hours over 2 weeks

---

## Task List

### Week 1: RADAR Automation (11 hours)

#### Task 4: Automated RADAR Scheduling ⚡ START HERE
- **Priority:** P1 (High)
- **Type:** Feature
- **ETA:** 4 hours
- **Tags:** #backend, #automation, #radar
- **Description:** Cloud Scheduler for daily RADAR runs at 9 AM Dubai time
- **Why First:**
  - Quick win (4h)
  - High impact (continuous signal discovery)
  - Unblocks Task 5 (LinkedIn source)
  - Zero dependencies

**Implementation:**
```bash
# Create Cloud Scheduler job
gcloud scheduler jobs create http radar-daily-run \
  --schedule="0 9 * * *" \
  --uri="https://upr-web-service-191599223867.us-central1.run.app/api/radar/run" \
  --http-method=POST \
  --time-zone="Asia/Dubai" \
  --headers="Content-Type=application/json" \
  --message-body='{"source":"scheduled","budgetLimitUsd":5,"notify":true}'
```

**Features:**
- Daily runs at 9 AM Dubai time
- Budget cap: $5 per run (safety limit)
- Email digest of discoveries sent to user
- Error notifications via Sentry
- Run history tracking in database

**Success Criteria:**
- Scheduler job created and active
- First manual test run successful
- Email digest received
- Automated run completes next day at 9 AM
- Error handling tested (simulate API failure)

---

#### Task 5: LinkedIn Signal Source
- **Priority:** P2 (Medium)
- **Type:** Feature
- **ETA:** 7 hours
- **Tags:** #backend, #api, #radar
- **Description:** Add LinkedIn company updates as RADAR signal source
- **Why Important:** More signals, better coverage, higher quality leads

**Signal Types to Detect:**
1. Company announcements (funding, acquisitions, expansions)
2. Leadership changes (new C-level hires)
3. Executive hires (VP+ level)
4. Office openings (geographical expansion)
5. Product launches (new offerings)

**Implementation Approach:**
```javascript
// New RADAR source module
// /routes/radar/sources/linkedin.js

import axios from 'axios';
import * as Sentry from '@sentry/node';

export async function detectLinkedInSignals(companyLinkedInUrl) {
  try {
    // Use RapidAPI LinkedIn Company Profile API
    const response = await axios.get(
      'https://linkedin-company-api.p.rapidapi.com/get-company-updates',
      {
        params: { url: companyLinkedInUrl, limit: 20 },
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'linkedin-company-api.p.rapidapi.com'
        }
      }
    );

    // Parse updates for hiring signals
    const signals = response.data.updates
      .filter(isHiringRelated)
      .map(parseToSignal);

    return signals;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: 'linkedin', operation: 'detectSignals' }
    });
    throw error;
  }
}
```

**API Options:**
1. **RapidAPI LinkedIn Scraper** (~$30/month for 1000 requests)
2. **Bright Data LinkedIn API** (~$50/month)
3. **PhantomBuster LinkedIn** (~$40/month)

**Success Criteria:**
- LinkedIn API integrated and tested
- Signals detected and stored in `hiring_signals` table
- Q-Score calculated using SIVA tools
- No rate limit issues (respect LinkedIn API limits)
- Cost tracking active (<$50/month budget)

---

### Week 2: Production Reliability (18 hours)

#### Task 6: Webhook Retry Logic
- **Priority:** P1 (High)
- **Type:** Feature
- **ETA:** 3 hours
- **Tags:** #backend, #reliability, #webhooks
- **Description:** Exponential backoff for failed webhook deliveries

**Retry Strategy:**
| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | Immediate | 0s |
| 2 | 1 minute | 1m |
| 3 | 5 minutes | 6m |
| 4 | 15 minutes | 21m |
| 5 | 1 hour | 1h 21m |

**Implementation:**
```javascript
// Use Bull MQ for retry queue
import Queue from 'bull';

const webhookQueue = new Queue('webhooks', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 60000 // 1 minute base delay
    }
  }
});

// Webhook delivery job
webhookQueue.process(async (job) => {
  const { url, payload, signalId } = job.data;

  const response = await axios.post(url, payload, {
    timeout: 10000, // 10s timeout
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': generateSignature(payload)
    }
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status}`);
  }

  // Mark webhook as delivered in database
  await markWebhookDelivered(signalId);
});
```

**Success Criteria:**
- Bull MQ queue operational
- Failed webhooks automatically retried
- Max 5 attempts with exponential backoff
- Dead letter queue for permanently failed webhooks
- Admin dashboard shows retry stats

---

#### Task 7: Signal Confidence Scoring
- **Priority:** P1 (High)
- **Type:** Feature
- **ETA:** 5 hours
- **Tags:** #backend, #ml, #radar
- **Description:** Add confidence scores to signals based on source quality

**Confidence Factors:**
```javascript
function calculateSignalConfidence(signal) {
  let confidence = 0;

  // Factor 1: Source credibility (40%)
  const sourceScores = {
    'linkedin': 0.9,      // Official company page
    'news': 0.7,          // News articles
    'job-board': 0.8,     // Job postings
    'social': 0.5,        // Twitter, etc.
    'unknown': 0.3
  };
  confidence += sourceScores[signal.source] * 0.4;

  // Factor 2: Signal freshness (30%)
  const ageInDays = (Date.now() - signal.created_at) / (1000 * 60 * 60 * 24);
  const freshnessScore = Math.max(0, 1 - (ageInDays / 30)); // Decay over 30 days
  confidence += freshnessScore * 0.3;

  // Factor 3: Data completeness (30%)
  const requiredFields = ['company', 'signal_type', 'description', 'url'];
  const completeness = requiredFields.filter(f => signal[f]).length / requiredFields.length;
  confidence += completeness * 0.3;

  return Math.round(confidence * 100); // 0-100
}
```

**Success Criteria:**
- Confidence score calculated for all new signals
- Stored in `hiring_signals.confidence_score` column
- UI displays confidence indicator (High/Medium/Low)
- Signals sorted by confidence in dashboard
- Historical signals backfilled with confidence scores

---

#### Task 8: Error Recovery Dashboard
- **Priority:** P2 (Medium)
- **Type:** Feature
- **ETA:** 6 hours
- **Tags:** #frontend, #admin, #reliability
- **Description:** Admin UI for viewing and retrying failed operations

**Features:**
1. **Failed Operations List**
   - Enrichment failures
   - Webhook delivery failures
   - RADAR scan errors
   - Filter by type, date, error message

2. **Manual Retry**
   - Single retry button per operation
   - Bulk retry (select multiple)
   - Retry all failed operations

3. **Error Analytics**
   - Error rate over time (chart)
   - Top error types (pie chart)
   - Success/failure distribution
   - Cost impact (failed operations that cost money)

**UI Route:** `/admin/errors`

**Implementation:**
```javascript
// API endpoints
app.get('/api/admin/failed-operations', requireAdmin, async (req, res) => {
  const { type, startDate, endDate } = req.query;

  const operations = await db.query(`
    SELECT * FROM failed_operations
    WHERE type = $1 AND created_at BETWEEN $2 AND $3
    ORDER BY created_at DESC
    LIMIT 100
  `, [type, startDate, endDate]);

  res.json({ operations });
});

app.post('/api/admin/retry-operation/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const operation = await db.query('SELECT * FROM failed_operations WHERE id = $1', [id]);

  // Re-queue operation based on type
  if (operation.type === 'enrichment') {
    await enrichmentQueue.add(operation.data);
  } else if (operation.type === 'webhook') {
    await webhookQueue.add(operation.data);
  }

  res.json({ success: true });
});
```

**Success Criteria:**
- Dashboard accessible at `/admin/errors`
- Failed operations display correctly
- Manual retry works
- Bulk retry works
- Error analytics accurate

---

#### Task 9: Production Monitoring
- **Priority:** P1 (High)
- **Type:** Infrastructure
- **ETA:** 4 hours
- **Tags:** #devops, #monitoring, #alerts
- **Description:** Comprehensive monitoring and alerting setup

**Monitoring Components:**

1. **Cloud Monitoring Dashboards**
   - Request rate, error rate, latency (p50, p95, p99)
   - Cloud Run instance count, CPU, memory
   - Database connections, query latency
   - RADAR scan success rate

2. **Sentry Alerts**
   - Error rate > 5% (1 hour window)
   - New error type detected
   - Performance regression (p95 > 3s)

3. **Cost Tracking**
   - Daily cost summary email
   - Budget alert at $100/month threshold
   - Per-service cost breakdown
   - External API cost tracking (LinkedIn, Hunter.io)

4. **SLO Tracking**
   - Availability: 99.5% uptime
   - Performance: p95 < 2.5s, p99 < 3s
   - Error rate: < 1%
   - RADAR: 10+ signals/day

**Implementation:**
```bash
# Create monitoring dashboard
gcloud monitoring dashboards create --config=monitoring/dashboard.json

# Set up budget alerts
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="UPR Monthly Budget" \
  --budget-amount=100USD \
  --threshold-rule=percent=80 \
  --threshold-rule=percent=100

# Configure Sentry alerts via Sentry UI
# - Error rate > 5%/hour
# - New error types
# - Performance degradation
```

**Success Criteria:**
- Cloud Monitoring dashboard created
- Budget alerts configured and tested
- Sentry alerts triggering correctly
- SLOs tracked and visible
- Weekly performance report generated

---

## Sprint 18 Success Criteria

### Must Complete (100% Required)
- [ ] RADAR automated (daily runs successful)
- [ ] Webhook retry logic operational
- [ ] Signal confidence scoring active
- [ ] Production monitoring dashboards live
- [ ] All services stable (99%+ uptime)
- [ ] Cost under $120/month

### Should Complete (80% Target)
- [ ] LinkedIn signal source integrated
- [ ] Error recovery dashboard functional
- [ ] SLO alerts configured
- [ ] Performance regression testing

### Nice to Have (50% Stretch)
- [ ] Additional signal sources (Twitter)
- [ ] Advanced signal analytics
- [ ] Mobile-responsive error dashboard
- [ ] Automated performance optimization

---

## Sprint Schedule

### Week 1: RADAR Automation (Nov 9-15)
- **Day 1-2:** Task 4 - RADAR Scheduling (4h)
- **Day 3-5:** Task 5 - LinkedIn Source (7h)
- **Day 5:** Testing, monitoring, documentation

**Milestone 1:** ✅ RADAR fully automated with LinkedIn signals

### Week 2: Reliability (Nov 16-22)
- **Day 6-7:** Task 6 - Webhook Retry (3h)
- **Day 7-8:** Task 7 - Confidence Scoring (5h)
- **Day 9-10:** Task 9 - Monitoring (4h)
- **Day 11-12:** Task 8 - Error Dashboard (6h)
- **Day 12:** Sprint review, Sprint 19 planning

**Milestone 2:** ✅ Production hardened, monitoring complete

---

## AI Recommendation: Start Here!

**First Task:** **Automated RADAR Scheduling** (Task 4)

**Why?**
1. ⚡ **Quick Win** - 4 hours, builds momentum
2. 🔥 **High Priority** - P1, immediate value
3. 💎 **High Impact** - Continuous signal discovery
4. ✅ **Zero Dependencies** - Can start immediately
5. 🚀 **Unblocks Task 5** - LinkedIn source needs scheduling

**How to Start:**
```bash
# 1. Create Cloud Scheduler job
gcloud scheduler jobs create http radar-daily-run \
  --schedule="0 9 * * *" \
  --uri="https://upr-web-service-191599223867.us-central1.run.app/api/radar/run" \
  --http-method=POST \
  --time-zone="Asia/Dubai" \
  --message-body='{"source":"scheduled","budgetLimitUsd":5,"notify":true}'

# 2. Test manual trigger
gcloud scheduler jobs run radar-daily-run

# 3. Verify in logs
gcloud run services logs read upr-web-service --limit=50 | grep RADAR

# 4. Check email for digest
# 5. Monitor tomorrow at 9 AM for automated run
```

---

## Sprint 18 Specific Notes

### Rate Limiting Status
⚠️  **Enrichment rate limiting currently DISABLED** (enrichmentLimiter = 999999)
- Set this way for SIVA Phase 12 testing
- **DO NOT RE-ENABLE** without user instruction
- Monitor during Sprint 18 to determine production value

### SIVA Phase 12 Status
✅ **Production-ready, exceptional performance**
- 313 leads/sec throughput
- 100% success rate
- Tools 3-7 using default values (future enhancement)

### External API Budget
**Estimated Sprint 18 Costs:**
- LinkedIn API: $30-50/month (Task 5)
- RapidAPI subscriptions: Included in LinkedIn
- Redis (Bull MQ): Free tier sufficient
- **Total:** ~$50-70/month additional

**Current Monthly Budget:** $120
**Available for APIs:** ~$50-70 (remainder after GCP costs)

---

## Daily Workflow

### Every Morning
```bash
# 1. Pull latest
git pull origin main

# 2. Check production
curl https://upr-web-service-191599223867.us-central1.run.app/health

# 3. Review Sentry errors
# Check: https://anthropic-ai.sentry.io

# 4. Pick next task from this document
```

### During Work
- Focus on one task at a time
- Deploy when feature complete
- Test in production (no local testing)
- Document learnings

### End of Day
```bash
# 1. Commit changes
git add .
git commit -m "feat: progress on [task]"
git push

# 2. Auto-sync to Notion (happens automatically)
```

---

## Tools & Resources

### Required APIs
- **RapidAPI:** LinkedIn Company API access
- **Redis Cloud:** Free tier for Bull MQ
- **GCP:** Cloud Scheduler, Cloud Monitoring

### Monitoring
- **Cloud Console:** https://console.cloud.google.com
- **Sentry:** https://anthropic-ai.sentry.io
- **Notion:** Auto-synced from commits

### Deployment
```bash
# Use automated deployment script
bash scripts/deploy.sh "feat: [description]"
```

---

## Sprint 18 Objectives Summary

**Week 1: RADAR Automation**
- ✅ Automated scheduling (4h)
- ✅ LinkedIn signals (7h)

**Week 2: Reliability**
- ✅ Webhook retry (3h)
- ✅ Confidence scoring (5h)
- ✅ Monitoring (4h)
- ✅ Error dashboard (6h)

**Total:** 29 hours over 2 weeks
**Confidence:** High (solid Sprint 17 foundation)
**Blockers:** None
**Risks:** Low (LinkedIn API integration = medium complexity)

---

## Let's Go!

**First Task:** Automated RADAR Scheduling (Task 4)
**ETA:** 4 hours
**Type:** Quick win
**Impact:** High (continuous signal discovery)

**Start Here:**
```bash
gcloud scheduler jobs create http radar-daily-run \
  --schedule="0 9 * * *" \
  --uri="https://upr-web-service-191599223867.us-central1.run.app/api/radar/run" \
  --http-method=POST \
  --time-zone="Asia/Dubai" \
  --message-body='{"source":"scheduled","budgetLimitUsd":5,"notify":true}'
```

---

**Sprint 18 Status:** 🟢 READY TO START
**First Task:** Automated RADAR Scheduling (P1)
**Foundation:** ✅ Sprint 17 complete, solid base
**Let's build on this momentum!** 🚀

---

**Last Updated:** November 9, 2025
**Prepared by:** AI Assistant (Claude Code)
**Sprint:** 18 → READY TO START
**Previous Sprint:** 17 → COMPLETE
