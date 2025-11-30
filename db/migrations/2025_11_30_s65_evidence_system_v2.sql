-- ============================================================================
-- Sprint 65: Evidence System v2
-- UPR OS - Intelligence Engine
-- ============================================================================
--
-- Evidence System provides centralized aggregation, scoring, and reasoning
-- about evidence from multiple providers and signals.
--
-- ARCHITECTURAL RULES:
-- 1. NO tenant awareness - context passed via API params
-- 2. All scoring driven by provider/vertical config via ConfigLoader
-- 3. Deterministic: same config + input = same output
-- ============================================================================

-- ============================================================================
-- EVIDENCE ITEMS TABLE
-- Core evidence data from various providers
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to object (from S64 object_nodes)
  object_id UUID NOT NULL,  -- References object_nodes.id

  -- Source information
  source_provider VARCHAR(100) NOT NULL,  -- clearbit, apollo, zoominfo, linkedin, etc.
  evidence_type VARCHAR(100) NOT NULL,    -- firmographic, contact, social, financial, etc.

  -- Evidence payload
  payload JSONB NOT NULL DEFAULT '{}',

  -- Confidence metrics
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,  -- 0-1 confidence score
  raw_confidence NUMERIC(5,4),                    -- Original provider confidence

  -- Context
  vertical_slug VARCHAR(50),
  territory_id VARCHAR(100),

  -- Metadata
  is_verified BOOLEAN DEFAULT false,
  verification_source VARCHAR(100),

  -- Timestamps
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When evidence was collected
  source_timestamp TIMESTAMPTZ,                      -- Original timestamp from provider
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT evidence_items_confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_evidence_items_object ON evidence_items(object_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_provider ON evidence_items(source_provider);
CREATE INDEX IF NOT EXISTS idx_evidence_items_type ON evidence_items(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_collected ON evidence_items(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_items_confidence ON evidence_items(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_items_object_provider ON evidence_items(object_id, source_provider);
CREATE INDEX IF NOT EXISTS idx_evidence_items_object_type ON evidence_items(object_id, evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_payload ON evidence_items USING GIN(payload);
CREATE INDEX IF NOT EXISTS idx_evidence_items_vertical ON evidence_items(vertical_slug) WHERE vertical_slug IS NOT NULL;

-- ============================================================================
-- EVIDENCE LINKS TABLE
-- Relationships between evidence and other objects
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Evidence reference
  evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,

  -- Related object (could be different from evidence.object_id)
  related_object_id UUID NOT NULL,  -- References object_nodes.id

  -- Relationship type
  relation_type VARCHAR(100) NOT NULL,  -- supports, contradicts, mentions, derived_from

  -- Link strength
  strength NUMERIC(5,4) DEFAULT 1.0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT evidence_links_unique UNIQUE (evidence_id, related_object_id, relation_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_links_evidence ON evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_related ON evidence_links(related_object_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_type ON evidence_links(relation_type);

-- ============================================================================
-- EVIDENCE FRESHNESS TABLE
-- Track evidence age and decay
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One-to-one with evidence_items
  evidence_id UUID NOT NULL UNIQUE REFERENCES evidence_items(id) ON DELETE CASCADE,

  -- Freshness tracking
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_count INTEGER NOT NULL DEFAULT 1,

  -- Decay calculation
  decay_score NUMERIC(5,4) NOT NULL DEFAULT 1.0,  -- 1.0 = fresh, 0.0 = stale
  decay_rate NUMERIC(10,8) DEFAULT 0.001,          -- Per-day decay rate
  half_life_days INTEGER DEFAULT 90,              -- Days until half decay

  -- Status
  is_stale BOOLEAN DEFAULT false,
  stale_threshold NUMERIC(5,4) DEFAULT 0.3,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT evidence_freshness_decay_range CHECK (decay_score >= 0 AND decay_score <= 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_freshness_evidence ON evidence_freshness(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_freshness_decay ON evidence_freshness(decay_score);
CREATE INDEX IF NOT EXISTS idx_evidence_freshness_stale ON evidence_freshness(is_stale) WHERE is_stale = true;
CREATE INDEX IF NOT EXISTS idx_evidence_freshness_last_seen ON evidence_freshness(last_seen_at DESC);

-- ============================================================================
-- EVIDENCE PROVENANCE TABLE
-- Raw source data and fetch metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One-to-one with evidence_items
  evidence_id UUID NOT NULL UNIQUE REFERENCES evidence_items(id) ON DELETE CASCADE,

  -- Raw source data (as received from provider)
  raw_source JSONB NOT NULL DEFAULT '{}',

  -- Fetch/request metadata
  fetch_metadata JSONB NOT NULL DEFAULT '{}',
  -- Contains: { requestId, endpoint, responseCode, latencyMs, apiVersion, etc. }

  -- Transformation metadata
  transformation_log JSONB DEFAULT '[]',
  -- Array of: { step, transformType, fieldsAffected, timestamp }

  -- Quality metadata
  quality_flags JSONB DEFAULT '{}',
  -- Contains: { hasWarnings, warningCount, issues: [] }

  -- Source URL/reference
  source_url TEXT,
  source_reference VARCHAR(255),

  -- Timestamps
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_evidence ON evidence_provenance(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_fetched ON evidence_provenance(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_raw ON evidence_provenance USING GIN(raw_source);

-- ============================================================================
-- PROVIDER WEIGHTS TABLE
-- Configurable weights for different providers per vertical
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identification
  provider_slug VARCHAR(100) NOT NULL,
  evidence_type VARCHAR(100),  -- NULL means applies to all types

  -- Context
  vertical_slug VARCHAR(50),   -- NULL means global default

  -- Weights and scores
  base_weight NUMERIC(5,4) NOT NULL DEFAULT 1.0,      -- Base provider weight
  reliability_score NUMERIC(5,4) DEFAULT 0.8,         -- Historical reliability
  freshness_weight NUMERIC(5,4) DEFAULT 1.0,          -- How much freshness matters
  coverage_score NUMERIC(5,4) DEFAULT 0.7,            -- Data coverage quality

  -- Adjustments
  recency_bonus NUMERIC(5,4) DEFAULT 0.1,             -- Bonus for recent data
  verification_bonus NUMERIC(5,4) DEFAULT 0.2,        -- Bonus for verified data

  -- Configuration
  config JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT provider_weights_unique UNIQUE (provider_slug, evidence_type, vertical_slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_weights_provider ON provider_weights(provider_slug);
CREATE INDEX IF NOT EXISTS idx_provider_weights_vertical ON provider_weights(vertical_slug) WHERE vertical_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_weights_active ON provider_weights(is_active) WHERE is_active = true;

-- ============================================================================
-- EVIDENCE AGGREGATIONS TABLE
-- Pre-computed aggregations for performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_aggregations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object this aggregation is for
  object_id UUID NOT NULL,

  -- Aggregation type
  aggregation_type VARCHAR(50) NOT NULL,  -- by_provider, by_type, overall

  -- Aggregation key (e.g., provider name or evidence type)
  aggregation_key VARCHAR(100),

  -- Aggregated metrics
  evidence_count INTEGER NOT NULL DEFAULT 0,
  total_confidence NUMERIC(10,4) DEFAULT 0,
  avg_confidence NUMERIC(5,4) DEFAULT 0,
  weighted_score NUMERIC(5,4) DEFAULT 0,
  freshness_weighted_score NUMERIC(5,4) DEFAULT 0,

  -- Breakdown
  breakdown JSONB DEFAULT '{}',

  -- Last computation
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computation_version INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT evidence_aggregations_unique UNIQUE (object_id, aggregation_type, aggregation_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_aggregations_object ON evidence_aggregations(object_id);
CREATE INDEX IF NOT EXISTS idx_evidence_aggregations_type ON evidence_aggregations(aggregation_type);
CREATE INDEX IF NOT EXISTS idx_evidence_aggregations_computed ON evidence_aggregations(computed_at DESC);

-- ============================================================================
-- EVIDENCE CONFLICTS TABLE
-- Track conflicting evidence
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object with conflicting evidence
  object_id UUID NOT NULL,

  -- Conflicting evidence items
  evidence_id_a UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  evidence_id_b UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,

  -- Conflict details
  conflict_field VARCHAR(255) NOT NULL,  -- Which field has conflict
  value_a JSONB,
  value_b JSONB,

  -- Resolution
  resolution_status VARCHAR(50) DEFAULT 'unresolved',  -- unresolved, resolved, ignored
  resolved_value JSONB,
  resolution_method VARCHAR(100),  -- manual, confidence_based, recency_based, etc.
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),

  -- Timestamps
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT evidence_conflicts_unique UNIQUE (evidence_id_a, evidence_id_b, conflict_field),
  CONSTRAINT evidence_conflicts_ordering CHECK (evidence_id_a < evidence_id_b)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_conflicts_object ON evidence_conflicts(object_id);
CREATE INDEX IF NOT EXISTS idx_evidence_conflicts_status ON evidence_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_evidence_conflicts_evidence_a ON evidence_conflicts(evidence_id_a);
CREATE INDEX IF NOT EXISTS idx_evidence_conflicts_evidence_b ON evidence_conflicts(evidence_id_b);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Summary view of evidence by object
CREATE OR REPLACE VIEW v_evidence_summary_by_object AS
SELECT
  e.object_id,
  COUNT(*) AS total_evidence,
  COUNT(DISTINCT e.source_provider) AS provider_count,
  COUNT(DISTINCT e.evidence_type) AS type_count,
  AVG(e.confidence) AS avg_confidence,
  MAX(e.confidence) AS max_confidence,
  MIN(e.confidence) AS min_confidence,
  AVG(COALESCE(f.decay_score, 1.0)) AS avg_freshness,
  SUM(CASE WHEN e.is_verified THEN 1 ELSE 0 END) AS verified_count,
  SUM(CASE WHEN COALESCE(f.is_stale, false) THEN 1 ELSE 0 END) AS stale_count,
  ARRAY_AGG(DISTINCT e.source_provider) AS providers,
  ARRAY_AGG(DISTINCT e.evidence_type) AS evidence_types,
  MAX(e.collected_at) AS latest_evidence_at,
  MIN(e.collected_at) AS earliest_evidence_at
FROM evidence_items e
LEFT JOIN evidence_freshness f ON e.id = f.evidence_id
GROUP BY e.object_id;

-- Source quality view
CREATE OR REPLACE VIEW v_evidence_source_quality AS
SELECT
  e.source_provider,
  e.evidence_type,
  e.vertical_slug,
  COUNT(*) AS evidence_count,
  AVG(e.confidence) AS avg_confidence,
  AVG(COALESCE(f.decay_score, 1.0)) AS avg_freshness,
  SUM(CASE WHEN e.is_verified THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) AS verification_rate,
  COALESCE(pw.base_weight, 1.0) AS provider_weight,
  COALESCE(pw.reliability_score, 0.8) AS reliability_score
FROM evidence_items e
LEFT JOIN evidence_freshness f ON e.id = f.evidence_id
LEFT JOIN provider_weights pw ON
  pw.provider_slug = e.source_provider
  AND (pw.evidence_type IS NULL OR pw.evidence_type = e.evidence_type)
  AND (pw.vertical_slug IS NULL OR pw.vertical_slug = e.vertical_slug)
  AND pw.is_active = true
GROUP BY e.source_provider, e.evidence_type, e.vertical_slug, pw.base_weight, pw.reliability_score;

-- Evidence with freshness view
CREATE OR REPLACE VIEW v_evidence_with_freshness AS
SELECT
  e.*,
  COALESCE(f.decay_score, 1.0) AS freshness_score,
  COALESCE(f.is_stale, false) AS is_stale,
  f.first_seen_at,
  f.last_seen_at,
  f.update_count,
  e.confidence * COALESCE(f.decay_score, 1.0) AS effective_confidence
FROM evidence_items e
LEFT JOIN evidence_freshness f ON e.id = f.evidence_id;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate decay score based on age
CREATE OR REPLACE FUNCTION calculate_decay_score(
  p_last_seen_at TIMESTAMPTZ,
  p_half_life_days INTEGER DEFAULT 90
) RETURNS NUMERIC AS $$
DECLARE
  v_age_days NUMERIC;
  v_decay_score NUMERIC;
BEGIN
  v_age_days := EXTRACT(EPOCH FROM (NOW() - p_last_seen_at)) / 86400.0;
  -- Exponential decay: score = 0.5 ^ (age / half_life)
  v_decay_score := POWER(0.5, v_age_days / p_half_life_days);
  RETURN GREATEST(0.0, LEAST(1.0, v_decay_score));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update freshness for all evidence of an object
CREATE OR REPLACE FUNCTION refresh_object_evidence_freshness(
  p_object_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE evidence_freshness f
  SET
    decay_score = calculate_decay_score(f.last_seen_at, f.half_life_days),
    is_stale = calculate_decay_score(f.last_seen_at, f.half_life_days) < f.stale_threshold,
    last_updated_at = NOW()
  FROM evidence_items e
  WHERE f.evidence_id = e.id
    AND e.object_id = p_object_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- Function to compute weighted evidence score for an object
CREATE OR REPLACE FUNCTION compute_evidence_score(
  p_object_id UUID,
  p_vertical_slug VARCHAR DEFAULT NULL
) RETURNS TABLE (
  total_score NUMERIC,
  provider_breakdown JSONB,
  type_breakdown JSONB,
  freshness_factor NUMERIC,
  evidence_count INTEGER
) AS $$
DECLARE
  v_total_score NUMERIC := 0;
  v_freshness_factor NUMERIC := 1.0;
  v_count INTEGER := 0;
  v_provider_breakdown JSONB := '{}';
  v_type_breakdown JSONB := '{}';
BEGIN
  -- Calculate provider breakdown
  SELECT
    jsonb_object_agg(
      source_provider,
      jsonb_build_object(
        'count', cnt,
        'avgConfidence', avg_conf,
        'weight', weight,
        'weightedScore', avg_conf * weight * freshness
      )
    ),
    SUM(avg_conf * weight * freshness * cnt),
    SUM(cnt),
    AVG(freshness)
  INTO v_provider_breakdown, v_total_score, v_count, v_freshness_factor
  FROM (
    SELECT
      e.source_provider,
      COUNT(*) AS cnt,
      AVG(e.confidence) AS avg_conf,
      COALESCE(pw.base_weight, 1.0) AS weight,
      AVG(COALESCE(f.decay_score, 1.0)) AS freshness
    FROM evidence_items e
    LEFT JOIN evidence_freshness f ON e.id = f.evidence_id
    LEFT JOIN provider_weights pw ON
      pw.provider_slug = e.source_provider
      AND pw.is_active = true
      AND (pw.vertical_slug IS NULL OR pw.vertical_slug = COALESCE(p_vertical_slug, e.vertical_slug))
    WHERE e.object_id = p_object_id
    GROUP BY e.source_provider, pw.base_weight
  ) subq;

  -- Calculate type breakdown
  SELECT jsonb_object_agg(
    evidence_type,
    jsonb_build_object('count', cnt, 'avgConfidence', avg_conf)
  )
  INTO v_type_breakdown
  FROM (
    SELECT evidence_type, COUNT(*) AS cnt, AVG(confidence) AS avg_conf
    FROM evidence_items
    WHERE object_id = p_object_id
    GROUP BY evidence_type
  ) subq;

  -- Normalize score
  IF v_count > 0 THEN
    v_total_score := v_total_score / v_count;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_total_score, 0)::NUMERIC,
    COALESCE(v_provider_breakdown, '{}'::jsonb),
    COALESCE(v_type_breakdown, '{}'::jsonb),
    COALESCE(v_freshness_factor, 1.0)::NUMERIC,
    COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA: Default Provider Weights
-- ============================================================================

INSERT INTO provider_weights (provider_slug, evidence_type, vertical_slug, base_weight, reliability_score, freshness_weight, coverage_score) VALUES
-- Global defaults (NULL vertical)
('clearbit', NULL, NULL, 1.0, 0.85, 1.0, 0.9),
('apollo', NULL, NULL, 0.95, 0.82, 1.0, 0.85),
('zoominfo', NULL, NULL, 1.0, 0.88, 0.95, 0.92),
('linkedin', NULL, NULL, 0.9, 0.9, 1.1, 0.75),
('crunchbase', NULL, NULL, 0.85, 0.8, 0.9, 0.7),
('pitchbook', NULL, NULL, 0.95, 0.85, 0.85, 0.65),
('dnb', NULL, NULL, 1.0, 0.9, 0.8, 0.95),
('google', NULL, NULL, 0.7, 0.75, 1.2, 0.6),
('manual', NULL, NULL, 1.1, 0.95, 0.7, 1.0),
('internal', NULL, NULL, 1.2, 1.0, 1.0, 1.0),

-- Banking vertical overrides
('clearbit', 'firmographic', 'banking', 1.1, 0.9, 1.0, 0.95),
('dnb', 'firmographic', 'banking', 1.2, 0.95, 0.9, 0.98),
('pitchbook', 'financial', 'banking', 1.1, 0.9, 0.8, 0.8),

-- Insurance vertical overrides
('clearbit', 'firmographic', 'insurance', 1.0, 0.85, 1.0, 0.9),
('apollo', 'contact', 'insurance', 1.0, 0.85, 1.1, 0.9),

-- Real estate vertical overrides
('google', 'location', 'real_estate', 0.9, 0.85, 1.2, 0.8),
('manual', 'property', 'real_estate', 1.2, 0.95, 0.8, 1.0)

ON CONFLICT (provider_slug, evidence_type, vertical_slug) DO UPDATE SET
  base_weight = EXCLUDED.base_weight,
  reliability_score = EXCLUDED.reliability_score,
  freshness_weight = EXCLUDED.freshness_weight,
  coverage_score = EXCLUDED.coverage_score,
  updated_at = NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE evidence_items IS 'Core evidence data from various providers';
COMMENT ON TABLE evidence_links IS 'Relationships between evidence and other objects';
COMMENT ON TABLE evidence_freshness IS 'Track evidence age and decay scores';
COMMENT ON TABLE evidence_provenance IS 'Raw source data and fetch metadata for audit trail';
COMMENT ON TABLE provider_weights IS 'Configurable weights for different providers per vertical';
COMMENT ON TABLE evidence_aggregations IS 'Pre-computed aggregations for performance';
COMMENT ON TABLE evidence_conflicts IS 'Track and resolve conflicting evidence';

COMMENT ON VIEW v_evidence_summary_by_object IS 'Summary statistics of evidence per object';
COMMENT ON VIEW v_evidence_source_quality IS 'Quality metrics by provider and evidence type';
COMMENT ON VIEW v_evidence_with_freshness IS 'Evidence items joined with freshness data';

COMMENT ON FUNCTION calculate_decay_score IS 'Calculate exponential decay score based on evidence age';
COMMENT ON FUNCTION refresh_object_evidence_freshness IS 'Update freshness scores for all evidence of an object';
COMMENT ON FUNCTION compute_evidence_score IS 'Compute weighted evidence score with provider weights';
