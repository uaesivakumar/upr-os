-- ============================================================================
-- Cleanup Seed Data Migration
-- December 6, 2025
--
-- Purpose: Remove demo/placeholder seed data that doesn't reflect actual
-- production configuration. Per CLAUDE.md, only Banking vertical is active.
-- ============================================================================

-- ============================================================================
-- 1. CLEANUP API PROVIDERS
-- Only keep providers we're actually using: Apollo, LinkedIn MCP, SalesNav MCP
-- Mark others as inactive (not delete, for reference)
-- ============================================================================

UPDATE api_providers SET is_active = false, updated_at = NOW()
WHERE slug NOT IN ('apollo', 'linkedin_scraper', 'salesnav_mcp')
  AND is_active = true;

-- Fix descriptions for active providers
UPDATE api_providers SET
  description = 'Contact & company enrichment API - PRIMARY',
  updated_at = NOW()
WHERE slug = 'apollo';

UPDATE api_providers SET
  description = 'LinkedIn profile scraping via MCP',
  updated_at = NOW()
WHERE slug = 'linkedin_scraper';

UPDATE api_providers SET
  description = 'Sales Navigator search via MCP',
  updated_at = NOW()
WHERE slug = 'salesnav_mcp';

-- ============================================================================
-- 2. CLEANUP LLM PROVIDERS
-- Only keep OpenAI and Anthropic as active
-- ============================================================================

UPDATE llm_providers SET is_active = false, updated_at = NOW()
WHERE slug NOT IN ('openai', 'anthropic')
  AND is_active = true;

-- Keep only relevant models active
UPDATE llm_models SET is_active = false, updated_at = NOW()
WHERE provider_id NOT IN (
  SELECT id FROM llm_providers WHERE slug IN ('openai', 'anthropic')
);

-- ============================================================================
-- 3. CLEANUP VERTICAL PACKS
-- Per CLAUDE.md: Only Banking is active, others are "Coming Soon"
-- ============================================================================

-- Mark non-banking verticals as inactive (Coming Soon)
UPDATE vertical_packs SET
  is_active = false,
  config = config || '{"status": "coming_soon"}'::jsonb,
  updated_at = NOW()
WHERE slug NOT IN ('banking', 'employee_banking', 'corporate_banking', 'sme_banking')
  AND is_active = true;

-- Ensure Banking and sub-verticals are active
UPDATE vertical_packs SET
  is_active = true,
  updated_at = NOW()
WHERE slug IN ('banking', 'employee_banking', 'corporate_banking', 'sme_banking');

-- ============================================================================
-- 4. ADD VERTICAL MODEL PREFERENCES (Task-to-Model Mappings)
-- These define which LLM model to use for each task type per vertical
-- ============================================================================

-- Create table if not exists (might not exist yet)
CREATE TABLE IF NOT EXISTS vertical_model_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_slug VARCHAR(100) NOT NULL,
  task_type VARCHAR(100) NOT NULL,

  -- Primary model
  provider_slug VARCHAR(100) NOT NULL,
  model_slug VARCHAR(100) NOT NULL,

  -- Fallback model (optional)
  fallback_provider_slug VARCHAR(100),
  fallback_model_slug VARCHAR(100),

  -- Configuration
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  timeout_seconds INTEGER DEFAULT 30,

  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vertical_slug, task_type)
);

-- Insert Banking vertical model preferences
INSERT INTO vertical_model_preferences (vertical_slug, task_type, provider_slug, model_slug, fallback_provider_slug, fallback_model_slug, temperature, max_tokens)
VALUES
  -- Deep Persona tasks
  ('banking', 'deep_persona', 'openai', 'gpt-4o', 'anthropic', 'claude-3-5-sonnet-20241022', 0.7, 4096),
  ('employee_banking', 'deep_persona', 'openai', 'gpt-4o', 'anthropic', 'claude-3-5-sonnet-20241022', 0.7, 4096),

  -- Ranking tasks
  ('banking', 'ranking', 'openai', 'gpt-4o-mini', 'anthropic', 'claude-3-5-haiku-20241022', 0.3, 2048),
  ('employee_banking', 'ranking', 'openai', 'gpt-4o-mini', 'anthropic', 'claude-3-5-haiku-20241022', 0.3, 2048),

  -- Discovery tasks (signal detection)
  ('banking', 'discovery', 'openai', 'gpt-4o-mini', 'anthropic', 'claude-3-5-haiku-20241022', 0.5, 2048),
  ('employee_banking', 'discovery', 'openai', 'gpt-4o-mini', 'anthropic', 'claude-3-5-haiku-20241022', 0.5, 2048),

  -- Outreach generation
  ('banking', 'outreach', 'anthropic', 'claude-3-5-sonnet-20241022', 'openai', 'gpt-4o', 0.8, 4096),
  ('employee_banking', 'outreach', 'anthropic', 'claude-3-5-sonnet-20241022', 'openai', 'gpt-4o', 0.8, 4096),

  -- Analysis tasks
  ('banking', 'analysis', 'openai', 'gpt-4o', 'anthropic', 'claude-3-5-sonnet-20241022', 0.5, 8192),
  ('employee_banking', 'analysis', 'openai', 'gpt-4o', 'anthropic', 'claude-3-5-sonnet-20241022', 0.5, 8192)
ON CONFLICT (vertical_slug, task_type) DO UPDATE SET
  provider_slug = EXCLUDED.provider_slug,
  model_slug = EXCLUDED.model_slug,
  fallback_provider_slug = EXCLUDED.fallback_provider_slug,
  fallback_model_slug = EXCLUDED.fallback_model_slug,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  updated_at = NOW();

-- ============================================================================
-- 5. CLEANUP TERRITORIES
-- Keep only UAE hierarchy relevant to Banking vertical
-- ============================================================================

-- Mark non-UAE territories as inactive (keep data for reference)
UPDATE territories SET is_active = false, updated_at = NOW()
WHERE slug NOT IN ('global', 'middle_east', 'uae', 'dubai', 'abu_dhabi', 'sharjah')
  AND slug NOT LIKE 'uae_%'
  AND is_active = true;

-- ============================================================================
-- VERIFICATION QUERIES (for manual check)
-- ============================================================================

-- Run these after migration to verify:
-- SELECT slug, name, is_active FROM api_providers ORDER BY is_active DESC, slug;
-- SELECT slug, name, is_active FROM llm_providers ORDER BY is_active DESC, slug;
-- SELECT slug, name, is_active FROM vertical_packs ORDER BY is_active DESC, slug;
-- SELECT * FROM vertical_model_preferences WHERE vertical_slug LIKE 'banking%';
