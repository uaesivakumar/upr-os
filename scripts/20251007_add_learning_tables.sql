-- scripts/20251007_add_learning_tables.sql
-- This script adds the tables required for the AI's self-learning
-- and style-adaptation capabilities.

BEGIN;

-- Step 1: Enable the pgvector extension if it's not already.
-- This is required to store AI embedding vectors.
CREATE EXTENSION IF NOT EXISTS vector;


-- Step 2: Create the table for storing user style memory.
-- This table holds corrected email examples, a summary of the user's tone,
-- and the averaged embedding vector of their writing style.
CREATE TABLE IF NOT EXISTS user_style_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- In the future, this will link to a users table
    examples JSONB, -- Stores an array of {draft, corrected} text objects
    embedding vector(1536), -- Stores the average style embedding from OpenAI text-embedding-3-large
    tone_summary TEXT, -- AI-generated natural-language description of the user's style
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Step 3: Create the table for tracking email performance.
-- This table links back to a sent email and tracks the outcomes that
-- will be used for reinforcement learning.
CREATE TABLE IF NOT EXISTS email_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outreach_id UUID NOT NULL UNIQUE REFERENCES outreach_generations(id) ON DELETE CASCADE,
    reply BOOLEAN NOT NULL DEFAULT FALSE,
    conversion BOOLEAN NOT NULL DEFAULT FALSE,
    feedback_notes TEXT -- Optional user notes on why an email performed well or poorly
);


-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_style_memory_user_id ON user_style_memory(user_id);


COMMIT;