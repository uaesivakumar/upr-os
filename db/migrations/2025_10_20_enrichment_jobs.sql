-- Migration: Create enrichment_jobs table for tracking enrichment tasks
-- Date: 2025-10-20
-- Purpose: Track enrichment jobs triggered from hiring signals

CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES hiring_signals(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_id UUID REFERENCES entities_company(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'ERROR')),
  error TEXT,
  leads_found INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_tenant ON enrichment_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_signal ON enrichment_jobs(signal_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_created ON enrichment_jobs(created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION touch_enrichment_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_enrichment_jobs
  BEFORE UPDATE ON enrichment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION touch_enrichment_jobs_updated_at();

COMMENT ON TABLE enrichment_jobs IS 'Tracks enrichment tasks triggered from hiring signals';
COMMENT ON COLUMN enrichment_jobs.payload IS 'JSON payload containing sector, location, domain, etc.';
COMMENT ON COLUMN enrichment_jobs.leads_found IS 'Number of leads discovered during enrichment';
