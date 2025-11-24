-- scripts/20251005_add_outreach_tables.sql

-- This script creates the tables required for the advanced, template-driven,
-- agentic outreach module. It includes models for template management,
-- asynchronous broadcast jobs, research caching, and deliverability tracking.

BEGIN;

-- ---
-- Section 1: Template Management System
-- ---

-- Stores the core template entity. Each template can have multiple versions.
CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- e.g., 'draft', 'active', 'archived'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stores immutable versions of each template. This provides a full audit trail
-- and enables accurate A/B testing and analytics.
CREATE TABLE IF NOT EXISTS template_versions (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    subject_template TEXT NOT NULL,
    body_blocks JSONB NOT NULL, -- Stores structured content like {'greeting', 'value_offer', ...}
    required_variables TEXT[], -- List of required placeholders, e.g., {'lead_name', 'company_name'}
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- e.g., 'draft', 'active', 'archived'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_id, version)
);

-- ---
-- Section 2: Asynchronous Broadcast Architecture
-- ---

-- Manages high-level, long-running broadcast jobs.
CREATE TABLE IF NOT EXISTS broadcast_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_version_id INTEGER NOT NULL REFERENCES template_versions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'researching', 'composing', 'sending', 'complete', 'failed'
    total_leads INTEGER NOT NULL,
    processed_leads INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks the status of each individual lead within a larger broadcast job.
CREATE TABLE IF NOT EXISTS broadcast_tasks (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES hr_leads(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'research_complete', 'compose_complete', 'sent', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---
-- Section 3: Research & Generation Pipeline
-- ---

-- Caches the raw output ("fact pack") from the research agent for a given company.
-- This avoids costly re-computation for leads at the same company.
CREATE TABLE IF NOT EXISTS research_cache (
    id SERIAL PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES targeted_companies(id) ON DELETE CASCADE, -- <<< FIX: Changed from INTEGER to UUID
    fact_pack JSONB,
    source VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id)
);

-- Stores the final, generated email content for a specific lead. This is the
-- "sent" artifact.
CREATE TABLE IF NOT EXISTS outreach_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES hr_leads(id) ON DELETE CASCADE,
    template_version_id INTEGER NOT NULL REFERENCES template_versions(id),
    broadcast_task_id INTEGER REFERENCES broadcast_tasks(id) ON DELETE SET NULL, -- Optional but recommended link
    opening_context TEXT, -- The unique, AI-generated portion of the email
    final_subject TEXT,
    final_body TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---
-- Section 4: Analytics & Deliverability Tracking
-- ---

-- Tracks events (sends, opens, clicks, bounces) for each outreach message.
-- This table is populated by webhooks from an Email Service Provider (ESP).
CREATE TABLE IF NOT EXISTS deliverability_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID NOT NULL REFERENCES outreach_generations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complaint'
    event_timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB, -- Additional data from the ESP webhook
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON broadcast_jobs(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_tasks_job_id ON broadcast_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_tasks_lead_id ON broadcast_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_generations_lead_id ON outreach_generations(lead_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_events_generation_id ON deliverability_events(generation_id);


-- Update timestamps automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_templates
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_broadcast_tasks
BEFORE UPDATE ON broadcast_tasks
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_research_cache
BEFORE UPDATE ON research_cache
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();


COMMIT;