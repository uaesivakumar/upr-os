-- Migration: User Interactions Telemetry System
-- Created: 2025-10-30
-- Purpose: Track user interactions for ML training and UX analytics

-- Create user_interactions table for telemetry
CREATE TABLE IF NOT EXISTS user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_context JSONB DEFAULT '{}',
  page_path TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Constraint to ensure valid event types
  CONSTRAINT valid_event_type CHECK (event_type IN (
    'enrichment_start',
    'enrichment_complete',
    'drawer_open',
    'drawer_close',
    'lead_save',
    'cluster_view',
    'explainability_view',
    'verify_click',
    'draft_outreach',
    'search_company',
    'refine_url',
    'filter_change'
  ))
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_event_type ON user_interactions(event_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_timestamp ON user_interactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_session ON user_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_context ON user_interactions USING GIN (event_context);

-- Grant permissions (adjust user name as needed)
GRANT ALL ON user_interactions TO upr_app;
GRANT USAGE, SELECT ON SEQUENCE user_interactions_id_seq TO upr_app;

-- Add comment for documentation
COMMENT ON TABLE user_interactions IS 'Tracks user interactions for ML training and UX analytics. Used by telemetry system.';
COMMENT ON COLUMN user_interactions.event_type IS 'Type of user interaction (enrichment_start, drawer_open, etc.)';
COMMENT ON COLUMN user_interactions.event_context IS 'Flexible JSON context: {company, sector, lead_count, confidence, etc.}';
COMMENT ON COLUMN user_interactions.session_id IS 'Browser session ID for tracking user journey';
