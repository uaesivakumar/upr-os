# Phase 2 GCP Architecture

**Version:** 1.0.0
**Date:** 2025-11-23
**Status:** Ready for Deployment

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GCP Project: upr-sales-intelligence               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────┐    HTTPS     ┌──────────────────┐                   │
│   │  Cloud Load      │◄────────────►│   Cloud CDN      │                   │
│   │  Balancer        │              │   (Static Assets)│                   │
│   └────────┬─────────┘              └──────────────────┘                   │
│            │                                                                │
│            │ Route by path                                                  │
│            │                                                                │
│   ┌────────┴────────────────────────────────────────────┐                  │
│   │                                                      │                  │
│   │  /*           /api/os/*                              │                  │
│   │   │               │                                  │                  │
│   │   ▼               ▼                                  │                  │
│   │ ┌─────────────────────────────┐  ┌─────────────────────────────┐       │
│   │ │ premiumradar-saas-service   │  │   upr-os-service            │       │
│   │ │                             │  │                             │       │
│   │ │ - Next.js 14 Frontend       │  │ - OS v1.0.0 API             │       │
│   │ │ - Auth (NextAuth)           │  │ - /api/os/discovery         │       │
│   │ │ - Stripe Billing            │  │ - /api/os/enrich            │       │
│   │ │ - lib/os-client.ts          │──│ - /api/os/score             │       │
│   │ │                             │  │ - /api/os/rank              │       │
│   │ │ Ingress: all                │  │ - /api/os/outreach          │       │
│   │ │ Min: 0, Max: 10             │  │ - /api/os/pipeline          │       │
│   │ │                             │  │                             │       │
│   │ │ Env:                        │  │ Ingress: all                │       │
│   │ │  - UPR_OS_BASE_URL          │  │ Min: 1, Max: 10             │       │
│   │ │  - STRIPE_*                 │  │                             │       │
│   │ │  - NEXTAUTH_*               │  │ Env:                        │       │
│   │ └─────────────────────────────┘  │  - DATABASE_URL             │       │
│   │                                  │  - REDIS_URL                │       │
│   │                                  │  - OPENAI_API_KEY           │       │
│   │                                  └─────────────┬───────────────┘       │
│   │                                                │                        │
│   │                                                │ Pub/Sub                │
│   │                                                ▼                        │
│   │                              ┌─────────────────────────────┐           │
│   │                              │   upr-os-worker             │           │
│   │                              │                             │           │
│   │                              │ - Async job processing      │           │
│   │                              │ - Enrichment batches        │           │
│   │                              │ - Signal aggregation        │           │
│   │                              │ - Scheduled pipelines       │           │
│   │                              │                             │           │
│   │                              │ Ingress: internal           │           │
│   │                              │ Min: 0, Max: 5              │           │
│   │                              │ Timeout: 900s               │           │
│   │                              └─────────────────────────────┘           │
│   │                                                                        │
│   └────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Cloud SQL      │  │  Redis          │  │  Cloud Storage  │            │
│   │  (PostgreSQL)   │  │  (Memorystore)  │  │  (Exports/Logs) │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Inventory

### Active Services (Phase 2)

| Service | Purpose | Config File | Status |
|---------|---------|-------------|--------|
| `upr-os-service` | OS v1.0.0 API | `cloud-run-os-service.yaml` | Ready |
| `premiumradar-saas-service` | SaaS Frontend | `cloud-run-saas-service.yaml` | Ready |
| `upr-os-worker` | Unified Worker | `cloud-run-os-worker.yaml` | Ready |

### Deleted Services (Cleanup Complete)

| Service | Reason | Deletion Date |
|---------|--------|---------------|
| `coming-soon-service` | Placeholder obsolete | TBD by TC |
| `upr-web-service` | Replaced by SaaS | TBD by TC |
| `upr-enrichment-worker` | Replaced by unified worker | TBD by TC |
| `upr-hiring-signals-worker` | Replaced by unified worker | TBD by TC |
| `upr-worker` | Replaced by unified worker | TBD by TC |

---

## Service Communication

### External → SaaS
```
Internet → Cloud Load Balancer → premiumradar-saas-service
```

### SaaS → OS
```
premiumradar-saas-service → (HTTP via UPR_OS_BASE_URL) → upr-os-service
```

### OS → Worker (Async)
```
upr-os-service → Pub/Sub (upr-os-jobs) → upr-os-worker
```

### Worker → OS (Callback)
```
upr-os-worker → (Internal HTTP) → upr-os-service/api/os/webhook
```

---

## Environment Variables

### upr-os-service
| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Secret Manager | PostgreSQL connection |
| `REDIS_URL` | Secret Manager | Redis connection |
| `OPENAI_API_KEY` | Secret Manager | OpenAI API key |
| `APOLLO_API_KEY` | Secret Manager | Apollo API key |
| `OS_VERSION` | Config | "1.0.0" |

### premiumradar-saas-service
| Variable | Source | Description |
|----------|--------|-------------|
| `UPR_OS_BASE_URL` | Config | OS service URL |
| `UPR_OS_API_KEY` | Secret Manager | OS auth key |
| `STRIPE_SECRET_KEY` | Secret Manager | Stripe API |
| `STRIPE_PUBLISHABLE_KEY` | Config | Stripe public |
| `NEXTAUTH_SECRET` | Secret Manager | Auth secret |
| `NEXTAUTH_URL` | Config | Auth callback URL |

### upr-os-worker
| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Secret Manager | PostgreSQL connection |
| `REDIS_URL` | Secret Manager | Redis connection |
| `OPENAI_API_KEY` | Secret Manager | OpenAI API key |
| `PUBSUB_TOPIC` | Config | Job queue topic |
| `PUBSUB_SUBSCRIPTION` | Config | Worker subscription |

---

## Deployment Order

1. **Deploy upr-os-service first** (no dependencies)
2. **Deploy upr-os-worker** (needs Pub/Sub)
3. **Deploy premiumradar-saas-service** (needs OS URL)

```bash
# Step 1: Deploy OS
gcloud run deploy upr-os-service --source . --region us-central1

# Step 2: Deploy Worker
gcloud run deploy upr-os-worker --source ./worker --region us-central1

# Step 3: Get OS URL
OS_URL=$(gcloud run services describe upr-os-service --region us-central1 --format='value(status.url)')

# Step 4: Deploy SaaS with OS URL
gcloud run deploy premiumradar-saas-service \
  --source ../premiumradar-saas \
  --region us-central1 \
  --set-env-vars "UPR_OS_BASE_URL=${OS_URL}"
```

---

## Scaling Configuration

| Service | Min | Max | Concurrency | CPU | Memory |
|---------|-----|-----|-------------|-----|--------|
| upr-os-service | 1 | 10 | 80 | 1 | 1Gi |
| premiumradar-saas-service | 0 | 10 | 80 | 1 | 512Mi |
| upr-os-worker | 0 | 5 | 10 | 2 | 2Gi |

---

## Monitoring & Alerts

### Health Endpoints
- `upr-os-service`: `/api/os/health`
- `premiumradar-saas-service`: `/health`
- `upr-os-worker`: `/health`

### Recommended Alerts
1. Error rate > 1% for 5 minutes
2. Latency p99 > 5s for 5 minutes
3. Instance count at max for 10 minutes
4. Memory utilization > 80%
5. Worker job queue depth > 1000

---

## Security

### Network
- OS service: Public (API key auth)
- SaaS service: Public (NextAuth)
- Worker: Internal only (no public access)

### Authentication
- OS API: API key in `X-OS-API-Key` header
- SaaS: NextAuth with Google/Email providers
- Worker: Pub/Sub service account

### Secrets
All secrets stored in Google Secret Manager:
- `db-credentials`
- `redis-credentials`
- `openai-credentials`
- `apollo-credentials`
- `stripe-credentials`
- `nextauth-secret`
