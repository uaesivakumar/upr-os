# Sentry Alert Configuration
**Sprint 18, Task 9: Production Monitoring**

## Alert Rules

### 1. High Error Rate Alert
**Name:** High Error Rate (>5% per hour)
**Type:** Metric Alert
**Condition:** Error rate exceeds 5% over 1 hour window
**Notification:** Email + Slack

**Configuration:**
```
Metric: error_rate
Threshold: > 5%
Window: 1 hour
Environment: production
```

**Action:** Investigate error logs immediately, check for deployment issues

---

### 2. New Error Type Detected
**Name:** New Error Type
**Type:** Issue Alert
**Condition:** New, unseen error fingerprint appears
**Notification:** Email + Slack

**Configuration:**
```
Trigger: First seen issue
Severity: High
Environment: production
```

**Action:** Review error details, assess impact, prioritize fix

---

### 3. Performance Regression
**Name:** Performance Degradation
**Type:** Metric Alert
**Condition:** p95 latency > 3s for 15 minutes
**Notification:** Email

**Configuration:**
```
Metric: transaction.duration
Percentile: p95
Threshold: > 3000ms
Window: 15 minutes
Environment: production
```

**Action:** Check Cloud Run metrics, database query performance, external API latency

---

### 4. Critical Error Spike
**Name:** Error Spike
**Type:** Metric Alert
**Condition:** Error count increases by 100% compared to previous hour
**Notification:** Email + Slack

**Configuration:**
```
Metric: error_count
Comparison: 100% increase vs previous hour
Window: 1 hour
Environment: production
```

**Action:** Immediate investigation, potential rollback consideration

---

### 5. Database Connection Errors
**Name:** Database Connection Failures
**Type:** Issue Alert
**Condition:** ECONNREFUSED or connection pool exhaustion errors
**Notification:** Email + Slack (urgent)

**Configuration:**
```
Filter: error.type contains "ECONNREFUSED" OR "pool exhausted"
Environment: production
Frequency: More than 5 events in 5 minutes
```

**Action:** Check database status, connection pool settings, network issues

---

### 6. External API Failures
**Name:** External API Rate Limit/Failures
**Type:** Issue Alert
**Condition:** Hunter.io, SerpAPI, or LinkedIn API errors
**Notification:** Email

**Configuration:**
```
Filter: tags[api_provider] in ["hunter.io", "serpapi", "linkedin"]
AND error.type contains "rate_limit" OR "API_ERROR"
Frequency: More than 10 events in 10 minutes
```

**Action:** Check API quotas, rate limits, implement backoff strategy

---

## Setup Instructions

### Step 1: Access Sentry
1. Go to https://sentry.io/organizations/anthropic-ai/
2. Navigate to Alerts → Create Alert Rule

### Step 2: Create Metric Alerts
For each metric alert above:
1. Click "Create Alert Rule" → "Metric Alert"
2. Set project: upr-web-service
3. Configure metric and threshold
4. Set environment filter: production
5. Add email notification
6. Add Slack integration (if configured)
7. Save alert

### Step 3: Create Issue Alerts
For each issue alert above:
1. Click "Create Alert Rule" → "Issue Alert"
2. Set conditions (filters, frequency)
3. Add actions (email, Slack)
4. Save alert

### Step 4: Test Alerts
```bash
# Test error alert (trigger deliberately)
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/test/error

# Test performance alert (simulate slow request)
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/test/slow
```

---

## Alert Channels

### Email
- Primary: user@example.com
- Backup: team@example.com

### Slack (Optional)
- Channel: #upr-alerts
- Webhook URL: (configure in Sentry integrations)

---

## Alert Response Playbook

### High Error Rate (>5%)
1. Check recent deployments (last 2 hours)
2. Review Sentry error details
3. Check Cloud Run logs
4. Consider rollback if deployment-related
5. Investigate root cause
6. Deploy fix or hotfix

### Performance Regression
1. Check Cloud Monitoring dashboard
2. Review database query performance
3. Check external API latencies
4. Verify Cloud Run instance scaling
5. Review recent code changes
6. Optimize slow queries or endpoints

### New Error Type
1. Review error stack trace
2. Identify affected users/requests
3. Assess severity (blocker, critical, major)
4. Create bug ticket
5. Prioritize based on impact
6. Deploy fix in next release

---

## Alert Thresholds

| Alert | Threshold | Window | Action |
|-------|-----------|--------|--------|
| Error Rate | >5% | 1 hour | Immediate investigation |
| Error Spike | +100% | 1 hour | Urgent review |
| Latency p95 | >3s | 15 min | Performance audit |
| DB Errors | >5 | 5 min | Database check |
| API Errors | >10 | 10 min | API quota review |

---

## Monitoring Best Practices

1. **Review alerts weekly** - Adjust thresholds based on actual patterns
2. **Acknowledge alerts promptly** - Prevents alert fatigue
3. **Document resolutions** - Build knowledge base
4. **Test alerts quarterly** - Ensure notifications work
5. **Update playbooks** - Reflect new learnings

---

**Created:** 2025-11-10
**Sprint:** 18, Task 9
**Status:** Configuration Required
