-- scripts/20250927_add_unique_linkedin_constraint.sql

-- Add a UNIQUE constraint to the 'linkedin_url' column in the hr_leads table.
-- This is required for the "INSERT ... ON CONFLICT (linkedin_url)" command to work.
-- NOTE: This will fail if you have duplicate NULLs or duplicate URLs already in the table.
-- We will create a partial index to allow multiple NULLs but enforce uniqueness for actual URLs.

CREATE UNIQUE INDEX hr_leads_unique_linkedin_url_idx ON hr_leads (linkedin_url) WHERE linkedin_url IS NOT NULL;