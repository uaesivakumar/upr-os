-- scripts/20251009_add_rag_and_audit_tables.sql

-- Enable the pgvector extension if it's not already enabled.
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Knowledge Base for Companies
-- Stores verified UAE employers for RAG-based disambiguation.
CREATE TABLE kb_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    embedding VECTOR(1536), -- For OpenAI text-embedding-3-small
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE kb_companies IS 'Knowledge base of verified UAE employers for vector-based semantic search and disambiguation.';

-- 2. Knowledge Base for Job Titles
-- Stores common roles for normalization and seniority/function mapping.
CREATE TABLE kb_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL UNIQUE,
    normalized_title TEXT,
    "function" TEXT, -- e.g., HR, Finance, Admin
    seniority TEXT, -- e.g., Manager, Director, C-Level
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE kb_titles IS 'Knowledge base of job titles for normalization, function/seniority mapping, and semantic search.';

-- 3. Enrichment Audit Table
-- Logs each step of the agentic enrichment process for analytics and debugging.
CREATE TABLE enrich_audit (
    id BIGSERIAL PRIMARY KEY,
    hr_lead_id UUID REFERENCES hr_leads(id) ON DELETE SET NULL,
    agent_name TEXT NOT NULL, -- e.g., 'Apollo', 'RAG Disambiguation', 'Scorer'
    status TEXT NOT NULL, -- 'success' or 'failure'
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE enrich_audit IS 'Logs every step taken by the agentic enrichment pipeline for a given lead.';


-- 4. Vector Indexes for fast similarity search
-- As specified in the tech checklist, using IVFFlat for a good balance of speed and accuracy.
-- The list size should be tuned based on the number of rows (e.g., sqrt(N) for N < 1M).
CREATE INDEX ON kb_companies USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
CREATE INDEX ON kb_titles USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Add new columns to hr_leads to store the results of enrichment
ALTER TABLE hr_leads
    ADD COLUMN IF NOT EXISTS email_status_provider TEXT, -- e.g., 'neverbounce', 'validated_user'
    ADD COLUMN IF NOT EXISTS enrich_meta JSONB, -- To store confidence, sources, etc.
    ADD COLUMN IF NOT EXISTS title_normalized TEXT; -- The clean title from kb_titles