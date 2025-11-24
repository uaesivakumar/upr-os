# TC Cloud Run Cleanup Instruction

**Date:** 2025-11-23
**Phase:** Phase 1.5 → Phase 2 Transition
**Priority:** HIGH
**Status:** PENDING TC ACTION

---

## 1. Overview

As part of the OS v1.0.0 freeze and Phase-2 preparation, the following Cloud Run services must be cleaned up. These services are from the old monolithic architecture and are no longer part of the new OS + SaaS separated architecture.

---

## 2. Services to DELETE (Obsolete)

| Service Name | Region | Reason for Deletion |
|--------------|--------|---------------------|
| `coming-soon-service` | us-central1 | Temporary placeholder; obsolete |
| `upr-web-service` | us-central1 | OLD monolithic frontend/backend → replaced by `premiumradar-saas-service` |
| `upr-enrichment-worker` | us-central1 | Old enrichment worker → replaced by unified `upr-os-worker` |
| `upr-hiring-signals-worker` | us-central1 | Old signal worker → replaced by unified `upr-os-worker` |
| `upr-worker` | us-central1 | Old generic worker → replaced by orchestrated OS pipeline |

**WARNING:** Continuing to keep these services will cause:
- Unnecessary billing charges
- Routing conflicts
- Deployment confusion
- Security surface expansion

---

## 3. Services to KEEP (Phase-2 Architecture)

| Service Name | Purpose | Status |
|--------------|---------|--------|
| `upr-os-service` | Central OS v1.0 API (`/api/os/*`) | TO BE DEPLOYED |
| `premiumradar-saas-service` | SaaS Frontend (Next.js) | TO BE DEPLOYED |
| `upr-os-worker` | Unified worker pipeline (async jobs) | TO BE DEPLOYED |

---

## 4. TC Execution Commands

```bash
# Set project
gcloud config set project upr-sales-intelligence

# Delete obsolete services
gcloud run services delete coming-soon-service --region=us-central1 --quiet
gcloud run services delete upr-web-service --region=us-central1 --quiet
gcloud run services delete upr-enrichment-worker --region=us-central1 --quiet
gcloud run services delete upr-hiring-signals-worker --region=us-central1 --quiet
gcloud run services delete upr-worker --region=us-central1 --quiet

# Verify deletion
gcloud run services list --region=us-central1
```

---

## 5. Pre-Deletion Checklist

Before deleting each service, TC must verify:

- [ ] No active domain mappings pointing to the service
- [ ] No Pub/Sub subscriptions pushing to the service
- [ ] No Cloud Scheduler jobs triggering the service
- [ ] No IAM bindings that would break other services
- [ ] Service has been idle (no traffic) for 7+ days

---

## 6. Post-Cleanup Audit Requirements

TC MUST produce a validation report containing:

### 6.1 Deleted Services Summary
```
| Service Name | Deletion Timestamp | Region | Result | Dependency Check |
|--------------|-------------------|--------|--------|------------------|
| coming-soon-service | YYYY-MM-DD HH:MM | us-central1 | SUCCESS/FAIL | OK/NOT OK |
| upr-web-service | YYYY-MM-DD HH:MM | us-central1 | SUCCESS/FAIL | OK/NOT OK |
| upr-enrichment-worker | YYYY-MM-DD HH:MM | us-central1 | SUCCESS/FAIL | OK/NOT OK |
| upr-hiring-signals-worker | YYYY-MM-DD HH:MM | us-central1 | SUCCESS/FAIL | OK/NOT OK |
| upr-worker | YYYY-MM-DD HH:MM | us-central1 | SUCCESS/FAIL | OK/NOT OK |
```

### 6.2 Remaining Services Summary
```
| Service Name | URL | Ingress | Auth | Min Instances | Max Instances |
|--------------|-----|---------|------|---------------|---------------|
| upr-os-service | https://... | all | ... | 0 | 10 |
| premiumradar-saas-service | https://... | all | ... | 0 | 10 |
| upr-os-worker | https://... | internal | ... | 0 | 5 |
```

### 6.3 Domain Mapping Check
```
| Domain | Target Service | Status |
|--------|---------------|--------|
| (list all domain mappings) | | |
```

### 6.4 Pub/Sub Trigger Check
```
| Subscription | Push Endpoint | Status |
|--------------|--------------|--------|
| (list all push subscriptions) | | VALID/ORPHANED |
```

### 6.5 Billing Impact (Projected)
```
| Metric | Before Cleanup | After Cleanup | Savings |
|--------|----------------|---------------|---------|
| Monthly Cost | $X.XX | $Y.YY | $Z.ZZ |
| Active Services | N | 3 | N-3 |
```

### 6.6 Health Check of Remaining Services
```
| Service | Health Endpoint | Status | Response Time |
|---------|----------------|--------|---------------|
| upr-os-service | /api/os/health | 200 OK | XXms |
| premiumradar-saas-service | /health | 200 OK | XXms |
| upr-os-worker | /health | 200 OK | XXms |
```

---

## 7. Rollback Plan

If deletion causes issues:

1. Services can be redeployed from Git history
2. All service configs are preserved in `/gcp/` directory
3. Container images remain in Artifact Registry for 30 days

---

## 8. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| TC Lead | | | |
| DevOps | | | |
| Project Owner | | | |

---

## 9. Validation Gate

After cleanup, run the validation script:

```bash
node scripts/validation/cloudRunCleanupValidation.js
```

Expected output: All 5 validation checks PASS
