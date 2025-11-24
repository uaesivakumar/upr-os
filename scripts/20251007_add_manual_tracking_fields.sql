-- scripts/20251007_add_manual_tracking_fields.sql
-- This script adds fields to the outreach_generations table to support
-- the low-friction manual sending and feedback workflow.

BEGIN;

-- Add new columns to the outreach_generations table
ALTER TABLE outreach_generations
  ADD COLUMN IF NOT EXISTS short_id TEXT,
  ADD COLUMN IF NOT EXISTS sent_via TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT FALSE;

-- Add a unique constraint to short_id to ensure it can be used as a reliable lookup key
-- Note: We make it nullable to not break existing rows, but new rows should always have it.
ALTER TABLE outreach_generations ADD CONSTRAINT unique_short_id UNIQUE (short_id);

-- Create an index for fast lookups on the short_id
CREATE INDEX IF NOT EXISTS idx_outreach_short_id ON outreach_generations(short_id);


-- We will also remove the old email_performance table, as these new columns
-- on the outreach_generations table replace its functionality in a more direct way.
DROP TABLE IF EXISTS email_performance;


COMMIT;