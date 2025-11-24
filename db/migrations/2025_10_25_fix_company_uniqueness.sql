BEGIN;

-- Add generated column for normalized name
ALTER TABLE targeted_companies
  ADD COLUMN IF NOT EXISTS name_normalized TEXT
  GENERATED ALWAYS AS (lower(trim(name))) STORED;

-- Create unique index on the generated column
CREATE UNIQUE INDEX IF NOT EXISTS ux_targeted_companies_tenant_name
ON targeted_companies (tenant_id, name_normalized);

-- Verify constraint works
SELECT
  'Checking for duplicates...' as status;

SELECT
  tenant_id,
  name_normalized,
  COUNT(*) as count,
  STRING_AGG(name, ' | ' ORDER BY name) as variations
FROM targeted_companies
GROUP BY tenant_id, name_normalized
HAVING COUNT(*) > 1;

-- If above returns rows, we have duplicates that need manual merge

COMMENT ON COLUMN targeted_companies.name_normalized IS 'Normalized name (lowercase, trimmed) for uniqueness';

COMMIT;
