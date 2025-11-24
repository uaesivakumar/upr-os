-- Migration: Add is_favorite and is_irrelevant columns to hr_leads
-- Date: 2025-10-25
-- Purpose: Support micro-actions for lead curation (Phase 1)

BEGIN;

-- Add boolean flags for favorite and irrelevant status
ALTER TABLE hr_leads
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_irrelevant BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shortlisted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS marked_irrelevant_at TIMESTAMPTZ;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_hr_leads_is_favorite ON hr_leads(is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX IF NOT EXISTS idx_hr_leads_is_irrelevant ON hr_leads(is_irrelevant) WHERE is_irrelevant = TRUE;

-- Index for outreach query (favorites first, exclude irrelevant)
CREATE INDEX IF NOT EXISTS idx_hr_leads_outreach_selection
    ON hr_leads(company_id, is_favorite DESC, confidence DESC)
    WHERE is_irrelevant = FALSE;

COMMIT;
