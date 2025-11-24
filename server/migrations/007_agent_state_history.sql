-- Migration 007: Agent State History Table
-- Phase 4: Agent Communication Protocol
-- Date: 2025-11-08

-- Create agent_state_history table for optional state persistence
CREATE TABLE IF NOT EXISTS agent_state_history (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_state_history_agent
  ON agent_state_history(agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_history_state
  ON agent_state_history(to_state, created_at DESC);

-- Add comments
COMMENT ON TABLE agent_state_history IS 'Agent state transitions for observability (Phase 4)';
COMMENT ON COLUMN agent_state_history.agent_name IS 'Name of the agent (e.g., RadarAgent)';
COMMENT ON COLUMN agent_state_history.from_state IS 'Previous state (IDLE, RUNNING, etc.)';
COMMENT ON COLUMN agent_state_history.to_state IS 'New state';
COMMENT ON COLUMN agent_state_history.metadata IS 'Transition metadata (runId, error details, etc.)';

-- Verify existing tables from Phase 2A
DO $$
BEGIN
  -- Check if usage_events exists
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'usage_events') THEN
    RAISE EXCEPTION 'Missing table: usage_events. Run Phase 2A migrations first.';
  END IF;

  -- Check if dead_letters exists
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'dead_letters') THEN
    RAISE EXCEPTION 'Missing table: dead_letters. Run Phase 2A migrations first.';
  END IF;

  RAISE NOTICE 'Phase 4 migration completed successfully';
END
$$;
