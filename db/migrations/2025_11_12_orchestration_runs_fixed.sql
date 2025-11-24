-- Migration: Orchestration Runs Table (Fixed for existing schema)
-- Sprint 19, Task 1: Multi-Source Orchestration
-- Date: 2025-11-12
--
-- Purpose: Track multi-source orchestration executions for monitoring and analytics

-- ============================================================================
-- Table: orchestration_runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration_runs (
  id SERIAL PRIMARY KEY,
  orchestration_id TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id),

  -- Source tracking (updated schema)
  sources_requested TEXT[] NOT NULL DEFAULT '{}',
  sources_executed TEXT[] NOT NULL DEFAULT '{}',
  sources_successful TEXT[] NOT NULL DEFAULT '{}',
  sources_failed TEXT[] NOT NULL DEFAULT '{}',

  -- Filter information
  filters JSONB DEFAULT '{}',

  -- Signal metrics
  total_signals INTEGER DEFAULT 0,
  unique_signals INTEGER DEFAULT 0,
  execution_time_ms INTEGER NOT NULL,

  -- Deduplication stats
  deduplication_stats JSONB DEFAULT '{}',

  -- Quality stats
  quality_stats JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_tenant_id
  ON orchestration_runs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_created_at
  ON orchestration_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_sources_requested
  ON orchestration_runs USING GIN(sources_requested);

-- Comments
COMMENT ON TABLE orchestration_runs IS 'Tracks multi-source signal discovery orchestration executions';
COMMENT ON COLUMN orchestration_runs.orchestration_id IS 'Unique identifier for orchestration run (e.g., orch_1699876543_abc123)';
COMMENT ON COLUMN orchestration_runs.sources_requested IS 'Array of source IDs that were requested';
COMMENT ON COLUMN orchestration_runs.sources_executed IS 'Array of source IDs that actually executed';
COMMENT ON COLUMN orchestration_runs.sources_successful IS 'Array of source IDs that succeeded';
COMMENT ON COLUMN orchestration_runs.sources_failed IS 'Array of source IDs that failed';
COMMENT ON COLUMN orchestration_runs.total_signals IS 'Total signals before deduplication';
COMMENT ON COLUMN orchestration_runs.unique_signals IS 'Unique signals after deduplication';
COMMENT ON COLUMN orchestration_runs.deduplication_stats IS 'JSON stats about deduplication (duplicatesRemoved, etc.)';
COMMENT ON COLUMN orchestration_runs.quality_stats IS 'JSON stats about signal quality (averageScore, highQualityCount, etc.)';

-- ============================================================================
-- Table: source_health
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_health (
  id SERIAL PRIMARY KEY,
  source_id TEXT UNIQUE NOT NULL,

  -- Health metrics
  is_healthy BOOLEAN DEFAULT true,
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,

  -- Circuit breaker state
  circuit_breaker_state TEXT DEFAULT 'closed',  -- closed, open, half_open

  -- Timestamps
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_health_source_id
  ON source_health(source_id);

CREATE INDEX IF NOT EXISTS idx_source_health_state
  ON source_health(circuit_breaker_state);

-- Comments
COMMENT ON TABLE source_health IS 'Tracks source health and circuit breaker status';
COMMENT ON COLUMN source_health.circuit_breaker_state IS 'Circuit breaker state: closed (healthy), open (failing), half_open (testing recovery)';
COMMENT ON COLUMN source_health.failure_count IS 'Consecutive failures (resets to 0 on success)';
