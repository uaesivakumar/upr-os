-- scripts/20250927_add_unique_domain_constraint.sql

-- Add a UNIQUE constraint to the 'domain' column in the targeted_companies table.
-- This is required for the "INSERT ... ON CONFLICT (domain)" command to work correctly.
ALTER TABLE targeted_companies
ADD CONSTRAINT targeted_companies_domain_key UNIQUE (domain);