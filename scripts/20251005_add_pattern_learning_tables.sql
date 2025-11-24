BEGIN;

-- Create ENUM types only if they do not already exist
DO $$ BEGIN
    CREATE TYPE pattern_source AS ENUM ('manual', 'auto', 'import');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE example_source AS ENUM ('manual_edit', 'upload', 'enrich');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tables only if they do not already exist
CREATE TABLE IF NOT EXISTS email_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    pattern TEXT NOT NULL,
    source pattern_source DEFAULT 'manual',
    support_count INTEGER DEFAULT 1 NOT NULL,
    confidence NUMERIC(3, 2) DEFAULT 0.60,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT unique_domain_pattern UNIQUE (domain, pattern)
);

CREATE TABLE IF NOT EXISTS email_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    derived_pattern TEXT,
    source example_source,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes only if they do not already exist
CREATE INDEX IF NOT EXISTS idx_email_patterns_domain ON email_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_email_examples_domain ON email_examples(domain);

COMMIT;