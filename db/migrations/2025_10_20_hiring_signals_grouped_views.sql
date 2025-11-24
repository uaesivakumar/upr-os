-- Migration: Create grouped views for hiring signals
-- Date: 2025-10-20
-- Updated: 2025-10-20 - Add single-tier assignment (companies appear in ONLY highest-priority tier)
-- Purpose: Group multiple signals per company to eliminate duplicates in UI

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_hiring_hot_grouped CASCADE;
DROP VIEW IF EXISTS v_hiring_review_grouped CASCADE;
DROP VIEW IF EXISTS v_hiring_background_grouped CASCADE;
DROP VIEW IF EXISTS v_hiring_all_grouped CASCADE;

-- Create unified grouped view with tier assignment
-- Each company is assigned to the HIGHEST priority tier based on ANY of its signals
-- Tier priority: hot > review > background
CREATE OR REPLACE VIEW v_hiring_all_grouped AS
SELECT
  -- Use company name as unique identifier (normalized)
  LOWER(TRIM(hs.company)) as company_key,

  -- Use the most common variation of the company name
  (array_agg(hs.company ORDER BY hs.created_at DESC))[1] as company,

  -- Get company_id from entities_company (if exists)
  (
    SELECT ec.id
    FROM entities_company ec
    WHERE LOWER(TRIM(ec.legal_name)) = LOWER(TRIM((array_agg(hs.company ORDER BY hs.created_at DESC))[1]))
    AND ec.tenant_id = hs.tenant_id
    LIMIT 1
  ) as company_id,

  -- Take domain/sector/location from most recent signal
  (array_agg(hs.domain ORDER BY hs.created_at DESC))[1] as domain,
  (array_agg(hs.sector ORDER BY hs.created_at DESC))[1] as sector,
  (array_agg(hs.location ORDER BY hs.created_at DESC))[1] as location,
  (array_agg(hs.geo_status ORDER BY hs.created_at DESC))[1] as geo_status,

  -- Aggregate all signals for this company
  COUNT(hs.id) as signal_count,

  -- Collect all trigger types (unique, sorted)
  array_agg(DISTINCT hs.trigger_type ORDER BY hs.trigger_type) FILTER (WHERE hs.trigger_type IS NOT NULL) as triggers,

  -- Composite score (sum of all signal scores)
  COALESCE(SUM(hs.hiring_likelihood_score), 0) as composite_score,

  -- Use the highest individual score for reference
  MAX(hs.hiring_likelihood_score) as max_score,

  -- Use the most recent signal's detailed data
  (array_agg(hs.description ORDER BY hs.created_at DESC))[1] as description,
  (array_agg(hs.evidence_quote ORDER BY hs.created_at DESC))[1] as evidence_quote,
  (array_agg(hs.source_url ORDER BY hs.created_at DESC))[1] as source_url,
  (array_agg(hs.role_cluster ORDER BY hs.created_at DESC))[1] as role_cluster,
  (array_agg(hs.source_date ORDER BY hs.source_date DESC NULLS LAST))[1] as source_date,

  -- Collect all signal IDs (for enrichment reference)
  array_agg(hs.id ORDER BY hs.created_at DESC) as signal_ids,

  -- Timestamp of most recent signal
  MAX(hs.created_at) as latest_signal_at,
  MAX(hs.detected_at) as latest_detected_at,

  -- TIER ASSIGNMENT: Assign to HIGHEST priority tier based on ANY signal
  -- Priority: hot > review > background
  CASE
    -- Hot tier: ANY signal with (confirmed geo + score >= 4) OR (key triggers + recent)
    WHEN COUNT(*) FILTER (
      WHERE (hs.geo_status = 'confirmed' AND hs.hiring_likelihood_score >= 4)
      OR (
        hs.trigger_type IN ('Hiring Drive', 'Project Award', 'Expansion')
        AND (hs.source_date IS NULL OR hs.source_date >= CURRENT_DATE - INTERVAL '30 days')
      )
    ) > 0 THEN 'hot'

    -- Background tier: ANY signal with (ambiguous geo + score < 3)
    WHEN COUNT(*) FILTER (
      WHERE hs.geo_status = 'ambiguous' AND hs.hiring_likelihood_score < 3
    ) = COUNT(*) THEN 'background'  -- ALL signals are background

    -- Review tier: everything else (middle ground)
    ELSE 'review'
  END as assigned_tier,

  -- Tenant ID (should be same for all signals)
  hs.tenant_id

FROM hiring_signals hs

WHERE hs.review_status = 'pending'

GROUP BY LOWER(TRIM(hs.company)), hs.tenant_id

ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC;

-- Create tier-specific views that filter from the unified view
-- Each company appears in ONLY ONE tier (the highest priority one)

CREATE OR REPLACE VIEW v_hiring_hot_grouped AS
SELECT
  company_key,
  company,
  company_id,
  domain,
  sector,
  location,
  geo_status,
  signal_count,
  triggers,
  composite_score,
  max_score,
  description,
  evidence_quote,
  source_url,
  role_cluster,
  source_date,
  signal_ids,
  latest_signal_at,
  latest_detected_at,
  tenant_id
FROM v_hiring_all_grouped
WHERE assigned_tier = 'hot'
ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC;

CREATE OR REPLACE VIEW v_hiring_review_grouped AS
SELECT
  company_key,
  company,
  company_id,
  domain,
  sector,
  location,
  geo_status,
  signal_count,
  triggers,
  composite_score,
  max_score,
  description,
  evidence_quote,
  source_url,
  role_cluster,
  source_date,
  signal_ids,
  latest_signal_at,
  latest_detected_at,
  tenant_id
FROM v_hiring_all_grouped
WHERE assigned_tier = 'review'
ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC;

CREATE OR REPLACE VIEW v_hiring_background_grouped AS
SELECT
  company_key,
  company,
  company_id,
  domain,
  sector,
  location,
  geo_status,
  signal_count,
  triggers,
  composite_score,
  max_score,
  description,
  evidence_quote,
  source_url,
  role_cluster,
  source_date,
  signal_ids,
  latest_signal_at,
  latest_detected_at,
  tenant_id
FROM v_hiring_all_grouped
WHERE assigned_tier = 'background'
ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC;

COMMENT ON VIEW v_hiring_all_grouped IS 'Grouped view of all hiring signals by company with tier assignment';
COMMENT ON VIEW v_hiring_hot_grouped IS 'Companies assigned to HOT tier (highest priority)';
COMMENT ON VIEW v_hiring_review_grouped IS 'Companies assigned to REVIEW tier (medium priority)';
COMMENT ON VIEW v_hiring_background_grouped IS 'Companies assigned to BACKGROUND tier (lowest priority)';
