-- Migration: Deduplication Support
-- Sprint 19, Task 2: Cross-Source Deduplication
-- Date: 2025-11-12
--
-- Purpose: Add columns to hiring_signals table for deduplication tracking

-- ============================================================================
-- Add deduplication columns to hiring_signals table
-- ============================================================================

-- Deduplication hash (MD5 of company + domain + trigger_type)
ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS dedupe_hash VARCHAR(16);

-- Reference to canonical signal (if this is a duplicate)
ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES hiring_signals(id) ON DELETE SET NULL;

-- Number of sources that discovered this signal
ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 1;

-- Whether this signal was validated by multiple sources
ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS multi_source_validated BOOLEAN DEFAULT false;

-- ============================================================================
-- Create index on dedupe_hash for fast lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hiring_signals_dedupe_hash
  ON hiring_signals(dedupe_hash);

CREATE INDEX IF NOT EXISTS idx_hiring_signals_duplicate_of
  ON hiring_signals(duplicate_of);

CREATE INDEX IF NOT EXISTS idx_hiring_signals_multi_source
  ON hiring_signals(multi_source_validated) WHERE multi_source_validated = true;

-- ============================================================================
-- Function: Generate deduplication hash
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_dedupe_hash(
  p_company TEXT,
  p_domain TEXT,
  p_trigger_type TEXT
) RETURNS VARCHAR(16) AS $$
DECLARE
  v_normalized_company TEXT;
  v_hash_input TEXT;
BEGIN
  -- Normalize company name (lowercase, remove punctuation, remove legal suffixes)
  v_normalized_company := LOWER(TRIM(p_company));
  v_normalized_company := REGEXP_REPLACE(v_normalized_company, '\s+', ' ', 'g'); -- Normalize whitespace
  v_normalized_company := REGEXP_REPLACE(v_normalized_company, '[.,/#!$%^&*;:{}=\-_`~()]', '', 'g'); -- Remove punctuation
  v_normalized_company := REGEXP_REPLACE(v_normalized_company, '\b(inc|llc|ltd|limited|corp|corporation|company|co)\b', '', 'g'); -- Remove suffixes
  v_normalized_company := TRIM(v_normalized_company);

  -- Create hash input
  v_hash_input := v_normalized_company || '|' || LOWER(TRIM(COALESCE(p_domain, ''))) || '|' || LOWER(TRIM(COALESCE(p_trigger_type, '')));

  -- Return first 16 chars of MD5 hash
  RETURN SUBSTRING(MD5(v_hash_input), 1, 16);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_dedupe_hash IS 'Generates consistent deduplication hash for signal matching';

-- ============================================================================
-- Backfill dedupe_hash for existing signals
-- ============================================================================

UPDATE hiring_signals
SET dedupe_hash = generate_dedupe_hash(company, domain, trigger_type)
WHERE dedupe_hash IS NULL;

-- ============================================================================
-- Trigger: Auto-generate dedupe_hash on INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_generate_dedupe_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dedupe_hash IS NULL OR
     OLD.company IS DISTINCT FROM NEW.company OR
     OLD.domain IS DISTINCT FROM NEW.domain OR
     OLD.trigger_type IS DISTINCT FROM NEW.trigger_type THEN
    NEW.dedupe_hash := generate_dedupe_hash(NEW.company, NEW.domain, NEW.trigger_type);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hiring_signals_dedupe_hash ON hiring_signals;

CREATE TRIGGER trg_hiring_signals_dedupe_hash
  BEFORE INSERT OR UPDATE ON hiring_signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_dedupe_hash();

COMMENT ON TRIGGER trg_hiring_signals_dedupe_hash ON hiring_signals IS 'Auto-generates deduplication hash on insert/update';

-- ============================================================================
-- View: Duplicate signals analysis
-- ============================================================================

CREATE OR REPLACE VIEW duplicate_signals_analysis AS
SELECT
  id,
  company,
  domain,
  trigger_type,
  dedupe_hash,
  duplicate_of,
  source_count,
  multi_source_validated,
  confidence_score,
  source_type,
  created_at
FROM hiring_signals
WHERE duplicate_of IS NOT NULL
ORDER BY created_at DESC;

COMMENT ON VIEW duplicate_signals_analysis IS 'Shows all signals that were marked as duplicates';

-- ============================================================================
-- View: Multi-source validated signals
-- ============================================================================

CREATE OR REPLACE VIEW multi_source_signals AS
SELECT
  hs.id,
  hs.company,
  hs.domain,
  hs.trigger_type,
  hs.description,
  hs.source_count,
  hs.confidence_score,
  hs.source_type,
  hs.created_at,
  COUNT(dups.id) as duplicate_count
FROM hiring_signals hs
LEFT JOIN hiring_signals dups ON dups.duplicate_of = hs.id
WHERE hs.multi_source_validated = true
  AND hs.duplicate_of IS NULL  -- Only canonical signals
GROUP BY hs.id
ORDER BY hs.source_count DESC, hs.confidence_score DESC;

COMMENT ON VIEW multi_source_signals IS 'Signals validated by multiple sources (high confidence)';

-- ============================================================================
-- Function: Get duplicate chain
-- ============================================================================

CREATE OR REPLACE FUNCTION get_duplicate_chain(p_signal_id UUID)
RETURNS TABLE (
  signal_id UUID,
  company TEXT,
  source_type TEXT,
  confidence_score DECIMAL(3,2),
  is_canonical BOOLEAN,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE chain AS (
    -- Start with the given signal
    SELECT
      id,
      company,
      source_type,
      confidence_score,
      duplicate_of,
      CASE WHEN duplicate_of IS NULL THEN true ELSE false END as is_canonical,
      created_at,
      0 as level
    FROM hiring_signals
    WHERE id = p_signal_id

    UNION ALL

    -- Follow the duplicate_of chain up
    SELECT
      hs.id,
      hs.company,
      hs.source_type,
      hs.confidence_score,
      hs.duplicate_of,
      CASE WHEN hs.duplicate_of IS NULL THEN true ELSE false END as is_canonical,
      hs.created_at,
      c.level + 1
    FROM hiring_signals hs
    INNER JOIN chain c ON hs.id = c.duplicate_of
  )
  SELECT
    c.id,
    c.company,
    c.source_type,
    c.confidence_score,
    c.is_canonical,
    c.created_at
  FROM chain c
  ORDER BY c.level DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_duplicate_chain IS 'Returns the full duplicate chain for a signal (follows duplicate_of links to canonical signal)';

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN hiring_signals.dedupe_hash IS 'Deduplication hash (MD5 of normalized company + domain + trigger_type, first 16 chars)';
COMMENT ON COLUMN hiring_signals.duplicate_of IS 'Reference to canonical signal if this is a duplicate';
COMMENT ON COLUMN hiring_signals.source_count IS 'Number of sources that discovered this signal';
COMMENT ON COLUMN hiring_signals.multi_source_validated IS 'True if signal was validated by 2+ sources (confidence boost applied)';

-- ============================================================================
-- Statistics
-- ============================================================================

-- Update table statistics for query optimization
ANALYZE hiring_signals;

-- Show deduplication statistics
SELECT
  'Total signals' as metric,
  COUNT(*) as value
FROM hiring_signals

UNION ALL

SELECT
  'Signals with dedupe_hash' as metric,
  COUNT(*) as value
FROM hiring_signals
WHERE dedupe_hash IS NOT NULL

UNION ALL

SELECT
  'Duplicate signals' as metric,
  COUNT(*) as value
FROM hiring_signals
WHERE duplicate_of IS NOT NULL

UNION ALL

SELECT
  'Multi-source validated' as metric,
  COUNT(*) as value
FROM hiring_signals
WHERE multi_source_validated = true

UNION ALL

SELECT
  'Unique dedupe hashes' as metric,
  COUNT(DISTINCT dedupe_hash) as value
FROM hiring_signals
WHERE dedupe_hash IS NOT NULL;
