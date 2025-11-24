-- scripts/20250927_add_company_details.sql

-- Add new columns to store valuable enriched data about companies.
ALTER TABLE targeted_companies
ADD COLUMN industry VARCHAR(255),
ADD COLUMN size_range VARCHAR(50);

COMMENT ON COLUMN targeted_companies.industry IS 'The industry of the company (e.g., Software, Finance).';
COMMENT ON COLUMN targeted_companies.size_range IS 'The estimated employee count range (e.g., 1,001-5,000 employees).';