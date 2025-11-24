-- scripts/20250926_add_pattern_cache.sql

CREATE TABLE IF NOT EXISTS email_patterns (
    domain VARCHAR(255) PRIMARY KEY,
    pattern VARCHAR(100) NOT NULL,
    source VARCHAR(50) DEFAULT 'unknown', -- e.g., 'inferred', 'manual', 'ai'
    confidence REAL, -- 0.0 to 1.0
    example_email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_patterns_updated_at_trigger
BEFORE UPDATE ON email_patterns
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE email_patterns IS 'Caches discovered email address patterns for company domains.';