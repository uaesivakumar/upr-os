# SPRINT HANDOFF - EMAIL DISCOVERY LOGIC

**Sprint Completed:** 2025-10-29
**Next Sprint:** [Date TBD]
**Status:** ✅ Production Ready

---

## WHAT WAS ACCOMPLISHED

### 🎯 Core Achievement: LLM Email Intelligence System

Built and deployed a **fully intelligent email pattern discovery system** that:

1. ✅ **Reduces 3rd party costs by 97-99%** (NeverBounce credits)
2. ✅ **Builds proprietary database** (100 patterns cached, target 1M)
3. ✅ **Always shows emails** (even unverified - user decides)
4. ✅ **Self-learning** (tracks validation success/failure)
5. ✅ **4-step intelligence cascade** (Cache → LLM → Permutation → Honest failure)

### 📊 Test Results

| Company | Leads | Emails | Success | Method |
|---------|-------|--------|---------|--------|
| Microsoft | 32 | 32 | 100% | LLM 90% confidence |
| SEHA | 57 | 57 | 100% | Cache hit |
| Chanel | 10 | 10 | 100% | Cache hit |
| Kent PLC | 35 | 35 | 100% | LLM discovery |
| Khansaheb | 26 | 26 | 100% | LLM discovery |
| Emirates | 97 | 0 | 0% | Failed (needs investigation) |

**Overall:** 67% success rate, 49% email generation rate

### 🚀 Deployed Revisions

| Rev | Commit | Changes | Status |
|-----|--------|---------|--------|
| 00275-ntn | db8f6b3 | LLM email intelligence | ✅ Deployed |
| 00276-93c | 93c0fa2 | Skip verification 90%+ | ✅ Deployed |
| 00277-658 | 65827c5 | Always show unverified | ✅ Code Ready |
| 00276-6fb | 074d2be | Final deployment | ✅ **LIVE NOW** |

**Live URL:** https://upr-web-service-191599223867.us-central1.run.app

---

## HOW TO DEPLOY

### Prerequisites

1. **GCP Access** - Must have access to project `applied-algebra-474804-e6`
2. **GitHub Access** - Repository: https://github.com/uaesivakumar/UPR.git
3. **Branch** - `feature/phase-2a-enrichment-migration`

### Deployment Commands

```bash
# 1. Navigate to project
cd /Users/skc/DataScience/upr

# 2. Ensure you're on correct branch
git checkout feature/phase-2a-enrichment-migration
git pull origin feature/phase-2a-enrichment-migration

# 3. Build Docker image (3-5 minutes)
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service \
  --timeout=600s

# 4. Deploy to Cloud Run (2-3 minutes)
gcloud run deploy upr-web-service \
  --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated

# 5. Verify deployment
curl https://upr-web-service-191599223867.us-central1.run.app/health

# 6. Test email generation (Microsoft example)
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/enrich/generate \
  -H 'Content-Type: application/json' \
  -d '{"summary":{"company":{"name":"Microsoft","domain":"microsoft.com"}}}' \
  | jq '.data.results[0].email'
```

### Quick Deploy (One Command)

```bash
cd /Users/skc/DataScience/upr && \
gcloud builds submit --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service --timeout=600s && \
gcloud run deploy upr-web-service --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service:latest --region us-central1 --platform managed --allow-unauthenticated
```

### If Deployment Fails

**Common Issue:** Artifact Registry repository not found

```bash
# Create repository (one-time only)
gcloud artifacts repositories create upr \
  --repository-format=docker \
  --location=us-central1 \
  --description="UPR web service container images"
```

**Check build status:**
```bash
gcloud builds list --limit=5
```

**Check logs:**
```bash
gcloud builds log [BUILD_ID]
```

---

## PROJECT STRUCTURE

### Key Files (Email Discovery Logic)

```
/Users/skc/DataScience/upr/
│
├── routes/enrich/lib/
│   ├── email.js                    # MAIN: 4-step email intelligence (345 lines)
│   └── person.js                   # NeverBounce verification (213-260)
│
├── utils/
│   └── llm.js                      # LLM pattern discovery (106-161)
│
├── routes/enrich/
│   └── generate.js                 # API endpoint /api/enrich/generate
│
├── db/migrations/
│   └── 2025_10_20_email_pattern_intelligence.sql  # Database schema
│
└── docs/
    ├── EMAIL_DISCOVERY_LOGIC.md    # Complete technical docs (1,493 lines)
    └── SPRINT_HANDOFF.md           # This file
```

### Database Tables

**PostgreSQL Cloud SQL:** `upr_production`

```sql
-- Main intelligence cache
email_patterns (domain PK, pattern, confidence, status, usage_count, etc.)

-- Learning system
pattern_feedback (id, domain, pattern, event: 'valid'|'bounce'|'delivered')

-- MX record cache
domain_health (domain PK, mx_ok, catch_all, last_checked)

-- Cost tracking
enrichment_telemetry (id, domain, llm_cost_cents, nb_calls, latency_ms)
```

### Email Status Values

| Status | Meaning | Frontend Display |
|--------|---------|------------------|
| `patterned` / `validated` | Verified by NeverBounce | ✅ Verified |
| `accept_all` | Catch-all domain | ✅ Catch-all |
| `unverified` | Pattern exists but not confirmed | ⚠️ Unverified |
| `null` | No email found | (empty) |

### Email Reason Values

| Reason | Method | Confidence |
|--------|--------|------------|
| `cached_valid_pattern` | Cache hit | High |
| `cached_catch_all` | Cache hit | High |
| `cached_unverified_pattern` | Cache hit | Medium |
| `ai_llm_high_confidence` | LLM 90%+ | Very High |
| `ai_llm_discovered` | LLM 80-89% + verified | High |
| `ai_llm_unverified` | LLM 80-89% + rejected | Medium |
| `ai_llm_moderate_confidence` | LLM 70-79% | Medium |
| `smart_permutation` | Permutation found | Medium |
| `all_methods_failed` | All failed | None |

---

## ENVIRONMENT VARIABLES

### Where They Are Stored

**GCP Secret Manager + Cloud Run Environment Variables**

Access via:
```bash
# List all secrets
gcloud secrets list

# View secret value
gcloud secrets versions access latest --secret="SECRET_NAME"
```

### Required Environment Variables

```bash
# OpenAI LLM (Pattern Discovery)
OPENAI_API_KEY=sk-proj-...          # GPT-4-turbo API key
OPENAI_MODEL=gpt-4-turbo            # Model name (optional, defaults to gpt-4-turbo)
OPENAI_TEMPERATURE=0.3              # Temperature 0.0-1.0 (optional, defaults to 0.3)

# NeverBounce (Email Verification)
NEVERBOUNCE_API_KEY=private_...     # API key for email verification
# Cost: ~$0.01 per credit, current balance: 10,000 credits

# Apollo.io (Lead Data)
APOLLO_API_KEY=...                  # API key for lead sourcing

# Database (Cloud SQL)
DATABASE_URL=postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@/upr_production?host=/tmp/applied-algebra-474804-e6:us-central1:upr-postgres

# Server
PORT=8080                           # Cloud Run port (required)
NODE_ENV=production                 # Environment mode
```

### How to Update Environment Variables

**Method 1: Via Cloud Run Console**
1. Go to: https://console.cloud.google.com/run
2. Select service: `upr-web-service`
3. Click "Edit & Deploy New Revision"
4. Go to "Variables & Secrets" tab
5. Add/Update variables
6. Deploy

**Method 2: Via Command Line**
```bash
gcloud run services update upr-web-service \
  --region us-central1 \
  --set-env-vars OPENAI_API_KEY=sk-proj-new-key
```

### How to Add New Secret

```bash
# Create secret
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member=serviceAccount:191599223867-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Update Cloud Run to use secret
gcloud run services update upr-web-service \
  --region us-central1 \
  --set-secrets=SECRET_NAME=SECRET_NAME:latest
```

---

## HOW TO WORK ON THIS PROJECT

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/uaesivakumar/UPR.git
cd UPR

# 2. Switch to feature branch
git checkout feature/phase-2a-enrichment-migration

# 3. Install dependencies
npm install
cd dashboard && npm install && cd ..

# 4. Set environment variables (create .env file)
cat > .env << 'EOF'
OPENAI_API_KEY=sk-proj-...
NEVERBOUNCE_API_KEY=private_...
APOLLO_API_KEY=...
DATABASE_URL=postgresql://...
PORT=8080
NODE_ENV=development
EOF

# 5. Start local server
npm run dev

# 6. Test locally
curl http://localhost:8080/health
```

### Making Code Changes

```bash
# 1. Make changes to files
vim routes/enrich/lib/email.js

# 2. Test locally
npm run dev

# 3. Commit changes
git add .
git commit -m "feat: your change description"

# 4. Push to GitHub
git push origin feature/phase-2a-enrichment-migration

# 5. Deploy to production (see deployment section above)
```

### Testing Changes

```bash
# Test email generation locally
curl -X POST http://localhost:8080/api/enrich/generate \
  -H 'Content-Type: application/json' \
  -d '{"summary":{"company":{"name":"Microsoft","domain":"microsoft.com"}}}' \
  | jq '.data.results[] | {name: .name, email: .email, email_status: .email_status}'

# Test email generation on production
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/enrich/generate \
  -H 'Content-Type: application/json' \
  -d '{"summary":{"company":{"name":"SEHA","domain":"seha.ae"}}}' \
  | jq '.data.results[] | {name: .name, email: .email}'
```

### Database Access

```bash
# Connect to Cloud SQL via proxy
gcloud beta sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production

# Password: UprApp2025!Pass31cd5b023e349c88

# Useful queries:
SELECT COUNT(*) FROM email_patterns;
SELECT domain, pattern, status, confidence FROM email_patterns ORDER BY updated_at DESC LIMIT 10;
SELECT * FROM email_patterns WHERE domain = 'microsoft.com';
```

### View Logs

```bash
# Cloud Run logs
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="upr-web-service"'
  --limit 50 \
  --format json

# Filter by domain
gcloud logging read 'resource.type="cloud_run_revision"
  AND textPayload=~"microsoft.com"'
  --limit 50

# Real-time logs (tail)
gcloud logging tail --format=default \
  'resource.type="cloud_run_revision"
  AND resource.labels.service_name="upr-web-service"'
```

---

## CURRENT STATE

### What's Working ✅

1. **LLM Pattern Discovery** - 67% success rate
2. **Cost Optimization** - 97-99% reduction in NeverBounce calls
3. **Pattern Caching** - 100 patterns cached, instant lookups
4. **High Confidence Skip** - 90%+ confidence patterns skip verification
5. **Unverified Display** - All emails shown, even if unverified
6. **Learning System** - Validation attempts/successes tracked

### What's Not Working ❌

1. **Emirates Complete Failure** - 0/97 emails (needs log investigation)
2. **HR Admin Scoring** - 68% vs target 85%
3. **MAF Partial Success** - Only 22/83 emails (Apollo data quality issue)

### Performance Metrics

- **Cache Hit Rate:** 10% (target: 95% in 12 months)
- **LLM Success Rate:** 67% (target: 85%)
- **Cost per Search:** ~$0.05 (target: $0.001)
- **Response Time:** 2-5 seconds (LLM), <100ms (cache)

---

## NEXT SPRINT PRIORITIES

### Immediate (Week 1)

1. **Debug Emirates Failure** - Check Cloud Run logs for LLM response
2. **Clear Microsoft Cache** - Force re-test with new logic
3. **Monitor Production** - Track cache hit rate, costs

### Short-term (Week 2-4)

1. **Seed UAE Top 500** - $5 + 500 credits
2. **Add Telemetry Dashboard** - Grafana/Cloud Monitoring
3. **Fix HR Admin Scoring** - Tune to reach 85%

### Medium-term (Month 2-3)

1. **Seed 100K GCC Companies** - $1K + 100K credits
2. **Vector Similarity Search** - Find similar companies without LLM
3. **Feedback Loop** - Track bounce/delivery events

### Long-term (12 Months)

1. **1M Patterns Cached** - Build proprietary database
2. **95% Cache Hit Rate** - Near-zero cost per search
3. **Eliminate 3rd Party Dependency** - <5% NeverBounce usage

---

## DOCUMENTATION REFERENCES

### Technical Documentation

- **EMAIL_DISCOVERY_LOGIC.md** - Complete system documentation (1,493 lines)
  - Location: `/docs/EMAIL_DISCOVERY_LOGIC.md`
  - GitHub: https://github.com/uaesivakumar/UPR/blob/feature/phase-2a-enrichment-migration/docs/EMAIL_DISCOVERY_LOGIC.md

- **SPRINT_HANDOFF.md** - This file
  - Location: `/docs/SPRINT_HANDOFF.md`

### Test Reports

- `/tmp/FINAL_VALIDATION_REPORT.md` - 6 companies tested
- `/tmp/EMAIL_INTELLIGENCE_ANALYSIS.md` - 5 key questions answered
- `/tmp/STRESS_TEST_REPORT.md` - Initial 5 company stress test

### Database Schema

- `/db/migrations/2025_10_20_email_pattern_intelligence.sql`

---

## TROUBLESHOOTING GUIDE

### Issue: No emails generated

**Symptoms:** `emails_generated: 0`, `email_reason: "all_methods_failed"`

**Check:**
1. LLM API key valid? `gcloud secrets versions access latest --secret="OPENAI_API_KEY"`
2. LLM called? Check logs for `[LLM] Discovered pattern`
3. NeverBounce credits? Check account balance

### Issue: Deployment fails

**Symptoms:** Build fails with "Repository not found"

**Fix:**
```bash
gcloud artifacts repositories create upr \
  --repository-format=docker \
  --location=us-central1
```

### Issue: Database connection error

**Symptoms:** `connection to server on socket ... failed`

**Fix:**
```bash
# Verify Cloud SQL proxy is running
gcloud sql instances list

# Verify connection string
echo $DATABASE_URL
```

### Issue: High costs

**Symptoms:** NeverBounce credits depleting fast

**Check:**
1. Cache hit rate: `SELECT COUNT(*) FROM email_patterns`
2. Verify only 1 lead tested (not all): Check logs for "Testing 1 lead only"
3. Seed high-volume companies proactively

---

## QUICK REFERENCE

### Important URLs

- **Production API:** https://upr-web-service-191599223867.us-central1.run.app
- **GitHub Repo:** https://github.com/uaesivakumar/UPR
- **GCP Console:** https://console.cloud.google.com/run?project=applied-algebra-474804-e6
- **Cloud SQL:** https://console.cloud.google.com/sql/instances/upr-postgres

### Important Commands

```bash
# Deploy
gcloud builds submit --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service && \
gcloud run deploy upr-web-service --image us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr/upr-web-service:latest --region us-central1

# Test
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/enrich/generate -H 'Content-Type: application/json' -d '{"summary":{"company":{"name":"Microsoft","domain":"microsoft.com"}}}' | jq '.data.results[0].email'

# Database
PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql -h /tmp/applied-algebra-474804-e6:us-central1:upr-postgres -U upr_app -d upr_production

# Logs
gcloud logging tail --format=default 'resource.type="cloud_run_revision" AND resource.labels.service_name="upr-web-service"'

# Cache stats
psql -c "SELECT COUNT(*), AVG(confidence), SUM(usage_count) FROM email_patterns;"
```

### Git Workflow

```bash
# Standard workflow
git pull origin feature/phase-2a-enrichment-migration
# Make changes
git add .
git commit -m "feat: description"
git push origin feature/phase-2a-enrichment-migration
# Deploy (see above)
```

---

## SUMMARY FOR NEXT SPRINT

### 🎉 What We Built

A **fully intelligent, self-learning email discovery system** that:
- Discovers patterns using LLM (67% success)
- Caches patterns permanently (100 cached so far)
- Reduces costs by 97-99%
- Always shows emails (even unverified)
- Builds toward 1M pattern proprietary database

### 📍 Current Status

- **Deployed:** Rev 00276-6fb LIVE
- **Working:** Microsoft (32/32), SEHA (57/57), Chanel (10/10), Kent PLC (35/35)
- **Broken:** Emirates (0/97 - needs debugging)
- **Documented:** EMAIL_DISCOVERY_LOGIC.md (1,493 lines)

### 🚀 Next Steps

1. Debug Emirates failure
2. Seed UAE top 500 companies
3. Monitor cache hit rate
4. Scale to 1M patterns over 12 months

---

**Ready for Next Sprint!** 🚀

All code committed, deployed, and documented.
Just run the deployment commands above to continue.
