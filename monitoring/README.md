# UPR Production Monitoring
**Sprint 18, Task 9**

Complete monitoring and alerting setup for UPR production environment.

---

## Overview

This monitoring system provides comprehensive observability for:
- **Performance:** Request latency, throughput, error rates
- **Infrastructure:** Cloud Run instances, CPU, memory, database
- **Cost:** Budget alerts, spending tracking, API usage
- **Reliability:** SLO tracking, availability, RADAR success

---

## Quick Start

### 1. Run Setup Script
```bash
./monitoring/setup.sh
```

This script will:
- Create Cloud Monitoring dashboard
- Set up budget alerts ($100/month)
- Verify Cloud Run service
- Check Sentry integration

### 2. Configure Sentry Alerts
Follow instructions in `sentry-alerts.md`:
1. Go to https://sentry.io
2. Create 6 alert rules
3. Configure email/Slack notifications
4. Test alerts

### 3. Review Documentation
- `dashboard.json` - Cloud Monitoring dashboard config
- `sentry-alerts.md` - Sentry alert configuration
- `cost-tracking.md` - Budget and cost monitoring
- `slo-tracking.md` - Service level objectives

---

## Components

### 1. Cloud Monitoring Dashboard
**File:** `dashboard.json`

**Metrics:**
- Request rate (req/sec)
- Error rate (%)
- Latency percentiles (p50, p95, p99)
- Cloud Run instances
- CPU & memory utilization
- Database connections
- RADAR scan success rate

**Access:** https://console.cloud.google.com/monitoring/dashboards

---

### 2. Sentry Alerts
**File:** `sentry-alerts.md`

**Alert Rules:**
1. High Error Rate (>5%/hour)
2. New Error Type Detected
3. Performance Regression (p95 > 3s)
4. Error Spike (+100%)
5. Database Connection Errors
6. External API Failures

**Access:** https://sentry.io/alerts

---

### 3. Cost Tracking
**File:** `cost-tracking.md`

**Budget:**
- Monthly: $100
- Alert at 80% ($80)
- Alert at 100% ($100)

**Cost Breakdown:**
- Cloud Run: $30-40
- Database: $7-15
- External APIs: $25-40
- Other: $10-15

**Access:** https://console.cloud.google.com/billing

---

### 4. SLO Tracking
**File:** `slo-tracking.md`

**Objectives:**
- **Availability:** 99.5% uptime
- **Performance:** p95 < 2.5s, p99 < 3s
- **Error Rate:** < 1%
- **RADAR:** 10+ signals/day

**Monitoring:**
- Cloud Monitoring SLOs
- BigQuery analysis
- PostgreSQL queries

---

## Dashboard Views

### Main Dashboard
![Dashboard Preview](https://via.placeholder.com/800x400?text=UPR+Production+Dashboard)

**Tiles:**
1. Request Rate - Line chart
2. Error Rate - Line chart with 5% threshold
3. Latency (p50, p95, p99) - Multi-line chart
4. Instance Count - Line chart
5. CPU Utilization - Line chart with 80%/90% thresholds
6. Memory Utilization - Line chart with thresholds
7. Database Connections - Scorecard
8. RADAR Success Rate - Scorecard
9. SLO Summary - Text panel

---

## Alert Channels

### Email Notifications
- Primary: Configure in GCP/Sentry
- Budget alerts: GCP Billing email
- Sentry alerts: Sentry configured email

### Slack (Optional)
- Channel: #upr-alerts
- Configure in Sentry integrations
- Webhook URL required

---

## Monitoring Checklist

### Daily
- [ ] Review Cloud Monitoring dashboard
- [ ] Check Sentry for new errors
- [ ] Verify no budget alerts

### Weekly
- [ ] Review SLO compliance
- [ ] Check cost breakdown
- [ ] Analyze performance trends
- [ ] Review RADAR signal counts

### Monthly
- [ ] Full SLO review
- [ ] Cost optimization audit
- [ ] Alert threshold tuning
- [ ] Documentation updates

---

## Troubleshooting

### Dashboard Not Showing Data
1. Verify Cloud Run service is deployed
2. Check metric filters match service name
3. Ensure data is being generated (send test requests)
4. Wait 5-10 minutes for metrics to appear

### Budget Alerts Not Working
1. Verify billing account is linked
2. Check notification channels configured
3. Test with lower threshold (e.g., $1)
4. Review GCP Billing console

### Sentry Alerts Not Triggering
1. Verify SENTRY_DSN in environment
2. Check alert rules are active
3. Test with /api/test/error endpoint
4. Review Sentry alert history

---

## Maintenance

### Update Dashboard
```bash
# Edit dashboard.json
# Then update in Cloud Console or via gcloud
gcloud monitoring dashboards update DASHBOARD_ID --config-from-file=monitoring/dashboard.json
```

### Adjust Budget
```bash
# List budgets
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID

# Update budget amount
gcloud billing budgets update BUDGET_ID --billing-account=BILLING_ACCOUNT_ID --budget-amount=150USD
```

### Review SLO Performance
```bash
# Run SLO queries (see slo-tracking.md)
psql "$DATABASE_URL" -f monitoring/slo-queries.sql
```

---

## Cost Optimization Tips

1. **Cloud Run**
   - Set min-instances=0 (scale to zero)
   - Optimize memory allocation (512MB sufficient)
   - Use concurrency=80

2. **Logging**
   - Exclude /health endpoint from logs
   - Set log retention to 30 days
   - Filter debug logs in production

3. **External APIs**
   - Cache SerpAPI results (24h)
   - Batch requests when possible
   - Monitor quota usage weekly

4. **Database**
   - Use connection pooling (max 20)
   - Optimize slow queries
   - Consider read replicas only if needed

---

## Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Availability | 99.5% | TBD | 🟡 Monitor |
| Latency p95 | <2.5s | TBD | 🟡 Monitor |
| Error Rate | <1% | TBD | 🟡 Monitor |
| RADAR Signals | 10+/day | ~10/day | ✅ Good |
| Monthly Cost | <$100 | ~$80-90 | ✅ Good |

---

## Support

### Issues
- Cloud Monitoring: https://console.cloud.google.com/monitoring
- Sentry: https://sentry.io
- Billing: https://console.cloud.google.com/billing

### Documentation
- Sprint 18 Kickoff: `../SPRINT_18_KICKOFF.md`
- Sprint 18 Handoff: `../SPRINT_18_HANDOFF.md`
- Task 9 Completion: `../TASK_9_MONITORING_COMPLETE.md` (when done)

---

**Created:** 2025-11-10
**Sprint:** 18, Task 9
**Status:** Production Ready
**Version:** 1.0
