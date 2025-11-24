# Render.com Deprecation Notice

**Date**: November 14, 2025
**Status**: ⚠️ DEPRECATED - DO NOT USE

---

## Official Notice

**Render.com PostgreSQL database has been DEPRECATED and replaced with GCP Cloud SQL.**

### ❌ Render Database (DEPRECATED)
```
Host: dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com
Database: upr_postgres
User: upr_postgres_user
Status: READ-ONLY (pending decommission)
```

### ✅ GCP Cloud SQL (ACTIVE)
```
Instance: applied-algebra-474804-e6:us-central1:upr-postgres
Database: upr_production
User: upr_app
Connection: Via Cloud SQL Proxy
```

---

## Migration Timeline

| Date | Event |
|------|-------|
| Oct 2024 | Initial Render database provisioned |
| Nov 13, 2025 | GCP Cloud SQL provisioned |
| **Nov 14, 2025** | **Production migrated to GCP Cloud SQL** |
| Nov 14, 2025 | Old DATABASE_URL versions disabled (v11-v14) |
| Nov 21, 2025 (planned) | Render database decommissioned (7-day safety window) |

---

## What Was Migrated

✅ **All table schemas** (78 tables)
✅ **All production data** (hr_leads, targeted_companies, etc.)
✅ **All Sprint 21/22 schemas** (agent_core)
✅ **Connection string updated** (DATABASE_URL v15)
✅ **Cloud Run redeployed** (revision 00381-77v)

❌ **Historical agent_decisions NOT migrated** (163 rows - schema incompatible)
- Reason: Old format used TEXT instead of JSONB
- Impact: None - historical data not needed for production

---

## Actions Taken

### GCP Secret Manager
- ✅ DATABASE_URL v15 created (GCP Cloud SQL connection)
- ✅ DATABASE_URL v11-14 DISABLED (old Render connections)
- ✅ No rollback possible to Render versions

### Codebase
- ✅ `.env.example` updated to show GCP Cloud SQL example
- ✅ Documentation updated
- ✅ No hardcoded Render references in production code

### Scripts
- ⚠️ Test/migration scripts still reference Render (for historical verification only)
- Scripts affected:
  - `scripts/sprint22/verifyDataMigration.js` (comparison tool)
  - `scripts/sprint22/migrateRenderAgentData.js` (one-time migration)
  - `scripts/run_sprint19_migrations.js` (old test script)

---

## ⚠️ WARNING FOR FUTURE SPRINTS

### DO NOT:
- ❌ Create new Render databases
- ❌ Reference Render in new code
- ❌ Re-enable old DATABASE_URL versions (v11-v14)
- ❌ Use Render credentials in production
- ❌ Deploy code that connects to Render

### ALWAYS USE:
- ✅ GCP Cloud SQL (`upr-postgres` instance)
- ✅ Secret Manager for DATABASE_URL
- ✅ Cloud SQL Proxy for connections
- ✅ `upr_app` user (not `upr_postgres_user`)

---

## Decommission Plan (Nov 21, 2025)

After 7-day safety window:

1. **Verify no Render connections** in production logs
2. **Export final Render backup** (for archives)
3. **Delete Render database** via Render dashboard
4. **Remove Render credentials** from any local .env files
5. **Update CONTEXT.md** to mark Render as fully decommissioned
6. **Delete migration scripts** that reference Render

---

## Emergency Rollback (NOT RECOMMENDED)

If critical issue discovered with GCP Cloud SQL:

1. **DO NOT re-enable old DATABASE_URL versions** (they are disabled for security)
2. **Instead**:
   - Debug GCP Cloud SQL issue
   - Use Cloud SQL backups if needed
   - Contact GCP support

**Render rollback is NOT an option** - old versions are permanently disabled.

---

## Contact

For questions about this migration:
- See: `docs/SPRINT_22_DATABASE_MIGRATION_COMPLETE.md`
- See: `docs/SPRINT_22_DATABASE_FIX.md`
- Sprint: 22 (Rule Engine v2.0 + Shadow Mode)

---

**Status**: ✅ Migration Complete
**Production**: ✅ 100% on GCP Cloud SQL
**Render**: ❌ DEPRECATED - DO NOT USE
