-- scripts/20251110_add_webhook_retry.sql
-- Sprint 18 Task 6: Webhook Retry Logic
-- Adds tables for tracking webhook deliveries with retry capabilities

BEGIN;

-- Stores webhook delivery attempts with retry tracking
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What we're delivering
    target_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB, -- Custom headers for the webhook

    -- Linking (flexible - can link to generation_id, signal_id, etc.)
    entity_type VARCHAR(50) NOT NULL, -- 'outreach_generation', 'hiring_signal', 'lead_event', etc.
    entity_id UUID NOT NULL,

    -- Delivery tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'delivered', 'failed', 'dead'
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ, -- When to retry next (for manual retries)
    delivered_at TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT,
    last_status_code INTEGER,
    last_response_body TEXT
);

-- Stores detailed history of each delivery attempt
CREATE TABLE IF NOT EXISTS webhook_attempt_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,

    attempt_number INTEGER NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Response details
    status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    duration_ms INTEGER, -- How long the HTTP request took

    -- Success flag
    success BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_entity ON webhook_deliveries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at)
    WHERE status = 'failed' AND attempts < max_attempts;
CREATE INDEX IF NOT EXISTS idx_webhook_attempt_history_delivery_id ON webhook_attempt_history(delivery_id);

COMMIT;
