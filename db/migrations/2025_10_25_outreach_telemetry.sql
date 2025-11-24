-- Migration: Create outreach_telemetry table for analytics
-- Date: 2025-10-25
-- Purpose: Track outreach actions for learning and optimization

BEGIN;

CREATE TABLE IF NOT EXISTS outreach_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,  -- 'batch_add', 'batch_send', 'compose', 'send', etc.
    company_id UUID REFERENCES targeted_companies(id) ON DELETE CASCADE,
    lead_count INTEGER DEFAULT 0,
    avg_score INTEGER,                -- Average confidence score (0-100)
    metadata JSONB,                   -- Flexible JSON for event-specific data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by event type and date
CREATE INDEX IF NOT EXISTS idx_outreach_telemetry_event_type ON outreach_telemetry(event_type);
CREATE INDEX IF NOT EXISTS idx_outreach_telemetry_company_id ON outreach_telemetry(company_id);
CREATE INDEX IF NOT EXISTS idx_outreach_telemetry_created_at ON outreach_telemetry(created_at);

COMMIT;
