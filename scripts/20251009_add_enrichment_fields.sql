-- scripts/20251009_add_enrichment_fields.sql
-- Adds email_status and enrichment metadata columns to the hr_leads table.

-- Add email_status to track the validation state of the lead's email
ALTER TABLE hr_leads
ADD COLUMN IF NOT EXISTS email_status VARCHAR(50) DEFAULT 'unknown';

-- Add a JSONB column to store raw data from enrichment providers for auditing
ALTER TABLE hr_leads
ADD COLUMN IF NOT EXISTS enrich_meta JSONB;

COMMENT ON COLUMN hr_leads.email_status IS 'Tracks the validation source and state of the email (e.g., unknown, validated_user, verified_bounced)';
COMMENT ON COLUMN hr_leads.enrich_meta IS 'Stores raw JSON response from enrichment APIs for auditing and debugging purposes.';