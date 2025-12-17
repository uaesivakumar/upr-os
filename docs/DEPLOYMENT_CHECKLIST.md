# Deployment Checklist

## Pre-Deployment Validation

**ALWAYS run before deploying:**
```bash
./scripts/validate-deployment.sh staging
```

## Required Environment Variables

### SaaS Service (`premiumradar-saas-staging`)

| Variable | Source | Purpose |
|----------|--------|---------|
| `PR_OS_TOKEN` | Secret Manager | Auth token for SaaS → OS calls |
| `UPR_OS_BASE_URL` | Direct value | OS service URL |
| `DATABASE_URL` | Secret Manager | PostgreSQL connection |

### OS Service (`upr-os-service`)

| Variable | Source | Purpose |
|----------|--------|---------|
| `PR_OS_TOKEN` | Secret Manager | Validates incoming SaaS calls |
| `DATABASE_URL` | Secret Manager | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | Secret Manager | SIVA AI calls |
| `SERPAPI_KEY` | Secret Manager | Live discovery |
| `OPENAI_API_KEY` | Secret Manager | Embeddings |

## Adding Missing Secrets

```bash
# Add secret to a service
gcloud run services update SERVICE_NAME \
  --region us-central1 \
  --update-secrets=VAR_NAME=SECRET_NAME:latest
```

## Common Issues

### "Authentication required" from OS
**Cause:** `PR_OS_TOKEN` not set in SaaS service
**Fix:** 
```bash
gcloud run services update premiumradar-saas-staging \
  --region us-central1 \
  --update-secrets=PR_OS_TOKEN=PR_OS_TOKEN:latest
```

### "Module not found" on startup
**Cause:** Directory not copied in Dockerfile
**Fix:** Add `COPY --from=builder /app/DIRNAME ./DIRNAME` to Dockerfile

## Post-Deployment Validation

```bash
# Run validation
./scripts/validate-deployment.sh staging

# Manual smoke test
curl https://premiumradar-saas-staging-191599223867.us-central1.run.app/api/health | jq .
```

## Deployment Commands

```bash
# Build and deploy OS
gcloud builds submit --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/upr-os-service:latest
gcloud run deploy upr-os-service --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/upr-os-service:latest --region us-central1

# Build and deploy SaaS
cd /path/to/premiumradar-saas
gcloud builds submit --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/premiumradar-saas-staging:latest
gcloud run deploy premiumradar-saas-staging --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/premiumradar-saas-staging:latest --region us-central1
```
