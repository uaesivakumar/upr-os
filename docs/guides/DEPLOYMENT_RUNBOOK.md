# UPR Production Deployment Runbook

**Version:** 1.0
**Last Updated:** 2025-11-19
**Service:** upr-web-service
**GCP Project:** applied-algebra-474804-e6
**Region:** us-central1

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Build Process](#build-process)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Validation](#post-deployment-validation)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)
9. [Environment Variables Reference](#environment-variables-reference)
10. [Database Migration Process](#database-migration-process)
11. [Zero-Downtime Deployment Strategy](#zero-downtime-deployment-strategy)

---

## Overview

The UPR (UAE Premium Radar) system is deployed on Google Cloud Platform using Cloud Run for containerized services and Cloud SQL for PostgreSQL database. This runbook provides step-by-step procedures for deploying the application to production with zero downtime.

### Infrastructure Components

| Component | Details |
|-----------|---------|
| **Cloud Run Service** | upr-web-service |
| **Region** | us-central1 |
| **Database** | Cloud SQL PostgreSQL @ 34.121.0.240:5432 |
| **Database Name** | upr_production |
| **Production URL** | https://upr-web-service-191599223867.us-central1.run.app |
| **Service Account** | upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com |
| **VPC Connector** | upr-vpc-connector |
| **Cloud SQL Instance** | upr-postgres |

### Current System Status

- **Quality Score:** 94.5%
- **API Documentation:** 100% complete (25+ endpoints)
- **Active Leads:** 6
- **Companies:** 10
- **Voice Templates:** 24
- **Recent Agent Decisions:** 14,948 (last 7 days)

---

## Pre-Deployment Checklist

### 1. Code Readiness

- [ ] All code changes committed and pushed to Git
- [ ] Code reviewed and approved (if team process)
- [ ] All tests passing locally
- [ ] No critical TODOs or FIXMEs in changed code
- [ ] Version tagged in Git (e.g., `sprint-40-release`)

```bash
# Verify git status
git status

# Check for uncommitted changes
git diff

# Ensure on correct branch
git branch --show-current

# Tag the release
git tag -a sprint-40-release -m "Sprint 40 production release"
git push origin sprint-40-release
```

### 2. Environment Verification

- [ ] GCP project set correctly
- [ ] Authentication configured (`gcloud auth list`)
- [ ] Required secrets exist in Secret Manager
- [ ] Database accessible from your machine
- [ ] Cloud Run service exists

```bash
# Set GCP project
gcloud config set project applied-algebra-474804-e6

# Verify authentication
gcloud auth list

# Check secrets exist
gcloud secrets list --format="table(name)"

# Test database connectivity
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" -c "SELECT 1;"
```

### 3. Backup Database

**ALWAYS backup the database before deployment!**

```bash
# Run the backup script
./scripts/backup-db.sh

# Verify backup was created
ls -lh ./backups/upr_db_backup_*.sql.gz

# Output should show recent backup file with size
```

The backup script automatically:
- Creates timestamped backup in `./backups/`
- Compresses backup with gzip
- Keeps last 7 backups only
- Uses PostgreSQL custom format for faster restore

### 4. Review Pending Database Migrations

```bash
# Check for new migration files
ls -lh db/migrations/

# Review latest migrations
ls -lt db/migrations/ | head -10

# Note any migrations added since last deployment
```

### 5. Check Current Service Health

```bash
# Run health check script
./scripts/health-check.sh

# Check current Cloud Run status
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="value(status.conditions[0].status,status.url)"

# Get current revision
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --limit=5
```

### 6. Notify Stakeholders

- [ ] Deployment window communicated to users
- [ ] Expected downtime (if any) announced
- [ ] Rollback plan documented and shared

---

## Environment Setup

### Prerequisites

1. **Google Cloud SDK** installed and configured
2. **Docker** installed (for local testing only)
3. **Node.js 20+** installed
4. **PostgreSQL client** (psql) for database operations
5. **jq** for JSON parsing in scripts

### Installation Commands

```bash
# Install Google Cloud SDK (macOS)
brew install --cask google-cloud-sdk

# Install Node.js 20
brew install node@20

# Install PostgreSQL client
brew install postgresql@16

# Install jq for JSON parsing
brew install jq

# Authenticate with GCP
gcloud auth login
gcloud auth application-default login

# Set default project
gcloud config set project applied-algebra-474804-e6
gcloud config set run/region us-central1
```

### Verify Setup

```bash
# Verify installations
gcloud --version      # Should be 400.0.0+
node --version        # Should be v20.x.x
npm --version         # Should be 10.x.x
psql --version        # Should be 16.x
jq --version          # Should be 1.6+

# Test GCP access
gcloud projects list
gcloud run services list --region=us-central1

# Test database access
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" \
  -c "SELECT NOW();"
```

---

## Build Process

The UPR system uses a multi-stage Docker build process optimized for production.

### Docker Build Stages

#### Stage 1: Build Stage (`node:20-alpine AS build`)

1. **Install dependencies**
   - Copies package.json and package-lock.json
   - Runs `npm ci` for reproducible builds
   - Installs only production dependencies

2. **Build dashboard**
   - Changes to `/app/dashboard` directory
   - Installs dashboard dependencies
   - Runs Vite build process
   - Outputs to `dashboard/dist/`

#### Stage 2: Runtime Stage (`node:20-alpine AS runtime`)

1. **Copy build artifacts**
   - Copies production node_modules
   - Copies server code (server.js, routes, utils, services, etc.)
   - Copies built dashboard (dashboard/dist)

2. **Security hardening**
   - Creates non-root user `nodejs` (UID 1001)
   - Sets proper file ownership
   - Runs as non-root user

3. **Health check**
   - Configured to run every 30 seconds
   - 3-second timeout
   - 40-second startup period
   - 3 retries before marking unhealthy

### Local Build Test (Optional)

```bash
# Build Docker image locally to test
docker build -t upr-web-service:test .

# Run locally to verify
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  upr-web-service:test

# Test health endpoint
curl http://localhost:8080/health

# Stop container when done
docker stop $(docker ps -q --filter ancestor=upr-web-service:test)
```

### Build Performance

- **Build time:** ~3-5 minutes (depends on network)
- **Image size:** ~400 MB (Alpine-based)
- **Cache optimization:** Multi-stage build reduces final image size

---

## Deployment Steps

### Method 1: Quick Deployment (Recommended)

Use the deployment script for most deployments:

```bash
# Deploy web service with secrets
./scripts/deploy-server.sh

# What this script does:
# 1. Deploys to Cloud Run from source (--source .)
# 2. Sets all required secrets from Secret Manager
# 3. Configures memory (2Gi) and CPU (2)
# 4. Sets timeout (300s)
# 5. Runs smoke tests automatically
```

**Script breakdown:**

```bash
#!/bin/bash
set -e

echo "🚀 Deploying upr-web-service with secrets..."

gcloud run deploy upr-web-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300s \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,\
UPR_ADMIN_USER=UPR_ADMIN_USER:latest,\
UPR_ADMIN_PASS=UPR_ADMIN_PASS:latest,\
JWT_SECRET=JWT_SECRET:latest,\
APOLLO_API_KEY=APOLLO_API_KEY:latest,\
SERPAPI_KEY=SERPAPI_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
NEVERBOUNCE_API_KEY=NEVERBOUNCE_API_KEY:latest,\
TENANT_ID=TENANT_ID:latest,\
RADAR_ENABLED=RADAR_ENABLED:latest,\
MAX_RUN_BUDGET_USD=MAX_RUN_BUDGET_USD:latest,\
REDIS_URL=REDIS_URL:latest,\
HUNTER_API_KEY=HUNTER_API_KEY:latest

echo "✅ Deployment complete!"
```

### Method 2: Manual Step-by-Step Deployment

For more control or troubleshooting:

#### Step 1: Deploy to Cloud Run

```bash
# Deploy from source code
gcloud run deploy upr-web-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300s \
  --min-instances=0 \
  --max-instances=5 \
  --concurrency=80 \
  --service-account=upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com \
  --vpc-connector=projects/applied-algebra-474804-e6/locations/us-central1/connectors/upr-vpc-connector \
  --vpc-egress=private-ranges-only \
  --add-cloudsql-instances=applied-algebra-474804-e6:us-central1:upr-postgres \
  --quiet
```

**What each flag does:**

| Flag | Purpose |
|------|---------|
| `--source .` | Build from current directory using Dockerfile |
| `--allow-unauthenticated` | Public access (has its own auth) |
| `--memory=2Gi` | 2GB RAM for Node.js application |
| `--cpu=2` | 2 vCPU cores for performance |
| `--timeout=300s` | 5-minute timeout for long-running requests |
| `--min-instances=0` | Scale to zero when idle (cost savings) |
| `--max-instances=5` | Maximum 5 instances during high load |
| `--concurrency=80` | 80 concurrent requests per instance |
| `--vpc-connector` | Private networking to Cloud SQL |
| `--vpc-egress` | Only private IP ranges use VPC |
| `--add-cloudsql-instances` | Direct Cloud SQL connection |

#### Step 2: Set Environment Variables (Secrets)

```bash
# Set all secrets at once
gcloud run services update upr-web-service \
  --region us-central1 \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest,\
UPR_ADMIN_USER=UPR_ADMIN_USER:latest,\
UPR_ADMIN_PASS=UPR_ADMIN_PASS:latest,\
JWT_SECRET=JWT_SECRET:latest,\
APOLLO_API_KEY=APOLLO_API_KEY:latest,\
SERPAPI_KEY=SERPAPI_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
NEVERBOUNCE_API_KEY=NEVERBOUNCE_API_KEY:latest,\
TENANT_ID=TENANT_ID:latest,\
RADAR_ENABLED=RADAR_ENABLED:latest,\
MAX_RUN_BUDGET_USD=MAX_RUN_BUDGET_USD:latest,\
REDIS_URL=REDIS_URL:latest,\
HUNTER_API_KEY=HUNTER_API_KEY:latest
```

#### Step 3: Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="value(status.url)")

echo "Service deployed at: $SERVICE_URL"

# Check service status
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status,status.url)"
```

### Method 3: Full Pipeline with Commit

Use this when you want to commit, push, and deploy in one command:

```bash
# Deploy with automatic commit and Notion sync
./scripts/deploy.sh "feat: Sprint 40 production deployment" upr-web-service

# What this script does:
# 1. Commits all changes with your message
# 2. Pushes to remote Git repository
# 3. Deploys to Cloud Run
# 4. Syncs status to Notion
# 5. Sends Slack notification (if configured)
```

### Deployment Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| **Build** | 3-5 min | Docker image build on Cloud Build |
| **Push** | 1-2 min | Push image to Container Registry |
| **Deploy** | 2-3 min | Create new revision, traffic migration |
| **Health Check** | 1-2 min | Wait for health checks to pass |
| **Total** | **7-12 min** | Full deployment duration |

---

## Post-Deployment Validation

### 1. Run Smoke Tests

The smoke test suite validates critical functionality:

```bash
# Run comprehensive smoke tests
export SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"
export ADMIN_USER=$(gcloud secrets versions access latest --secret=UPR_ADMIN_USER)
export ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=UPR_ADMIN_PASS)

./tests/smoke-tests.sh
```

**Smoke tests validate:**
1. ✅ Health check endpoint (GET /health)
2. ✅ Database connectivity
3. ✅ Required environment variables
4. ✅ Authentication (valid credentials)
5. ✅ Authentication rejection (invalid credentials)
6. ✅ Company enrichment API
7. ✅ Pattern cache clearing API
8. ✅ Companies listing API
9. ✅ Email pattern discovery API
10. ✅ Critical routes mounted

**Expected output:**

```
═══════════════════════════════════════════════════════════════════════
🧪 UPR SMOKE TESTS
═══════════════════════════════════════════════════════════════════════
Target: https://upr-web-service-191599223867.us-central1.run.app
Started: Tue Nov 19 10:00:00 UTC 2025

✅ PASS: Health check endpoint responding
✅ PASS: Database connectivity
✅ PASS: All required environment variables set
✅ PASS: Login with valid credentials
✅ PASS: Invalid credentials rejected
...

═══════════════════════════════════════════════════════════════════════
RESULTS
═══════════════════════════════════════════════════════════════════════
Passed: 10
Failed: 0
Completed: Tue Nov 19 10:02:15 UTC 2025

🎉 ALL TESTS PASSED!
✅ Safe to deploy to production
```

### 2. Run System Integration Tests

```bash
# Set database URL for testing
export DATABASE_URL="postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production"

# Run Sprint 39 smoke test (database connectivity)
node scripts/testing/smokeTestSprint39.js

# Run E2E system integration tests
node scripts/testing/e2eSystemIntegration.js

# Run security audit
node scripts/testing/securityAudit.js

# Run data quality validation
node scripts/testing/dataQualityValidator.js
```

### 3. Manual Endpoint Testing

```bash
# Get service URL
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"

# Test 1: Health endpoint
curl "$SERVICE_URL/health"
# Expected: {"ok":true,"message":"Service is healthy"}

# Test 2: Diagnostics endpoint
curl "$SERVICE_URL/api/diag" | jq
# Expected: JSON with db_ok: true, routes, env status

# Test 3: Login endpoint
curl -X POST "$SERVICE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-admin-pass"}' | jq
# Expected: {"ok":true,"token":"...","user":{...}}

# Test 4: Companies API
curl "$SERVICE_URL/api/companies?limit=5" | jq
# Expected: {"ok":true,"data":[...companies...]}

# Test 5: Lead enrichment status
curl -X POST "$SERVICE_URL/api/hiring-enrich/from-signal" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test Company","signal":{"type":"test"}}' | jq
# Expected: {"ok":true,"data":{"task_id":"..."}}
```

### 4. Validate Configuration

```bash
# Run deployment validation script
./scripts/validate-deployment.sh

# Checks:
# - VPC Connector configured
# - Cloud SQL instance connected
# - REDIS_URL secret set
# - DATABASE_URL secret set
# - Service account correct
```

### 5. Check Logs for Errors

```bash
# View recent logs
gcloud run services logs read upr-web-service \
  --region us-central1 \
  --limit=50

# Filter for errors only
gcloud run services logs read upr-web-service \
  --region us-central1 \
  --limit=100 \
  --log-filter='severity>=ERROR'

# Follow logs in real-time
gcloud run services logs tail upr-web-service \
  --region us-central1
```

### 6. Performance Validation

```bash
# Check response times for key endpoints
time curl -s "$SERVICE_URL/health" > /dev/null
# Should complete in < 500ms

time curl -s "$SERVICE_URL/api/companies?limit=1" > /dev/null
# Should complete in < 1s

time curl -s "$SERVICE_URL/api/diag" > /dev/null
# Should complete in < 2s
```

### 7. Verify Monitoring Dashboards

- **GCP Console:** https://console.cloud.google.com/run/detail/us-central1/upr-web-service/metrics
- Check request count increasing
- Verify latency metrics (p50, p95, p99)
- Confirm no error spikes

### 8. Database Health Check

```bash
# Connect to database and run health queries
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" <<EOF
-- Check connection
SELECT NOW() as current_time;

-- Check lead count
SELECT COUNT(*) as lead_count FROM leads;

-- Check company count
SELECT COUNT(*) as company_count FROM kb_companies;

-- Check recent agent decisions
SELECT COUNT(*) as decision_count
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Check for database errors
SELECT COUNT(*) as active_connections
FROM pg_stat_activity
WHERE datname = 'upr_production';
EOF
```

### Validation Checklist

- [ ] All smoke tests passing (10/10)
- [ ] E2E tests passing
- [ ] Security audit clean
- [ ] Data quality validated
- [ ] All critical endpoints responding
- [ ] Response times acceptable (< 500ms p95)
- [ ] No errors in logs (last 100 lines)
- [ ] Database connectivity verified
- [ ] GCP monitoring dashboard showing traffic
- [ ] No failed health checks
- [ ] Service account permissions working
- [ ] VPC connector functioning
- [ ] Secrets accessible

---

## Rollback Procedures

### When to Rollback

Rollback immediately if you observe:
- Critical functionality broken (login, enrichment, etc.)
- Database connection failures
- Error rate > 5%
- P95 latency > 5 seconds
- Any security issues

### Quick Rollback (Traffic Splitting)

**Fastest method: Route traffic to previous revision**

```bash
# List recent revisions
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --limit=5

# Example output:
# NAME                       STATUS  CREATED
# upr-web-service-00405-zbb  True    2025-11-18 18:01:54
# upr-web-service-00404-l5b  True    2025-11-18 15:20:34
# upr-web-service-00403-5l5  True    2025-11-18 12:44:32

# Route 100% traffic to previous revision
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=upr-web-service-00404-l5b=100

# Takes effect immediately (< 10 seconds)
```

**Rollback time:** < 1 minute

### Gradual Rollback (Canary)

If issues are non-critical, use gradual rollback:

```bash
# Split traffic 50/50 between old and new
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=upr-web-service-00405-zbb=50,upr-web-service-00404-l5b=50

# Monitor for 5-10 minutes

# If old version is stable, route 100% to old
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=upr-web-service-00404-l5b=100
```

### Full Rollback (Redeploy Previous Version)

For complete rollback including configuration:

```bash
# Step 1: Identify previous working version
git log --oneline -10

# Step 2: Checkout previous tag
git checkout sprint-39-complete

# Step 3: Redeploy
./scripts/deploy-server.sh

# Step 4: Verify rollback successful
./tests/smoke-tests.sh

# Step 5: Return to main branch
git checkout main
```

**Rollback time:** 7-12 minutes (full deployment)

### Database Rollback

**WARNING:** Database rollbacks are risky. Only perform if absolutely necessary.

```bash
# Step 1: Stop application traffic
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0

# Step 2: List available backups
ls -lh ./backups/upr_db_backup_*.sql.gz

# Step 3: Restore from backup
BACKUP_FILE="./backups/upr_db_backup_20251119_100000.sql.gz"
gunzip -c "$BACKUP_FILE" | pg_restore \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  --clean \
  --if-exists

# Step 4: Verify restore
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" \
  -c "SELECT COUNT(*) FROM leads;"

# Step 5: Resume application traffic
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=5
```

**Rollback time:** 5-15 minutes (depends on database size)

### Rollback Verification

After rollback, run validation:

```bash
# 1. Health check
./scripts/health-check.sh

# 2. Smoke tests
./tests/smoke-tests.sh

# 3. Check logs for errors
gcloud run services logs read upr-web-service \
  --region us-central1 \
  --limit=50 \
  --log-filter='severity>=ERROR'

# 4. Manual endpoint testing
curl "$SERVICE_URL/health"
curl "$SERVICE_URL/api/companies?limit=1"
```

### Post-Rollback Actions

1. **Document the incident**
   - What went wrong?
   - What triggered the rollback?
   - What was the impact?

2. **Notify stakeholders**
   - Inform users service is restored
   - Share incident summary

3. **Root cause analysis**
   - Investigate the issue
   - Fix the problem
   - Add tests to prevent recurrence

4. **Plan redeployment**
   - Fix identified issues
   - Test fix thoroughly
   - Schedule new deployment

---

## Troubleshooting

### Issue 1: Build Fails

**Symptoms:**
- `gcloud run deploy` fails during build
- Error: "failed to build"

**Diagnosis:**

```bash
# Check build logs
gcloud builds list --limit=5

# Get build ID and view logs
gcloud builds log <BUILD_ID>
```

**Common causes:**

1. **Dependency installation failure**
   ```bash
   # Fix: Clear npm cache and retry
   rm -rf node_modules package-lock.json
   npm install
   git add package-lock.json
   git commit -m "fix: update package-lock.json"
   ```

2. **Dashboard build failure**
   ```bash
   # Test dashboard build locally
   cd dashboard
   npm install
   npm run build

   # Check for TypeScript errors
   npm run build -- --logLevel debug
   ```

3. **Out of memory during build**
   ```bash
   # Increase Cloud Build memory
   gcloud run deploy upr-web-service \
     --source . \
     --region us-central1 \
     --build-env-vars NODE_OPTIONS="--max-old-space-size=4096"
   ```

### Issue 2: Service Won't Start

**Symptoms:**
- Deployment succeeds but service shows "Revision failed"
- Health checks failing

**Diagnosis:**

```bash
# Check service status
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="yaml(status)"

# View startup logs
gcloud run services logs read upr-web-service \
  --region us-central1 \
  --limit=100
```

**Common causes:**

1. **Missing environment variables**
   ```bash
   # Check secrets are set
   gcloud run services describe upr-web-service \
     --region us-central1 \
     --format="yaml(spec.template.spec.containers[0].env)"

   # Update secrets
   gcloud run services update upr-web-service \
     --region us-central1 \
     --update-secrets=DATABASE_URL=DATABASE_URL:latest
   ```

2. **Database connection failure**
   ```bash
   # Verify Cloud SQL connection
   gcloud run services describe upr-web-service \
     --region us-central1 \
     --format="value(metadata.annotations[run.googleapis.com/cloudsql-instances])"

   # Should show: applied-algebra-474804-e6:us-central1:upr-postgres

   # Test database from Cloud Shell
   gcloud sql connect upr-postgres --user=upr_app --database=upr_production
   ```

3. **Port mismatch**
   ```bash
   # Ensure application listens on PORT from environment
   # Check server.js:
   # const PORT = process.env.PORT || 8080;

   # Cloud Run always sets PORT=8080
   ```

### Issue 3: Database Connection Errors

**Symptoms:**
- Service starts but returns database errors
- `db_ok: false` in `/api/diag`

**Diagnosis:**

```bash
# Test database connectivity
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" \
  -c "SELECT NOW();"

# Check Cloud SQL status
gcloud sql instances describe upr-postgres
```

**Common causes:**

1. **VPC connector misconfigured**
   ```bash
   # Verify VPC connector
   gcloud run services describe upr-web-service \
     --region us-central1 \
     --format="value(metadata.annotations[run.googleapis.com/vpc-access-connector])"

   # Should show: projects/.../connectors/upr-vpc-connector

   # Fix if missing
   gcloud run services update upr-web-service \
     --region us-central1 \
     --vpc-connector=projects/applied-algebra-474804-e6/locations/us-central1/connectors/upr-vpc-connector
   ```

2. **Database credentials wrong**
   ```bash
   # Check DATABASE_URL secret
   gcloud secrets versions access latest --secret=DATABASE_URL

   # Update if needed
   echo "postgresql://upr_app:PASSWORD@34.121.0.240:5432/upr_production" | \
     gcloud secrets versions add DATABASE_URL --data-file=-
   ```

3. **Connection pool exhausted**
   ```bash
   # Check active connections
   psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" <<EOF
   SELECT COUNT(*) as active_connections
   FROM pg_stat_activity
   WHERE datname = 'upr_production';
   EOF

   # If > 90 connections, increase Cloud SQL settings or fix leaks
   ```

### Issue 4: High Latency

**Symptoms:**
- Requests taking > 5 seconds
- Timeouts on some endpoints

**Diagnosis:**

```bash
# Check GCP metrics
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="value(status.url)"

# View latency metrics in console:
# https://console.cloud.google.com/run/detail/us-central1/upr-web-service/metrics

# Check for slow queries
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" <<EOF
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF
```

**Solutions:**

1. **Increase CPU/Memory**
   ```bash
   gcloud run services update upr-web-service \
     --region us-central1 \
     --memory=4Gi \
     --cpu=4
   ```

2. **Add database indexes**
   ```sql
   -- Check missing indexes
   SELECT schemaname, tablename, attname, n_distinct, correlation
   FROM pg_stats
   WHERE schemaname = 'public'
   AND n_distinct > 100
   ORDER BY correlation;

   -- Add index if needed (example)
   CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
   ```

3. **Enable connection pooling**
   ```javascript
   // In db/pool.js, ensure max connections set:
   const pool = new Pool({
     max: 20,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

### Issue 5: 502/503 Errors

**Symptoms:**
- Intermittent 502 Bad Gateway errors
- 503 Service Unavailable errors

**Diagnosis:**

```bash
# Check service health
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="yaml(status.conditions)"

# Check for cold starts
gcloud run services logs read upr-web-service \
  --region us-central1 \
  --log-filter='textPayload=~"Container started"'
```

**Solutions:**

1. **Set minimum instances**
   ```bash
   # Keep 1 instance warm
   gcloud run services update upr-web-service \
     --region us-central1 \
     --min-instances=1
   ```

2. **Increase timeout**
   ```bash
   # Increase to 5 minutes
   gcloud run services update upr-web-service \
     --region us-central1 \
     --timeout=300s
   ```

3. **Check health endpoint**
   ```bash
   # Ensure /health responds quickly
   curl -w "\nTime: %{time_total}s\n" "$SERVICE_URL/health"

   # Should be < 3s (health check timeout)
   ```

### Issue 6: Authentication Failures

**Symptoms:**
- Login returns 401
- JWT verification fails

**Diagnosis:**

```bash
# Check JWT_SECRET is set
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="yaml(spec.template.spec.containers[0].env)" | \
  grep JWT_SECRET

# Test login endpoint
curl -X POST "$SERVICE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}' | jq
```

**Solutions:**

1. **Verify admin credentials**
   ```bash
   # Check admin credentials in secrets
   gcloud secrets versions access latest --secret=UPR_ADMIN_USER
   gcloud secrets versions access latest --secret=UPR_ADMIN_PASS
   ```

2. **Update JWT secret**
   ```bash
   # Generate new JWT secret
   NEW_SECRET=$(openssl rand -base64 32)

   # Update secret
   echo "$NEW_SECRET" | gcloud secrets versions add JWT_SECRET --data-file=-

   # Redeploy to pick up new secret
   gcloud run services update upr-web-service \
     --region us-central1 \
     --update-secrets=JWT_SECRET=JWT_SECRET:latest
   ```

### Getting Help

If issues persist:

1. **Check logs thoroughly**
   ```bash
   gcloud run services logs read upr-web-service \
     --region us-central1 \
     --limit=500 > deployment-logs.txt
   ```

2. **Review recent changes**
   ```bash
   git log --oneline -20
   git diff HEAD~1 HEAD
   ```

3. **Consult documentation**
   - `/docs/TECHNICAL_ARCHITECTURE.md` - System architecture
   - `/docs/USER_GUIDE.md` - Feature documentation
   - Sprint handoff documents in `/docs/`

4. **Contact support**
   - Email: uaesivakumar@gmail.com
   - Include: logs, error messages, steps to reproduce

---

## Environment Variables Reference

### Required Secrets (GCP Secret Manager)

All secrets are managed in GCP Secret Manager and injected at runtime.

| Secret Name | Purpose | Format | Example |
|-------------|---------|--------|---------|
| **DATABASE_URL** | PostgreSQL connection string | `postgresql://user:pass@host:port/db` | `postgresql://upr_app:...@34.121.0.240:5432/upr_production` |
| **REDIS_URL** | Redis connection for caching | `redis://host:port` | `redis://10.0.0.3:6379` |
| **JWT_SECRET** | JWT token signing key | Base64 string (32+ bytes) | `dGhpc2lzYXNlY3JldGtleQ==...` |
| **UPR_ADMIN_USER** | Admin username | String | `admin` |
| **UPR_ADMIN_PASS** | Admin password | String | `SecurePassword123!` |
| **OPENAI_API_KEY** | OpenAI API key for AI features | `sk-...` | `sk-proj-abc123...` |
| **APOLLO_API_KEY** | Apollo.io API key | String | `abc123def456...` |
| **SERPAPI_KEY** | SerpAPI key for web search | String | `xyz789...` |
| **NEVERBOUNCE_API_KEY** | Email verification service | String | `private_...` |
| **HUNTER_API_KEY** | Hunter.io email discovery | String | `abc123...` |
| **TENANT_ID** | Tenant identifier | UUID | `550e8400-e29b-41d4-a716-446655440000` |
| **RADAR_ENABLED** | Enable/disable radar automation | `true` or `false` | `true` |
| **MAX_RUN_BUDGET_USD** | Maximum daily budget for radar | Number | `50` |

### Managing Secrets

```bash
# List all secrets
gcloud secrets list --format="table(name,created)"

# View secret value (be careful!)
gcloud secrets versions access latest --secret=DATABASE_URL

# Create new secret
echo "secret-value" | gcloud secrets create NEW_SECRET --data-file=-

# Update existing secret (creates new version)
echo "new-value" | gcloud secrets versions add EXISTING_SECRET --data-file=-

# Grant Cloud Run access to secret
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Delete old secret versions (keep last 5)
gcloud secrets versions list SECRET_NAME --format="value(name)" | \
  tail -n +6 | \
  xargs -I {} gcloud secrets versions destroy {} --secret=SECRET_NAME --quiet
```

### Environment Variables Set by Cloud Run

These are automatically set by Cloud Run:

| Variable | Value | Purpose |
|----------|-------|---------|
| **PORT** | `8080` | Port to listen on (always 8080) |
| **K_SERVICE** | `upr-web-service` | Service name |
| **K_REVISION** | `upr-web-service-00405-zbb` | Revision identifier |
| **K_CONFIGURATION** | `upr-web-service` | Configuration name |

### Application Environment Variables

Set in code or Dockerfile:

| Variable | Value | Purpose |
|----------|-------|---------|
| **NODE_ENV** | `production` | Node.js environment |
| **LOG_LEVEL** | `info` | Logging verbosity |

---

## Database Migration Process

### Migration File Structure

Migrations are stored in `/db/migrations/` with naming convention:

```
YYYY_MM_DD_description.sql
```

Examples:
- `2025_11_19_multi_agent_system.sql`
- `2025_11_19_agent_enhancement.sql`

### Before Deployment: Review Migrations

```bash
# List migrations
ls -lh db/migrations/

# Find migrations added since last deployment
git diff main..HEAD db/migrations/

# Review specific migration
cat db/migrations/2025_11_19_multi_agent_system.sql
```

### Running Migrations

#### Method 1: Manual Execution (Recommended for Production)

```bash
# Connect to database
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production"

# Check current schema version (if tracking table exists)
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;

# Run migration file
\i db/migrations/2025_11_19_multi_agent_system.sql

# Verify migration succeeded
\dt  -- List tables
\d table_name  -- Describe specific table

# Exit
\q
```

#### Method 2: Batch Migration Script

```bash
# Create migration runner script
cat > run_migration.sh << 'EOF'
#!/bin/bash
MIGRATION_FILE=$1
PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  -f "$MIGRATION_FILE"
EOF

chmod +x run_migration.sh

# Run migration
./run_migration.sh db/migrations/2025_11_19_multi_agent_system.sql
```

### Migration Best Practices

1. **Always backup before migrations**
   ```bash
   ./scripts/backup-db.sh
   ```

2. **Test migrations in development first**
   ```bash
   # Connect to dev database
   psql "postgresql://localhost:5432/upr_dev"

   # Run migration
   \i db/migrations/2025_11_19_test.sql

   # Verify
   SELECT * FROM new_table LIMIT 5;
   ```

3. **Write reversible migrations**
   ```sql
   -- migration_up.sql
   ALTER TABLE leads ADD COLUMN new_field TEXT;

   -- migration_down.sql (for rollback)
   ALTER TABLE leads DROP COLUMN new_field;
   ```

4. **Use transactions for safety**
   ```sql
   BEGIN;

   -- Your migration DDL
   CREATE TABLE new_table (...);
   ALTER TABLE existing_table ADD COLUMN ...;

   -- Verify
   SELECT COUNT(*) FROM new_table;

   -- If OK, commit; if not, rollback manually
   COMMIT;
   -- or: ROLLBACK;
   ```

### Migration Checklist

- [ ] Migration file created with proper naming
- [ ] Migration tested locally
- [ ] Database backed up
- [ ] Migration wrapped in transaction (if possible)
- [ ] Migration includes rollback script
- [ ] No destructive operations (DROP TABLE, etc.) without confirmation
- [ ] Indexes created for new foreign keys
- [ ] Default values provided for new NOT NULL columns
- [ ] Migration documented in Sprint notes

### Common Migration Patterns

#### Add Column with Default

```sql
-- Safe: Add with default for existing rows
ALTER TABLE leads
ADD COLUMN new_field TEXT DEFAULT 'default_value';

-- Then optionally remove default for future rows
ALTER TABLE leads
ALTER COLUMN new_field DROP DEFAULT;
```

#### Create Index Concurrently

```sql
-- Safe: Won't lock table
CREATE INDEX CONCURRENTLY idx_leads_status
ON leads(status);
```

#### Add Foreign Key

```sql
-- Safe: Add constraint
ALTER TABLE leads
ADD CONSTRAINT fk_leads_company
FOREIGN KEY (company_id)
REFERENCES kb_companies(id);

-- Add index for performance
CREATE INDEX idx_leads_company_id ON leads(company_id);
```

#### Rename Column

```sql
-- Rename column (be careful with application code!)
ALTER TABLE leads
RENAME COLUMN old_name TO new_name;

-- Better: Add new column, migrate data, drop old
-- Step 1: Add new column
ALTER TABLE leads ADD COLUMN new_name TEXT;

-- Step 2: Copy data
UPDATE leads SET new_name = old_name;

-- Step 3: Deploy application with new_name support

-- Step 4: Drop old column (in next migration)
ALTER TABLE leads DROP COLUMN old_name;
```

### Troubleshooting Migrations

**Migration fails with "relation already exists"**

```sql
-- Use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS new_table (...);
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS new_column TEXT;
```

**Migration takes too long**

```sql
-- Check long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Kill if necessary (be careful!)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid = <PID>;
```

**Need to rollback migration**

```bash
# 1. Restore from backup
./scripts/backup-db.sh  # (should already have backup)

# 2. Or manually revert changes
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production" <<EOF
BEGIN;
-- Your rollback SQL
DROP TABLE IF EXISTS new_table;
ALTER TABLE leads DROP COLUMN IF EXISTS new_column;
COMMIT;
EOF
```

---

## Zero-Downtime Deployment Strategy

### Overview

Cloud Run provides zero-downtime deployments by default through:
1. **Gradual traffic migration** - New revision receives traffic gradually
2. **Health checks** - Old revision serves traffic until new is healthy
3. **Graceful shutdown** - Existing requests complete before shutdown

### Deployment Phases

#### Phase 1: Build and Push (3-5 minutes)

```
Your Machine → Cloud Build → Container Registry
```

- Code uploaded to Cloud Build
- Docker image built (multi-stage)
- Image pushed to Container Registry
- **No impact on running service**

#### Phase 2: Create New Revision (1-2 minutes)

```
Container Registry → Cloud Run → New Revision Created
```

- New revision created from image
- Container started
- Health checks begin
- **Old revision still serving 100% traffic**

#### Phase 3: Health Check Validation (30-60 seconds)

```
Cloud Run → Health Endpoint (/health) → Check every 30s
```

- Health endpoint called every 30 seconds
- 3-second timeout per check
- 3 retries before marking unhealthy
- **Old revision still serving 100% traffic**

#### Phase 4: Traffic Migration (30-60 seconds)

```
Old Revision (100%) → Gradual Migration → New Revision (100%)
```

- Traffic gradually shifted to new revision
- Both revisions serve requests during migration
- Load balancer manages split
- **Zero dropped requests**

#### Phase 5: Old Revision Shutdown (1-2 minutes)

```
Old Revision → Graceful Shutdown → Terminated
```

- Old revision stops receiving new requests
- Existing requests allowed to complete (up to 10 minutes)
- Container terminated gracefully
- **Zero dropped requests**

### Ensuring Zero Downtime

#### 1. Implement Proper Health Checks

**In Dockerfile:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

**In server.js:**

```javascript
// Health check endpoint - must respond quickly!
app.get('/health', (req, res) => {
  // Check database (with timeout)
  // Check critical services
  res.json({ ok: true, message: 'Service is healthy' });
});
```

**Best practices:**
- Respond in < 3 seconds
- Check database connectivity
- Check critical dependencies
- Return 200 for healthy, 503 for unhealthy

#### 2. Handle Graceful Shutdown

```javascript
// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');

  server.close(() => {
    console.log('Server closed');

    // Close database connections
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});
```

#### 3. Use Canary Deployments (Optional)

For high-risk changes, use gradual rollout:

```bash
# Step 1: Deploy new revision without traffic
gcloud run deploy upr-web-service \
  --source . \
  --region us-central1 \
  --no-traffic \
  --tag=canary

# Step 2: Route 10% traffic to new revision
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-tags=canary=10

# Step 3: Monitor for 10-15 minutes
gcloud run services logs tail upr-web-service --region=us-central1

# Step 4: If stable, route 50% traffic
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-tags=canary=50

# Step 5: If still stable, route 100% traffic
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-tags=canary=100
```

#### 4. Database Migration Strategy

For migrations that could cause downtime:

**Option A: Backward-Compatible Migrations (Recommended)**

```sql
-- Step 1: Add new column (nullable)
ALTER TABLE leads ADD COLUMN new_field TEXT;

-- Deploy application V1.1 (supports both fields)
-- V1.1 reads old_field, writes both old_field and new_field

-- Step 2: Backfill data
UPDATE leads SET new_field = old_field WHERE new_field IS NULL;

-- Step 3: Make required
ALTER TABLE leads ALTER COLUMN new_field SET NOT NULL;

-- Deploy application V1.2 (only uses new_field)

-- Step 4: Drop old column
ALTER TABLE leads DROP COLUMN old_field;
```

**Option B: Maintenance Window**

For breaking changes, schedule downtime:

```bash
# 1. Announce maintenance window
echo "Maintenance in 24 hours: 2AM-2:30AM UTC"

# 2. Scale down before maintenance
gcloud run services update upr-web-service \
  --region=us-central1 \
  --max-instances=0

# 3. Run migration
psql "postgresql://..." -f migration.sql

# 4. Deploy new version
./scripts/deploy-server.sh

# 5. Scale back up
gcloud run services update upr-web-service \
  --region=us-central1 \
  --max-instances=5
```

#### 5. Monitor During Deployment

```bash
# Terminal 1: Watch deployment progress
gcloud run services describe upr-web-service \
  --region us-central1 \
  --format="value(status.conditions[0].type,status.conditions[0].status)"

# Terminal 2: Monitor logs
gcloud run services logs tail upr-web-service --region=us-central1

# Terminal 3: Monitor error rate
watch -n 5 'gcloud run services logs read upr-web-service \
  --region us-central1 \
  --limit=100 \
  --log-filter="severity>=ERROR" | wc -l'

# Terminal 4: Monitor latency
watch -n 5 'curl -w "\nTime: %{time_total}s\n" -s https://upr-web-service-191599223867.us-central1.run.app/health'
```

### Deployment Checklist for Zero Downtime

- [ ] Health check endpoint responds in < 3s
- [ ] Graceful shutdown handler implemented
- [ ] Database migrations are backward-compatible
- [ ] Smoke tests ready to run post-deployment
- [ ] Monitoring dashboard open
- [ ] Rollback plan ready
- [ ] Database backup completed
- [ ] Traffic can be split if needed
- [ ] No breaking API changes
- [ ] Environment variables unchanged (or backward-compatible)

### What Could Cause Downtime

❌ **Things to avoid:**

1. **Breaking database changes**
   - Dropping columns still in use
   - Changing column types without migration
   - Adding NOT NULL without defaults

2. **Breaking API changes**
   - Removing endpoints
   - Changing request/response formats
   - Changing authentication

3. **Environment variable changes**
   - Removing required variables
   - Changing variable names
   - Changing formats

4. **Slow health checks**
   - Health endpoint takes > 3s
   - Health check queries expensive data
   - Health check depends on external services

5. **Application crashes on startup**
   - Missing dependencies
   - Configuration errors
   - Database connection failures

### Best Practices Summary

✅ **Always do:**
- Backup database before deployment
- Test migrations in development
- Run smoke tests post-deployment
- Monitor logs during rollout
- Have rollback plan ready

✅ **During deployment:**
- Keep old revision serving traffic until new is healthy
- Monitor error rates and latency
- Be ready to rollback quickly

✅ **After deployment:**
- Run comprehensive smoke tests
- Monitor for 24 hours
- Document any issues
- Update runbooks if needed

---

## Appendix

### Quick Reference Commands

```bash
# Authentication
gcloud auth login
gcloud config set project applied-algebra-474804-e6

# Deployment
./scripts/deploy-server.sh                          # Quick deploy
./scripts/deploy.sh "commit message" upr-web-service # Full pipeline

# Validation
./tests/smoke-tests.sh                              # Run smoke tests
./scripts/health-check.sh                           # Check all services
./scripts/validate-deployment.sh                    # Validate config

# Database
./scripts/backup-db.sh                              # Backup database
psql "postgresql://upr_app:PASSWORD@34.121.0.240:5432/upr_production"

# Monitoring
gcloud run services logs tail upr-web-service --region=us-central1
gcloud run services describe upr-web-service --region=us-central1

# Rollback
gcloud run revisions list --service=upr-web-service --region=us-central1
gcloud run services update-traffic upr-web-service --to-revisions=REVISION=100

# Secrets
gcloud secrets list
gcloud secrets versions access latest --secret=SECRET_NAME
```

### Resource Links

- **GCP Console:** https://console.cloud.google.com/run/detail/us-central1/upr-web-service
- **Cloud Build History:** https://console.cloud.google.com/cloud-build/builds
- **Cloud SQL:** https://console.cloud.google.com/sql/instances/upr-postgres
- **Secret Manager:** https://console.cloud.google.com/security/secret-manager
- **Logs:** https://console.cloud.google.com/logs/query

### Support Contacts

- **Primary:** uaesivakumar@gmail.com
- **Documentation:** `/docs/` directory in repository
- **Escalation:** See `ADMIN_GUIDE.md` for escalation procedures

### Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-19 | 1.0 | Initial runbook creation | Sprint 40 |

---

**End of Deployment Runbook**

For operational procedures, see: `OPERATIONS_RUNBOOK.md` (coming in Sprint 40 Task 6)
For technical architecture, see: `TECHNICAL_ARCHITECTURE.md`
For user documentation, see: `USER_GUIDE.md`
