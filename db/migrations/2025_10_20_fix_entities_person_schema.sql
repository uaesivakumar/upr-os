-- Migration: Add missing columns to entities_person for enrichment
-- Date: 2025-10-20
-- Purpose: Fix schema mismatch causing lead insertions to fail

-- Add missing columns
ALTER TABLE entities_person
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS function TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_entities_person_email ON entities_person(email);

-- Add index for confidence sorting
CREATE INDEX IF NOT EXISTS idx_entities_person_confidence ON entities_person(confidence DESC);

-- Add index for function filtering
CREATE INDEX IF NOT EXISTS idx_entities_person_function ON entities_person(function);

COMMENT ON COLUMN entities_person.email IS 'Contact email address';
COMMENT ON COLUMN entities_person.confidence IS 'Confidence score (0.00-1.00) for lead quality';
COMMENT ON COLUMN entities_person.function IS 'Job function (e.g., HR, Engineering, Sales)';
COMMENT ON COLUMN entities_person.source_url IS 'Source URL for lead (e.g., LinkedIn profile, Apollo.io)';
