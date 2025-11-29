# UPR OS Deployment

Deploy UPR OS services to Cloud Run.

**Usage:**
- `/deploy` - Deploy to staging (default)
- `/deploy staging` - Deploy OS services to staging
- `/deploy production` - Deploy to production (requires approval)

## Environment Mapping

| Environment | Branch | Services |
|-------------|--------|----------|
| Staging | `main` | upr-os-service, upr-os-worker |
| Production | `main` | upr-os-service, upr-os-worker |

## OS Services

| Service | Description | URL |
|---------|-------------|-----|
| upr-os-service | Main API service | Cloud Run managed |
| upr-os-worker | Background workers | Cloud Run managed |

## DEPLOYMENT STEPS

### Step 1: Pre-flight Checks
```bash
npm run build
npx tsc --noEmit
```

### Step 2: Deploy to Cloud Run
```bash
# Deploy main service
gcloud run deploy upr-os-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

# Deploy worker (if needed)
gcloud run deploy upr-os-worker \
  --source . \
  --region us-central1
```

### Step 3: Verify Deployment
```bash
# Check service status
gcloud run services describe upr-os-service --region=us-central1

# Check health
curl -s https://[SERVICE_URL]/health
```

## IMPORTANT: This is UPR OS

✅ Deploy here:
- Intelligence API
- Provider services
- LLM routing
- Worker jobs

❌ DON'T deploy here:
- SaaS frontend (use premiumradar-saas repo)
- Billing services (use premiumradar-saas repo)
