-- Contextual Bandits Enhancement - LinUCB Support
-- Adds experiment_outcomes table and algorithm field

-- Add algorithm field to experiments table
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS algorithm TEXT DEFAULT 'linucb';

COMMENT ON COLUMN experiments.algorithm IS 'Bandit algorithm: linucb (contextual) or thompson_sampling (context-free)';

-- Create experiment_outcomes table (for tracking rewards)
CREATE TABLE IF NOT EXISTS experiment_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES experiment_assignments(id) ON DELETE CASCADE,

    -- Outcome details
    outcome TEXT NOT NULL, -- 'converted', 'opened', 'replied', 'bounced', 'clicked'
    reward NUMERIC DEFAULT 0, -- Numeric reward (1 for success, 0 for failure, or custom)

    -- Context (lead features) for LinUCB
    context JSONB, -- { "industry": "technology", "seniority": "c_level", ... }

    -- Metadata
    email_id UUID, -- Optional: link to specific email
    person_id UUID, -- Optional: link to specific person
    metadata JSONB, -- Additional data

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_experiment_outcomes_experiment ON experiment_outcomes(experiment_id, created_at DESC);
CREATE INDEX idx_experiment_outcomes_assignment ON experiment_outcomes(assignment_id, created_at DESC);
CREATE INDEX idx_experiment_outcomes_outcome ON experiment_outcomes(outcome, created_at DESC);

-- Sample LinUCB experiment (optional seed data - commented out as experiments are created dynamically)
-- INSERT INTO experiments (name, description, experiment_type, algorithm, status, primary_metric, variants)
-- VALUES (
--     'subject_line_personalization_nov_2025',
--     'Test personalized subject lines using LinUCB contextual bandits',
--     'contextual_bandit',
--     'linucb',
--     'draft',
--     'conversion_rate',
--     '[]'::jsonb
-- )
-- ON CONFLICT DO NOTHING;

-- Note: Experiment assignments are created dynamically when leads are assigned to experiments
-- No seed data needed as experiments are configured through the API

COMMENT ON TABLE experiment_outcomes IS 'Tracks experiment outcomes for bandit algorithm updates (LinUCB, Thompson Sampling)';
COMMENT ON COLUMN experiment_outcomes.context IS 'Lead features for LinUCB contextual learning (industry, seniority, size, etc.)';
COMMENT ON COLUMN experiment_outcomes.reward IS 'Numeric reward: 1=success, 0=failure, or custom value (e.g., revenue)';
