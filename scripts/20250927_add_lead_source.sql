-- scripts/20250927_add_lead_source.sql

ALTER TABLE hr_leads
ADD COLUMN lead_source VARCHAR(50);

COMMENT ON COLUMN hr_leads.lead_source IS 'The original source of the lead (e.g., database, apollo, ai).';