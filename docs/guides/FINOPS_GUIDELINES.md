# FinOps Guidelines - UPR Project

**Last Updated:** 2025-11-21
**Target Score:** 5/5

---

## Core Principles

1. **Zero Idle Resources** - All Cloud Run services must have `minScale: 0`
2. **Label Everything** - Every resource must have: `env`, `team`, `cost-center`, `component`
3. **Monitor Continuously** - Weekly cost reviews, automated alerts at 90% budget
4. **Optimize First, Scale Later** - Prove efficiency before adding resources

---

## Mandatory Configurations

### Cloud Run Services
```yaml
metadata:
  labels:
    env: production
    team: upr
    cost-center: product
    component: <service-name>
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/cpu-throttling: 'true'
        autoscaling.knative.dev/minScale: '0'
        autoscaling.knative.dev/maxScale: '3-5'
        autoscaling.knative.dev/target-utilization-percentage: '60'
    spec:
      containerConcurrency: 80-100
```

### Cloud SQL
- Use `db-f1-micro` for dev/staging
- Use `db-g1-small` for production (minimum viable)
- Enable automatic storage increase only when needed
- Set maintenance windows to off-peak hours

### Cloud Storage
- Apply lifecycle rules: Coldline after 30 days, delete after 365 days
- Use regional buckets (not multi-regional) unless required
- Enable versioning only for critical data

---

## Cost Tracking

### Required Labels
| Label | Values | Purpose |
|-------|--------|---------|
| `env` | production, staging, dev | Environment segregation |
| `team` | upr, platform, data | Team ownership |
| `cost-center` | product, engineering, ops | Budget allocation |
| `component` | web, worker, database | Service identification |

### Budget Alerts
- **50%** - Informational (Slack notification)
- **75%** - Warning (Email to team lead)
- **90%** - Critical (Email to stakeholders)
- **100%** - Emergency (Freeze non-critical deployments)

---

## Monthly Review Checklist

- [ ] Review BigQuery billing export
- [ ] Check GCP Recommender suggestions
- [ ] Verify all resources have required labels
- [ ] Audit idle resources (Cloud Run revisions, old snapshots)
- [ ] Review committed use discount opportunities
- [ ] Update cost forecast for next month

---

## Automation

### CI/CD Gates
- Terraform plan must show cost estimate
- New resources without labels = deployment fails
- Services with `minScale > 0` require approval

### Scheduled Jobs
- **Weekly:** Cost anomaly detection
- **Monthly:** Rightsizing recommendations
- **Quarterly:** Committed use discount review

---

## Emergency Cost Controls

If monthly spend exceeds budget:
1. Scale down non-production environments
2. Reduce Cloud Run `maxScale` to 2
3. Pause non-critical Cloud Scheduler jobs
4. Review and delete old Cloud Run revisions
5. Escalate to stakeholders for budget increase approval
