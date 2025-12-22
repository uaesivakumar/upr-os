-- Migration: 033_parity_test_results.sql
-- Purpose: Wiring Parity Test infrastructure
-- Created: 2025-12-22
--
-- PRD v1.3: Parity Certification
-- Proves frontend discovery and Sales-Bench use IDENTICAL SIVA path
--
-- Tables:
-- - sales_bench_parity_results: Individual parity test results
-- - sales_bench_parity_certifications: Certification runs (batch of 5 tests)

-- ============================================================================
-- PARITY TEST RESULTS
-- Individual test runs comparing Path A (Frontend) vs Path B (Sales-Bench)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_bench_parity_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL UNIQUE,
    test_case VARCHAR(255) NOT NULL,
    parity VARCHAR(10) NOT NULL CHECK (parity IN ('PASS', 'FAIL')),

    -- Path A (Frontend Discovery) results
    path_a_outcome VARCHAR(50),
    path_a_trace JSONB,

    -- Path B (Sales-Bench) results
    path_b_outcome VARCHAR(50),
    path_b_trace JSONB,

    -- Comparison results
    diffs JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying by test case and result
CREATE INDEX IF NOT EXISTS idx_parity_results_test_case ON sales_bench_parity_results(test_case);
CREATE INDEX IF NOT EXISTS idx_parity_results_parity ON sales_bench_parity_results(parity);
CREATE INDEX IF NOT EXISTS idx_parity_results_created_at ON sales_bench_parity_results(created_at DESC);

-- ============================================================================
-- PARITY CERTIFICATIONS
-- Batch certification runs (5 fixed wiring cases)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_bench_parity_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id UUID NOT NULL UNIQUE,

    -- Results summary
    total_tests INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    certified BOOLEAN NOT NULL,

    -- Summary message
    summary TEXT,

    -- Full results JSON
    results JSONB,

    -- Report file path
    report_path VARCHAR(500),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying certifications
CREATE INDEX IF NOT EXISTS idx_parity_certifications_certified ON sales_bench_parity_certifications(certified);
CREATE INDEX IF NOT EXISTS idx_parity_certifications_created_at ON sales_bench_parity_certifications(created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE sales_bench_parity_results IS 'Individual parity test results - Path A vs Path B';
COMMENT ON TABLE sales_bench_parity_certifications IS 'Batch certification runs with 5 fixed wiring cases';
COMMENT ON COLUMN sales_bench_parity_results.parity IS 'PASS = identical, FAIL = mismatch detected';
COMMENT ON COLUMN sales_bench_parity_results.diffs IS 'Array of field differences if FAIL';
COMMENT ON COLUMN sales_bench_parity_certifications.certified IS 'true = all 5 tests passed';
