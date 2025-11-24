-- scripts/20251007_rebuild_outreach_schema.sql
-- This script aligns the database with the finalized agentic outreach specification.
-- It DROPS the previous, now-obsolete tables and creates the new, production-ready schema.

BEGIN;

-- ---
-- Step 1: Drop old, superseded tables from the previous iteration.
-- ---
DROP TABLE IF EXISTS deliverability_events CASCADE;
DROP TABLE IF EXISTS outreach_generations CASCADE;
DROP TABLE IF EXISTS research_cache CASCADE;
DROP TABLE IF EXISTS broadcast_tasks CASCADE;
DROP TABLE IF EXISTS broadcast_jobs CASCADE;
DROP TABLE IF EXISTS template_versions CASCADE;
DROP TABLE IF EXISTS templates CASCADE;


-- ---
-- Step 2: Create tables based on the Finalized Data Model
-- ---

-- 1.1 Templates & Versions
-- master record
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                          -- e.g., "UAE_NATIONAL_DAY_2025"
  category text not null default 'campaign',          -- generic | campaign | event | ALE | non-ALE (free text ok)
  status text not null default 'draft',               -- draft | active | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- immutable snapshots; every edit creates a new row
create table if not exists template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  version int not null,                               -- monotonic per template
  subject text not null,
  blocks jsonb not null,                              -- { greeting, opening_context, value_offer, cta, signature }
  variables jsonb not null,                           -- ["company_name","city","hr_person","offer"]  (required placeholders)
  created_by text,                                    -- optional: user id/email
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

-- 1.2 Outreach + Deliverability + Jobs
-- sent or scheduled items
create table if not exists outreach_generations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references hr_leads(id) on delete set null, -- FK to your leads table
  template_version_id uuid not null references template_versions(id),
  subject text not null,
  body_html text not null,
  body_text text not null,
  research_facts jsonb,                               -- fact pack used for opening_context
  send_status text not null default 'queued',         -- queued | sending | sent | failed
  esp_message_id text,                                -- id from SES/SendGrid/Gmail
  created_at timestamptz not null default now()
);

create table if not exists deliverability_events (
  id bigserial primary key,
  outreach_id uuid not null references outreach_generations(id) on delete cascade,
  event_type text not null,                           -- delivered | open | click | bounce | complaint | dropped
  event_meta jsonb,
  occurred_at timestamptz not null default now()
);

-- async broadcast orchestration
create table if not exists broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references template_versions(id),
  name text,                                          -- label in UI (e.g., "Q4 Payroll Push")
  status text not null default 'queued',              -- queued | running | completed | failed | canceled
  total_targets int not null default 0,
  processed int not null default 0,
  errors int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists broadcast_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references broadcast_jobs(id) on delete cascade,
  lead_id uuid not null references hr_leads(id) on delete set null,
  status text not null default 'queued',              -- queued | researching | composing | guardrail | sending | done | error
  error_text text,
  started_at timestamptz,
  finished_at timestamptz
);


-- ---
-- Step 3: Create Helper Functions and Triggers
-- ---
create or replace function bump_template_version()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

create trigger t_templates_updated
before update on templates
for each row execute procedure bump_template_version();


COMMIT;