-- scripts/20250927_add_pattern_status.sql

-- Add a new status column to track if a pattern is valid, invalid, or for a catch-all domain.
ALTER TABLE email_patterns
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'valid';

-- Migrate existing data: if a domain was marked as catch_all, update its status.
UPDATE email_patterns
SET status = 'catch_all'
WHERE is_catch_all = TRUE;

-- Now that the status is stored in the new column, the old boolean is redundant.
ALTER TABLE email_patterns
DROP COLUMN is_catch_all;

-- Add an index for faster lookups on the new status column.
CREATE INDEX idx_email_patterns_status ON email_patterns(status);

-- Optional: Add a comment to the table for future reference.
COMMENT ON COLUMN email_patterns.status IS 'The status of the email pattern (e.g., valid, invalid, catch_all).';