-- Check and create telemetry table
-- This can be run via gcloud sql connect or Cloud SQL Admin Console

-- Check if table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_interactions'
    ) THEN
        -- Create table
        CREATE TABLE user_interactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          session_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_context JSONB DEFAULT '{}',
          page_path TEXT,
          timestamp TIMESTAMP DEFAULT NOW(),

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

        -- Create indexes
        CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
        CREATE INDEX idx_user_interactions_event_type ON user_interactions(event_type);
        CREATE INDEX idx_user_interactions_timestamp ON user_interactions(timestamp DESC);
        CREATE INDEX idx_user_interactions_session ON user_interactions(session_id);
        CREATE INDEX idx_user_interactions_context ON user_interactions USING GIN (event_context);

        -- Grant permissions
        GRANT ALL ON user_interactions TO upr_app;
        GRANT USAGE, SELECT ON SEQUENCE user_interactions_id_seq TO upr_app;

        RAISE NOTICE 'Table user_interactions created successfully';
    ELSE
        RAISE NOTICE 'Table user_interactions already exists';
    END IF;
END $$;

-- Verify table
\d user_interactions
