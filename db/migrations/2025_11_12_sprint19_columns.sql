-- Migration: Sprint 19 Required Columns
-- Add all columns needed for Sprint 19 features
-- Date: 2025-11-12
--
-- Purpose: Add quality scoring, confidence, and source tracking columns to hiring_signals

-- ============================================================================
-- Add confidence_score column (from 2025_11_10_add_signal_confidence.sql)
-- ============================================================================

ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);

COMMENT ON COLUMN hiring_signals.confidence_score IS 'Confidence score for signal quality (0.00 to 1.00)';

-- ============================================================================
-- Add source_type column
-- ============================================================================

ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'UNKNOWN';

COMMENT ON COLUMN hiring_signals.source_type IS 'Source of the signal (e.g., NEWS, SOCIAL_MEDIA, JOB_LISTING, etc.)';

-- ============================================================================
-- Add quality scoring columns
-- ============================================================================

ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2);

ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS quality_tier TEXT;

ALTER TABLE hiring_signals
ADD COLUMN IF NOT EXISTS quality_breakdown JSONB;

COMMENT ON COLUMN hiring_signals.quality_score IS 'Overall quality score (0.00 to 1.00)';
COMMENT ON COLUMN hiring_signals.quality_tier IS 'Quality tier: HIGH, MEDIUM, or LOW';
COMMENT ON COLUMN hiring_signals.quality_breakdown IS 'JSON breakdown of quality factors (confidence, reliability, freshness, completeness)';

-- ============================================================================
-- Add indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hiring_signals_confidence_score
  ON hiring_signals(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_hiring_signals_quality_score
  ON hiring_signals(quality_score DESC);

CREATE INDEX IF NOT EXISTS idx_hiring_signals_quality_tier
  ON hiring_signals(quality_tier);

CREATE INDEX IF NOT EXISTS idx_hiring_signals_source_type
  ON hiring_signals(source_type);

-- ============================================================================
-- Update statistics
-- ============================================================================

ANALYZE hiring_signals;

-- Show current state
SELECT
  'Total signals' as metric,
  COUNT(*) as value
FROM hiring_signals

UNION ALL

SELECT
  'Signals with confidence_score' as metric,
  COUNT(*) as value
FROM hiring_signals
WHERE confidence_score IS NOT NULL

UNION ALL

SELECT
  'Signals with quality_score' as metric,
  COUNT(*) as value
FROM hiring_signals
WHERE quality_score IS NOT NULL;
