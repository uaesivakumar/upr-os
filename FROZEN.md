# UPR OS - FROZEN SERVICE

## DO NOT MODIFY WITHOUT TC APPROVAL

This service has been frozen as of **2025-11-25**.

### Frozen State
- **Revision**: `upr-os-service-00013-cl7`
- **Docker Image**: `us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/upr-os-service:frozen-2025-11-25-v2`
- **Git Commit**: `4be9804` (includes SaaS whitelist fix)

### Why Frozen?
The UPR OS service is the core backend for PremiumRadar SaaS. Breaking changes here cascade to:
- All SaaS API routes (`/api/os/*`)
- Frontend functionality
- Customer-facing features

### Recovery Procedure
If the service breaks, restore using:
```bash
gcloud run deploy upr-os-service \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/upr-os-service:frozen-2025-11-25-v2 \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --ingress=all
```

### Verified Endpoints (2025-11-25)
| Endpoint | Status |
|----------|--------|
| `/health` | ✅ |
| `/api/os` | ✅ |
| `/api/os/discovery` | ✅ |
| `/api/os/pipeline` | ✅ |

### Before Making Changes
1. Get TC (Technical Council) approval
2. Create a new branch
3. Test in staging environment
4. Never deploy directly to this service
