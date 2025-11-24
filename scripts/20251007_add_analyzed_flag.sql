-- scripts/20251007_add_analyzed_flag.sql
-- This script adds a boolean flag to the outreach_generations table to track
-- which records have been processed by the reinforcement learning worker.

BEGIN;

ALTER TABLE outreach_generations
  ADD COLUMN IF NOT EXISTS is_analyzed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_outreach_unanalysed_replies ON outreach_generations (id) WHERE reply_at IS NOT NULL AND is_analyzed IS FALSE;

COMMIT;