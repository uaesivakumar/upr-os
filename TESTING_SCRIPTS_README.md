# RADAR Testing Scripts

This directory contains two test scripts for the RADAR discovery module:

---

## 📁 Available Scripts

### 1. `run_first_discovery.sh` ⭐ **RECOMMENDED**

**Best for:** Quick automated testing with minimal interaction

**Features:**
- ✅ Fully automated (only 2 prompts: username/password, then confirmation)
- ✅ Uses `jq` for clean JSON parsing
- ✅ 10 comprehensive test steps
- ✅ Auto-extracts run_id and monitors progress
- ✅ Real-time progress updates every 15 seconds
- ✅ Optional database validation (if DATABASE_URL is set)
- ✅ Final summary with all key metrics
- ⚡ **Total time: 10-15 minutes**

**Usage:**
```bash
# Quick start
./run_first_discovery.sh

# With database validation
export DATABASE_URL="postgresql://..."
./run_first_discovery.sh
```

**Requirements:**
- `curl` (for API calls)
- `jq` (for JSON parsing) - Install with: `brew install jq` or `apt-get install jq`
- `psql` (optional, for database validation)

**What it does:**
1. Login and get JWT token (prompts for credentials)
2. Test RADAR health endpoint
3. List discovery sources (5 UAE sources)
4. Check current tenant statistics
5. Trigger discovery run (with cost confirmation)
6. Monitor progress (polls every 15 seconds, max 10 minutes)
7. Get final statistics
8. Check source performance metrics
9. Check dead letter queue
10. Validate database entries (if DATABASE_URL is set)

**Output:**
- Clean JSON output with `jq` formatting
- Real-time progress: `[N] Status: running | Found: X | Accepted: Y | Cost: $Z`
- Final summary with run ID and key metrics

---

### 2. `test_radar_sprint3.sh`

**Best for:** Step-by-step interactive testing with detailed explanations

**Features:**
- ✅ Interactive prompts at each step
- ✅ Color-coded output (red/yellow/green/blue)
- ✅ Detailed explanations before each test
- ✅ Press Enter to continue between steps
- ✅ Cost breakdown and warnings
- ✅ Database validation queries provided (manual execution)
- ✅ Comprehensive 8-section test suite
- ⏱️ **Total time: 15-20 minutes (with reading explanations)**

**Usage:**
```bash
./test_radar_sprint3.sh
```

**Requirements:**
- `curl` (for API calls)
- `python3` (for JSON parsing via `python3 -m json.tool`)

**What it does:**
1. **Authentication:** Get JWT token (dashboard or API)
2. **Health Checks:** Test /api/radar/health and /api/diag
3. **API Testing:** Test 3 endpoints (sources, stats, runs)
4. **Discovery Run:** Trigger with detailed cost warning
5. **Monitoring:** Auto-poll with status updates
6. **Validation:** Test 5 validation endpoints
7. **Database:** Provide SQL queries (manual execution)
8. **Summary:** Final recap and next steps

**Output:**
- Color-coded sections and status messages
- Expected results shown for each test
- Detailed guidance and explanations
- SQL queries for manual database validation

---

## 🔍 Quick Comparison

| Feature | `run_first_discovery.sh` | `test_radar_sprint3.sh` |
|---------|-------------------------|------------------------|
| **Automation** | Fully automated | Interactive (press Enter) |
| **JSON Parsing** | `jq` (clean) | `python3` (built-in) |
| **Color Output** | No | Yes (red/yellow/green/blue) |
| **Explanations** | Minimal | Detailed |
| **Database Queries** | Auto-executed | Manual (provided) |
| **Time Required** | 10-15 min | 15-20 min |
| **Best For** | Quick testing | Learning/debugging |

---

## 🚀 Recommended Workflow

### First Time Setup (Use Interactive)
```bash
# Use the interactive script to understand each step
./test_radar_sprint3.sh
```

**Why:** Step-by-step explanations help you understand the testing process.

### Subsequent Runs (Use Automated)
```bash
# Use the automated script for faster testing
./run_first_discovery.sh
```

**Why:** No need to press Enter at each step, just enter credentials once and let it run.

---

## 🎯 Sprint 3 Success Criteria

To complete Sprint 3, you need:

✅ **At least 3 successful discovery runs**
✅ **30+ UAE companies** discovered (≥70% confidence)
✅ **Average cost <$1.50** per run
✅ **Dead letter rate <10%** (90%+ extraction success)
✅ **All 8 API endpoints** tested and working
✅ **Source performance data** collected

**Use:** Run either script 3 times to gather performance data.

---

## 📊 Expected Results (First Run)

**Good Results:**
```
Companies Found: 15-30
Companies Accepted: 10-20
Cost: $0.80 - $1.50
Duration: 6-8 minutes
Dead Letters: 2-5
```

**Excellent Results:**
```
Companies Found: 40-50
Companies Accepted: 25-35
Cost: $0.50 - $0.80
Duration: 4-6 minutes
Dead Letters: 0-2
```

---

## 🔧 Prerequisites

### Required
- ✅ UPR credentials (username/password)
- ✅ `curl` installed
- ✅ Internet connection

### Recommended
- ✅ `jq` installed (for `run_first_discovery.sh`)
- ✅ `python3` installed (for `test_radar_sprint3.sh`)

### Optional
- ✅ `psql` installed (for database validation)
- ✅ `DATABASE_URL` environment variable set

---

## 💰 Cost Information

**Estimated Cost per Run:** $0.50 - $2.00

**Breakdown:**
- SerpAPI searches: $0.075 (15 searches × $0.005)
- Web crawling: Free
- GPT-4 extraction: $0.30 - $1.50
- **Total: $0.50 - $2.00**

**Budget Protection:**
- ✅ Budget limit enforced: $2.00 maximum
- ✅ Kill-switch aborts run if budget exceeded
- ✅ All costs tracked in `usage_events` table

---

## 🐛 Troubleshooting

### "jq: command not found"

**Solution:**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Or use the other script
./test_radar_sprint3.sh  # Uses python3 instead
```

### "Failed to get token"

**Solution:**
- Check username and password are correct
- Try logging in via dashboard: https://upr.sivakumar.ai
- Extract JWT token from browser cookies (Application > Cookies)
- Manually set `TOKEN` variable in script

### "Run times out after 10 minutes"

**Solution:**
- Normal for first run (cold start)
- Check Cloud Run logs: `gcloud run services logs tail upr-web-service`
- Subsequent runs should be faster (5-8 minutes)

### "No companies discovered"

**Solution:**
- Check dead letter queue: Step 9 in either script
- Review Cloud Run logs for errors
- Verify sources are accessible (try manually visiting URLs)
- Check prompt version in `prompt_versions` table

---

## 📚 Additional Documentation

- **Complete Testing Guide:** `RADAR_TESTING.md`
- **Deployment Guide:** `DEPLOYMENT_READY.md`
- **Project Checkpoint:** `UPR_CHECKPOINT.md`

---

## 🎉 Quick Start (Choose One)

**For first-time testing:**
```bash
./test_radar_sprint3.sh  # Interactive with explanations
```

**For quick automated testing:**
```bash
./run_first_discovery.sh  # Fully automated
```

**For database validation:**
```bash
export DATABASE_URL="postgresql://user:pass@host:5432/db"
./run_first_discovery.sh  # Auto-validates database
```

---

**Last Updated:** October 18, 2025
**Status:** Both scripts tested and ready
**Production URL:** https://upr-web-service-191599223867.us-central1.run.app
