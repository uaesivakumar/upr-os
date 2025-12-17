# UPR OS Stability Guide

## Deployment Guardrails

### Pre-Deployment Checks (Automatic)
The `./scripts/deploy.sh` automatically validates:
1. **Directory check** - Must run from upr-os root
2. **Required files** - server.js, package.json, Dockerfile, os/envelope/factory.js
3. **Secrets exist** - All 8 secrets verified in Secret Manager
4. **Syntax check** - Node.js syntax validation

### Post-Deployment Verification (Automatic)
1. **Health check with retries** - 3 attempts, 5s between
2. **Automatic rollback** - If health fails, reverts to previous revision
3. **Full validation** - Runs validate-deployment.sh

### Required Secrets (8 total)
```
DATABASE_URL      - PostgreSQL connection
REDIS_URL         - Redis connection
JWT_SECRET        - JWT signing key
APOLLO_API_KEY    - Apollo enrichment
SERPAPI_KEY       - Google search
OPENAI_API_KEY    - OpenAI API
ANTHROPIC_API_KEY - Claude API
PR_OS_TOKEN       - Service auth token
```

## How to Deploy

### Safe Deployment (Recommended)
```bash
cd /Users/skc/Projects/UPR/upr-os
./scripts/deploy.sh
```

This will:
- Run all pre-checks
- Build image
- Deploy with all secrets
- Verify health
- Auto-rollback on failure

### Never Do
```bash
# DON'T deploy from wrong directory
cd /wrong/path && gcloud builds submit

# DON'T use gcloud run deploy directly (loses secrets)
gcloud run deploy upr-os-service --image=...

# DON'T skip validation
./scripts/deploy.sh && echo "done"  # Wrong - check output!
```

## Validation

### Quick Check
```bash
/staging
```

### Full Validation
```bash
./scripts/validate-deployment.sh staging
```

### Manual Health Check
```bash
curl https://upr-os-service-191599223867.us-central1.run.app/api/os/health
```

## Rollback

### Automatic (Built into deploy.sh)
Rollback happens automatically if health check fails.

### Manual Rollback
```bash
# List revisions
gcloud run revisions list --service=upr-os-service --region=us-central1 --limit=5

# Rollback to specific revision
gcloud run services update-traffic upr-os-service --region=us-central1 --to-revisions=REVISION_NAME=100
```

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Container failed to start" | Missing secret | Use deploy.sh (includes all secrets) |
| "invalid UUID syntax" | Code bug | Check factory.js UUID fallbacks |
| "PR_OS_TOKEN missing" | Lost during deploy | Run deploy.sh or add with --update-secrets |
| Wrong image deployed | Ran from wrong dir | Always cd to upr-os first |

## Monitoring

### Check Logs
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="upr-os-service"' --limit=20
```

### Check Current Revision
```bash
gcloud run services describe upr-os-service --region=us-central1 --format="value(status.traffic[0].revisionName)"
```
