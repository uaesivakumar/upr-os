# PremiumRadar-SAAS Deployment

Deploy to staging or production environments.

**Usage:**
- `/deploy` - Deploy to staging (default)
- `/deploy staging` - Deploy to staging explicitly
- `/deploy production` - Deploy to production (requires approval)

## Environment Mapping

| Environment | Branch | Domain | Service |
|-------------|--------|--------|---------|
| Staging | `main` | https://upr.sivakumar.ai | premiumradar-saas-staging |
| Production | `production` | https://premiumradar.com | premiumradar-saas-production |

## STAGING DEPLOYMENT

### Step 1: Pre-flight Checks
```bash
# Verify build passes
npm run build

# Verify no TypeScript errors
npx tsc --noEmit

# Run tests
npm test
```

### Step 2: Commit Changes (if any)
```bash
git status
git add -A
git commit -m "feat: deployment preparation"
```

### Step 3: Push to Main
```bash
git push origin main
```

### Step 4: Monitor Deployment
```bash
# Watch GitHub Actions
gh run list --limit 3

# Or watch Cloud Build
gcloud builds list --limit=3 --format="table(id,status,createTime)"
```

### Step 5: Verify Deployment
```bash
# Wait for deployment to complete (~2-3 minutes)
sleep 180

# Check health
curl -s https://upr.sivakumar.ai/api/health | jq .

# Verify specific endpoints if needed
curl -s https://upr.sivakumar.ai/ | head -50
```

### Step 6: Report Status
```
============================================================
STAGING DEPLOYMENT COMPLETE
============================================================
URL: https://upr.sivakumar.ai
Service: premiumradar-saas-staging
Time: [timestamp]
Status: [HEALTHY/UNHEALTHY]
============================================================
```

---

## PRODUCTION DEPLOYMENT

**WARNING:** Production deployment requires explicit approval.

### Step 1: Pre-flight Checks
```bash
# Verify on main branch
git branch --show-current

# Verify staging is healthy
curl -s https://upr.sivakumar.ai/api/health | jq .

# Run full QA
/qa
```

### Step 2: Request Approval
```
============================================================
PRODUCTION DEPLOYMENT REQUEST
============================================================
Current staging version: [commit hash]
Last staging deployment: [timestamp]
QA Status: [PASSED/FAILED]

This will deploy to https://premiumradar.com

Type "DEPLOY PRODUCTION" to confirm.
============================================================
```

### Step 3: Merge to Production
```bash
git checkout production
git merge main
git push origin production
```

### Step 4: Monitor Deployment
```bash
gcloud builds list --limit=3 --format="table(id,status,createTime)"
```

### Step 5: Verify Production
```bash
# Wait for deployment
sleep 180

# Check health
curl -s https://premiumradar.com/api/health | jq .

# Verify landing page
curl -s https://premiumradar.com/ | grep "SIVA"
```

### Step 6: Return to Main
```bash
git checkout main
```

### Step 7: Report Status
```
============================================================
PRODUCTION DEPLOYMENT COMPLETE
============================================================
URL: https://premiumradar.com
Service: premiumradar-saas-production
Time: [timestamp]
Status: [HEALTHY/UNHEALTHY]
Commit: [hash]
============================================================
```

## Rollback Procedure

If deployment fails:

### Staging Rollback
```bash
# Revert last commit
git revert HEAD
git push origin main
```

### Production Rollback
```bash
git checkout production
git revert HEAD
git push origin production
git checkout main
```

## FORBIDDEN

- ❌ Deploying to production without QA pass
- ❌ Deploying to production without explicit approval
- ❌ Force pushing to any branch
- ❌ Deploying with failing build
- ❌ Deploying with TypeScript errors
