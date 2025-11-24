# Phase 2 Database Consolidation Plan

**Date:** 2025-11-21
**Status:** Analysis Complete - Awaiting User Approval

---

## Current State

### upr-postgres (Production)
- **Tier:** db-g1-small
- **Storage:** 20GB
- **Databases:** `postgres` (default), `upr_production` (active)
- **Status:** RUNNABLE
- **Cost:** ~$35/month

### upr-db-instance (Legacy)
- **Tier:** db-g1-small  
- **Storage:** 10GB
- **Databases:** `postgres` (default only)
- **Status:** RUNNABLE
- **Cost:** ~$25/month
- **⚠️ Issue:** No production databases, appears to be unused

---

## Recommendation

**Action:** Delete `upr-db-instance` (appears to be legacy/unused)

**Rationale:**
1. Only contains default `postgres` database (no custom DBs)
2. No application appears to be using it
3. Duplicate infrastructure cost

**Savings:** ~$25/month

---

## Risk Assessment

**Risk Level:** ⚠️ MEDIUM

**Before deletion, verify:**
1. Check if any service references `upr-db-instance` in connection strings
2. Confirm no backups or data needed from this instance
3. Review Cloud Run service environment variables

**Verification Commands:**
```bash
# Check if any Cloud Run service uses this instance
gcloud run services list --format="yaml(spec.template.spec.containers[].env)" | grep -i "upr-db-instance"

# Check Cloud SQL connections
gcloud run services list --format="yaml(metadata.annotations)" | grep -i "upr-db-instance"
```

---

## Recommended Action Plan

### Option A: Safe Deletion (Recommended)
1. ✅ Verify no services reference `upr-db-instance`
2. ✅ Export final backup (if needed)
3. ✅ Delete instance
4. ✅ Monitor for 24 hours

### Option B: Keep for Now
- If uncertain, keep the instance but downgrade to `db-f1-micro`
- Savings: ~$10/month (less than deletion but safer)

---

## User Decision Required

**Question:** Should we proceed with deleting `upr-db-instance`?

- [ ] **YES** - Delete (save $25/month)
- [ ] **NO** - Keep but downgrade to db-f1-micro (save $10/month)
- [ ] **INVESTIGATE** - Need more time to verify usage
