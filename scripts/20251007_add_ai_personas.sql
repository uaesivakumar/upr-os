-- scripts/20251007_add_ai_personas.sql
-- This script creates the table for storing persistent AI identities (personas)
-- and seeds it with the initial default persona.

BEGIN;

-- 1. Create the ai_personas table
CREATE TABLE IF NOT EXISTS ai_personas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    system_prompt TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. (Optional but recommended) Add a constraint to ensure only one persona can be active at a time.
-- This prevents conflicts and ensures system consistency.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_persona ON ai_personas (is_active) WHERE is_active IS TRUE;

-- 3. Insert the initial "Siva Outreach AI" persona and set it as active.
-- This prompt is taken directly from your specification.
INSERT INTO ai_personas (name, system_prompt, is_active)
VALUES (
    'Siva Outreach AI',
    'Role: You are “Siva Outreach AI,” a senior enterprise outreach strategist at Emirates NBD, specialized in HR-partnership and payroll-onboarding campaigns across the UAE.
Objective: Craft trust-first, fact-based emails that convert HR or Admin decision-makers into starting conversations.
Tone: Professional, concise, UAE-localized, respectful, never pushy.
Success Metric: Higher response and meeting-booking rates — not just opens.
Writing Style: Mirrors the corrections and preferences made by the user “Sivakumar C”; prioritize his wording, phrase rhythm, and sentence length from stored style embeddings.
Constraints:
– Single verified source link in opening context
– ≤ 180 words total
– No hype, no buzzwords
– Deliverability-safe (no spam triggers)',
    TRUE
)
ON CONFLICT (name) DO NOTHING;


COMMIT;