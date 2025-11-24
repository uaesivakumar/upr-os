# Sprint 19 Smoke Tests

**Date:** 2025-11-12
**Deployment:** upr-web-service-00357-6vn
**Service URL:** https://upr-web-service-191599223867.us-central1.run.app

---

## 📋 Pre-Test: Database Migrations

**⚠️ IMPORTANT: Run these migrations before smoke testing**

```bash
# Connect to production database
source .env
export DATABASE_URL="<production-db-url>"

# Run migrations in order
psql "$DATABASE_URL" -f db/migrations/2025_11_12_orchestration_runs.sql
psql "$DATABASE_URL" -f db/migrations/2025_11_12_deduplication_columns.sql
psql "$DATABASE_URL" -f db/migrations/2025_11_12_source_performance_tracking.sql

# Verify migrations
psql "$DATABASE_URL" -c "\dt orchestration_runs"
psql "$DATABASE_URL" -c "\dt source_health"
psql "$DATABASE_URL" -c "\dt source_performance_metrics"
psql "$DATABASE_URL" -c "\d hiring_signals" | grep -E "(duplicate|quality)"
```

---

## 🧪 Smoke Test Suite

### Test 1: Service Health Check
```bash
# Test: Service is running
curl -I https://upr-web-service-191599223867.us-central1.run.app/health

# Expected: 200 OK
# ✅ PASS / ❌ FAIL: _______
```

### Test 2: Orchestration API - Get Sources
```bash
# Test: Get all sources
curl -X GET https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/sources \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with sources array
# Should include: news, linkedin, jobs, social
# ✅ PASS / ❌ FAIL: _______
```

### Test 3: Multi-Source Orchestration
```bash
# Test: Run multi-source discovery
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/discover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sources": ["linkedin"],
    "filters": {"location": "UAE", "sector": "Banking"},
    "maxParallel": 4,
    "tenantId": "<your-tenant-id>"
  }'

# Expected: JSON with orchestration results
# Should include: orchestrationId, signals, deduplication, quality
# ✅ PASS / ❌ FAIL: _______
```

### Test 4: Source Prioritization - Get Priorities
```bash
# Test: Get all source priorities
curl -X GET https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/priorities \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with priorities array
# Should include: effectivePriority, priorityTier, performanceMetrics
# ✅ PASS / ❌ FAIL: _______
```

### Test 5: Source Prioritization - Set Manual Priority
```bash
# Test: Set manual priority for LinkedIn source
curl -X PUT https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/priorities/linkedin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority": 0.85}'

# Expected: JSON with updated metrics
# Should show: manualPriorityOverride = 0.85
# ✅ PASS / ❌ FAIL: _______
```

### Test 6: Source Prioritization - Get Recommendations
```bash
# Test: Get priority recommendations
curl -X GET https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/recommendations \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with recommendations
# Should include: topPerformers, underperformers, needsAttention
# ✅ PASS / ❌ FAIL: _______
```

### Test 7: Signal Quality Scoring - Get Analytics
```bash
# Test: Get quality analytics
curl -X GET "https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/quality?days=7" \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with quality analytics
# Should include: overall stats, bySource breakdown
# ✅ PASS / ❌ FAIL: _______
```

### Test 8: Unified Discovery - Simple Discovery
```bash
# Test: Unified signal discovery
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/discovery/signals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {"location": "UAE"},
    "options": {
      "sources": ["linkedin"],
      "minQuality": 0.6,
      "useCache": true
    }
  }'

# Expected: JSON with discovery results
# Should include: signals, statistics, deduplication, quality
# All signals should have quality_score >= 0.6
# ✅ PASS / ❌ FAIL: _______
```

### Test 9: Unified Discovery - Paginated
```bash
# Test: Paginated discovery
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/discovery/signals/paginated \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {"location": "UAE"},
    "options": {"useCache": true},
    "pagination": {"page": 1, "limit": 10}
  }'

# Expected: JSON with paginated results
# Should include: pagination object with page, limit, totalPages
# Signals array should have <= 10 items
# ✅ PASS / ❌ FAIL: _______
```

### Test 10: Unified Discovery - Cache Stats
```bash
# Test: Get cache statistics
curl -X GET https://upr-web-service-191599223867.us-central1.run.app/api/discovery/cache/stats \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with cache stats
# Should include: keys, hits, misses, hitRate
# ✅ PASS / ❌ FAIL: _______
```

### Test 11: Deduplication Verification
```bash
# Test: Run orchestration and verify deduplication stats
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/discover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sources": ["linkedin"],
    "filters": {},
    "tenantId": "<your-tenant-id>"
  }' | jq '.deduplication'

# Expected: JSON with deduplication stats
# Should include: originalCount, uniqueCount, duplicatesRemoved
# duplicatesRemoved should be >= 0
# ✅ PASS / ❌ FAIL: _______
```

### Test 12: Quality Scoring Verification
```bash
# Test: Run discovery and verify quality scores
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/discovery/signals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {},
    "options": {"sources": ["linkedin"]}
  }' | jq '.discovery.signals[0] | {quality_score, quality_tier, quality_breakdown}'

# Expected: JSON with quality scoring
# Should include: quality_score (0.0-1.0), quality_tier, quality_breakdown
# ✅ PASS / ❌ FAIL: _______
```

### Test 13: Circuit Breaker - Reset
```bash
# Test: Reset circuit breaker for a source
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/sources/linkedin/reset \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with success message
# Circuit breaker should be reset to 'closed'
# ✅ PASS / ❌ FAIL: _______
```

### Test 14: Performance Metrics - Reset
```bash
# Test: Reset performance metrics for a source
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/priorities/linkedin/reset \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with reset metrics
# All counters should be 0, priority should be 0.50
# ✅ PASS / ❌ FAIL: _______
```

### Test 15: Orchestration Analytics
```bash
# Test: Get orchestration analytics (last 7 days)
curl -X GET "https://upr-web-service-191599223867.us-central1.run.app/api/orchestration/analytics?days=7" \
  -H "Authorization: Bearer $TOKEN"

# Expected: JSON with analytics array
# Should include daily stats: runCount, totalSignals, successRate
# ✅ PASS / ❌ FAIL: _______
```

---

## 📊 Test Results Summary

**Total Tests:** 15
**Passed:** _______
**Failed:** _______
**Success Rate:** _______ %

---

## 🐛 Issues Found

| Test # | Issue Description | Severity | Status |
|--------|-------------------|----------|--------|
|        |                   |          |        |

---

## ✅ Sprint 19 Feature Verification

### Task 1: Multi-Source Orchestrator
- [ ] Sources endpoint returns all 4 sources
- [ ] Orchestration runs successfully
- [ ] Parallel execution works (4 concurrent)
- [ ] Circuit breaker activates on failures
- [ ] Health monitoring tracks source status
- [ ] Database saves orchestration runs

### Task 2: Cross-Source Deduplication
- [ ] Deduplication stats returned in results
- [ ] Duplicates correctly identified
- [ ] Similarity scores calculated
- [ ] `unique_hiring_signals` view works
- [ ] Deduplication columns exist in hiring_signals

### Task 3: Source Prioritization Engine
- [ ] Priority metrics calculated automatically
- [ ] Manual priority overrides work
- [ ] Recommendations engine provides insights
- [ ] Performance tracking updates after runs
- [ ] Priority decay works for underperformers

### Task 4: Signal Quality Scoring
- [ ] Quality scores calculated (0.0-1.0)
- [ ] Multi-source bonus applied (+0.15)
- [ ] Quality tiers assigned correctly
- [ ] Quality analytics endpoint works
- [ ] Quality breakdown shows all factors

### Task 5: Unified Signal Pipeline
- [ ] Unified discovery endpoint works
- [ ] Caching improves performance
- [ ] Pagination works correctly
- [ ] Quality filtering works
- [ ] Multi-source filter works
- [ ] Cache stats endpoint works

### Task 6: Source Configuration Dashboard
- [ ] Dashboard page renders without errors
- [ ] All 4 tabs load correctly
- [ ] Source enable/disable works
- [ ] Priority slider adjustments work
- [ ] Circuit breaker reset works
- [ ] Analytics displays correctly

---

## 📝 Notes

**Deployment Info:**
- Revision: upr-web-service-00357-6vn
- Region: us-central1
- Deployment Time: ~6 minutes

**Sprint 19 Summary:**
- 6 tasks completed (100%)
- 34/34 hours delivered
- ~2,700 lines of code added
- 3 database migrations
- 16 new API endpoints
- 1 React dashboard component

**Known Limitations:**
- Database migrations must be run manually (not automated)
- LinkedIn is the only implemented source (news, jobs, social are placeholders)
- No test suite exists yet (manual testing only)

---

## 🚀 Production Checklist

Before marking Sprint 19 complete:
- [ ] All 15 smoke tests pass
- [ ] Database migrations verified
- [ ] No errors in Cloud Run logs
- [ ] Sentry dashboard shows no critical errors
- [ ] Discovery endpoint returns valid signals
- [ ] Source priorities calculate correctly
- [ ] Quality scores look reasonable
- [ ] Dashboard loads without console errors

---

**Tested By:** _______________________
**Date:** _______________________
**Time:** _______________________
**Status:** 🟢 PASS / 🟡 PARTIAL / 🔴 FAIL
