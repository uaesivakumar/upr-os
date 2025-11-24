# SLO (Service Level Objective) Tracking
**Sprint 18, Task 9: Production Monitoring**

## Service Level Objectives

### 1. Availability SLO
**Target:** 99.5% uptime
**Measurement Period:** 30 days rolling window
**Allowable Downtime:** 3.6 hours/month (0.12 hours/day)

**Monitoring:**
- Cloud Run uptime metric
- Health check endpoint response
- Incident tracking

**Alert Threshold:** <99.0% (warning)

---

### 2. Performance SLO

#### Latency SLO
**Target p95:** < 2.5 seconds
**Target p99:** < 3.0 seconds
**Measurement:** Request latency distribution

**Monitoring:**
- Cloud Run request_latencies metric
- Per-endpoint breakdown
- Time-series analysis

**Alert Threshold:**
- p95 > 3.0s for 15 minutes (warning)
- p99 > 3.5s for 15 minutes (critical)

#### Throughput SLO
**Target:** Handle 50 req/sec peak load
**Baseline:** 10 req/sec steady state

**Monitoring:**
- Request rate metric
- Instance scaling behavior
- Queue depth (if applicable)

---

### 3. Reliability SLO

#### Error Rate SLO
**Target:** < 1% error rate
**Measurement:** (5xx errors / total requests) * 100

**Monitoring:**
- Cloud Run response_code_class=5xx metric
- Error logs in Sentry
- Database connection errors

**Alert Threshold:**
- >1% for 1 hour (warning)
- >5% for 15 minutes (critical)

#### Success Rate SLO
**Target:** >99% successful requests
**Measurement:** (2xx + 3xx responses / total requests) * 100

---

### 4. RADAR SLO

#### Signal Discovery SLO
**Target:** 10+ signals per day
**Measurement:** Count of hiring_signals created daily

**Monitoring:**
- Database query: `SELECT COUNT(*) FROM hiring_signals WHERE DATE(detected_at) = CURRENT_DATE`
- RADAR run success rate
- Signal quality (confidence scores)

**Alert Threshold:** <5 signals/day (warning)

#### RADAR Success Rate SLO
**Target:** 90% successful runs
**Measurement:** (successful runs / total runs) * 100

**Monitoring:**
- discovery_runs table status field
- Cloud Scheduler execution logs
- Error tracking in Sentry

---

## SLO Dashboard Configuration

### Cloud Monitoring SLO Setup

```bash
# Create availability SLO
gcloud monitoring slo create \
  --service=upr-web-service \
  --slo-id=availability-slo \
  --display-name="Availability SLO (99.5%)" \
  --goal=0.995 \
  --calendar-period=MONTH \
  --availability-sli-good-total-ratio-threshold-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="2xx"' \
  --availability-sli-good-total-ratio-total-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"'

# Create latency SLO (p95 < 2.5s)
gcloud monitoring slo create \
  --service=upr-web-service \
  --slo-id=latency-p95-slo \
  --display-name="Latency SLO (p95 < 2.5s)" \
  --goal=0.95 \
  --calendar-period=MONTH \
  --latency-sli-threshold=2500ms

# Create error rate SLO (<1%)
gcloud monitoring slo create \
  --service=upr-web-service \
  --slo-id=error-rate-slo \
  --display-name="Error Rate SLO (<1%)" \
  --goal=0.99 \
  --calendar-period=MONTH
```

---

## SLO Monitoring Queries

### Availability Query (BigQuery)
```sql
SELECT
  DATE(timestamp) as date,
  COUNTIF(httpRequest.status < 500) / COUNT(*) * 100 as availability_pct
FROM `project.logs.cloudrun_googleapis_com_requests_*`
WHERE resource.labels.service_name = 'upr-web-service'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY date
ORDER BY date DESC
```

**Expected Result:** >99.5% daily

---

### Latency Query
```sql
SELECT
  DATE(timestamp) as date,
  APPROX_QUANTILES(httpRequest.latency, 100)[OFFSET(95)] as p95_latency_ms,
  APPROX_QUANTILES(httpRequest.latency, 100)[OFFSET(99)] as p99_latency_ms
FROM `project.logs.cloudrun_googleapis_com_requests_*`
WHERE resource.labels.service_name = 'upr-web-service'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY date
ORDER BY date DESC
```

**Expected Result:**
- p95 < 2500ms
- p99 < 3000ms

---

### Error Rate Query
```sql
SELECT
  DATE(timestamp) as date,
  COUNTIF(httpRequest.status >= 500) / COUNT(*) * 100 as error_rate_pct
FROM `project.logs.cloudrun_googleapis_com_requests_*`
WHERE resource.labels.service_name = 'upr-web-service'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY date
ORDER BY date DESC
```

**Expected Result:** <1% daily

---

### RADAR Signals Query (PostgreSQL)
```sql
-- Daily signal count (last 30 days)
SELECT
  DATE(detected_at) as date,
  COUNT(*) as signal_count,
  COUNT(*) FILTER (WHERE confidence_score >= 0.75) as high_confidence_count,
  AVG(confidence_score) as avg_confidence
FROM hiring_signals
WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(detected_at)
ORDER BY date DESC;
```

**Expected Result:** 10+ signals/day

---

## SLO Violation Response

### Availability SLO Violation (<99.5%)
**Severity:** High
**Response Time:** 1 hour

**Actions:**
1. Check Cloud Run service status
2. Review error logs for patterns
3. Verify database connectivity
4. Check external API dependencies
5. Implement immediate fix or rollback
6. Post-mortem documentation

---

### Latency SLO Violation (p95 > 2.5s)
**Severity:** Medium
**Response Time:** 4 hours

**Actions:**
1. Identify slow endpoints
2. Review database query performance
3. Check external API latencies
4. Verify Cloud Run instance scaling
5. Optimize queries or add caching
6. Monitor for improvement

---

### Error Rate SLO Violation (>1%)
**Severity:** High
**Response Time:** 2 hours

**Actions:**
1. Identify error types (Sentry)
2. Check recent deployments
3. Review code changes
4. Test endpoints manually
5. Deploy fix or rollback
6. Verify error rate returns to normal

---

### RADAR SLO Violation (<10 signals/day)
**Severity:** Low
**Response Time:** 24 hours

**Actions:**
1. Check RADAR run status
2. Verify Cloud Scheduler execution
3. Review SERP API quota/errors
4. Check signal quality filters
5. Investigate source data availability
6. Adjust RADAR configuration if needed

---

## SLO Reporting

### Weekly SLO Report Template

```markdown
# UPR Weekly SLO Report
**Week:** [Date Range]

## SLO Status

| SLO | Target | Actual | Status |
|-----|--------|--------|--------|
| Availability | 99.5% | XX.X% | ✅/⚠️/❌ |
| Latency p95 | <2.5s | X.Xs | ✅/⚠️/❌ |
| Latency p99 | <3.0s | X.Xs | ✅/⚠️/❌ |
| Error Rate | <1% | X.X% | ✅/⚠️/❌ |
| RADAR Signals | 10+/day | XX/day | ✅/⚠️/❌ |

## Summary
- **Overall Health:** Good/Fair/Poor
- **Incidents:** X incidents this week
- **Error Budget:** XX% remaining

## Violations
[List any SLO violations with details]

## Actions Taken
[List improvements or fixes]

## Next Week Focus
[Priorities for next week]
```

---

### Monthly SLO Review Checklist

- [ ] Review 30-day SLO compliance
- [ ] Analyze trends and patterns
- [ ] Identify improvement opportunities
- [ ] Update SLO targets if needed
- [ ] Document lessons learned
- [ ] Share report with stakeholders

---

## SLO Error Budget

### Error Budget Calculation

**Availability Error Budget:**
- Target: 99.5% uptime
- Allowable downtime: 3.6 hours/month
- Error budget = 0.5% of time

**Error Rate Budget:**
- Target: <1% error rate
- Allowable errors: 1% of all requests
- If 10,000 requests/month → 100 errors allowed

### Error Budget Tracking

```javascript
// scripts/monitoring/errorBudget.js
function calculateErrorBudget(sloTarget, actual, totalTime) {
  const errorBudget = (1 - sloTarget) * totalTime;
  const used = (1 - actual) * totalTime;
  const remaining = errorBudget - used;
  const percentRemaining = (remaining / errorBudget) * 100;

  return {
    total: errorBudget,
    used,
    remaining,
    percentRemaining
  };
}

// Example: Availability SLO
const budget = calculateErrorBudget(
  0.995,  // 99.5% target
  0.998,  // 99.8% actual
  720     // hours in 30 days
);

console.log(`Error budget remaining: ${budget.percentRemaining.toFixed(1)}%`);
```

---

## SLO Best Practices

1. **Realistic Targets** - Set achievable SLOs based on historical data
2. **Regular Reviews** - Weekly monitoring, monthly deep dives
3. **Error Budget Policy** - Define what happens when budget is exhausted
4. **Continuous Improvement** - Use SLO data to prioritize reliability work
5. **Stakeholder Communication** - Share SLO status transparently

---

**Created:** 2025-11-10
**Sprint:** 18, Task 9
**Status:** Tracking Active
