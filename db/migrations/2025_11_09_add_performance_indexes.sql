-- Sprint 17 Priority 1: Database Indexing for Performance
-- Date: 2025-11-09
-- Estimated Impact: 2-5x query performance improvement
-- Note: Some indexes already exist, this adds missing performance-critical ones

-- ============================================================
-- HIRING SIGNALS TABLE INDEXES
-- ============================================================

-- Index on company name (MISSING - needed for search queries)
-- Existing indexes: ix_hs_tenant, ix_hs_trigger, ix_hs_detected_at, ix_hs_score, etc.
CREATE INDEX IF NOT EXISTS idx_hiring_signals_company
ON hiring_signals(company);

-- Composite index for company + created_at (MISSING - common query pattern)
CREATE INDEX IF NOT EXISTS idx_hiring_signals_company_created
ON hiring_signals(company, created_at DESC);

-- Index on domain for faster domain-based lookups
CREATE INDEX IF NOT EXISTS idx_hiring_signals_domain
ON hiring_signals(domain);

-- ============================================================
-- HR LEADS TABLE INDEXES
-- ============================================================
-- Note: Already has idx_hr_company, idx_hr_leads_company, idx_hr_status
-- Adding additional performance indexes

-- Composite index for tenant + lead_status (common filter combination)
CREATE INDEX IF NOT EXISTS idx_hr_leads_tenant_status
ON hr_leads(tenant_id, lead_status);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_hr_leads_created_at
ON hr_leads(created_at DESC);

-- Index on email_status for verification filtering
CREATE INDEX IF NOT EXISTS idx_hr_leads_email_status
ON hr_leads(email_status);

-- ============================================================
-- ANALYSIS AND VERIFICATION
-- ============================================================

-- Show index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('hiring_signals', 'hr_leads')
ORDER BY tablename, indexname;

-- Show table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS total_size,
    pg_size_pretty(pg_relation_size(tablename::regclass)) AS table_size,
    pg_size_pretty(pg_indexes_size(tablename::regclass)) AS indexes_size
FROM pg_tables
WHERE tablename IN ('hiring_signals', 'hr_leads');
