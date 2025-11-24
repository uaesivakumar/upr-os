-- scripts/20251007_add_click_tracking.sql
-- Adds the 'clicked_at' column needed for the micro-tracking link feature.

BEGIN;

ALTER TABLE outreach_generations
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

COMMIT;