-- ============================================================================
-- S243: Buyer Bot Framework
-- PRD v1.3 Appendix §5
--
-- Creates tables for Buyer Bots and Variants:
-- - buyer_bots: Constitutional test harnesses with hidden states
-- - buyer_bot_variants: Difficulty/behavior variations
-- ============================================================================

-- ============================================================================
-- buyer_bots: Constitutional test harnesses
-- PRD v1.3 §5
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.buyer_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (
    category IN ('cfo', 'cto', 'procurement', 'champion', 'blocker', 'skeptic', 'researcher', 'decision_maker')
  ),

  -- Vertical context (PRD v1.3 §7.3)
  vertical VARCHAR(50) NOT NULL,
  sub_vertical VARCHAR(50) NOT NULL,

  -- Visible persona (what SIVA can see)
  persona_description TEXT NOT NULL,

  -- Hidden states (SIVA CANNOT see these)
  hidden_states JSONB NOT NULL DEFAULT '[]',

  -- Failure triggers (conditions that cause FAIL/BLOCK)
  failure_triggers JSONB NOT NULL DEFAULT '[]',

  -- Behavioral rules for response generation
  behavioral_rules JSONB NOT NULL DEFAULT '{
    "response_style": "professional",
    "verbosity": "medium",
    "objection_frequency": "normal",
    "buying_signals": []
  }',

  -- LLM system prompt for generating bot responses
  system_prompt TEXT NOT NULL,

  -- S244: Mandatory adversarial bots
  is_mandatory BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Unique name per vertical
  CONSTRAINT buyer_bot_name_vertical_unique UNIQUE (vertical, sub_vertical, name)
);

-- Indexes for buyer_bots
CREATE INDEX IF NOT EXISTS idx_buyer_bots_vertical
  ON sales_bench.buyer_bots(vertical, sub_vertical);

CREATE INDEX IF NOT EXISTS idx_buyer_bots_category
  ON sales_bench.buyer_bots(category);

CREATE INDEX IF NOT EXISTS idx_buyer_bots_mandatory
  ON sales_bench.buyer_bots(is_mandatory) WHERE is_mandatory = true;

CREATE INDEX IF NOT EXISTS idx_buyer_bots_active
  ON sales_bench.buyer_bots(is_active) WHERE is_active = true;

COMMENT ON TABLE sales_bench.buyer_bots IS 'Buyer Bot definitions - constitutional test harnesses (PRD v1.3 §5)';
COMMENT ON COLUMN sales_bench.buyer_bots.hidden_states IS 'States that SIVA cannot see - tests blind spots';
COMMENT ON COLUMN sales_bench.buyer_bots.failure_triggers IS 'Conditions that cause FAIL or BLOCK outcomes';
COMMENT ON COLUMN sales_bench.buyer_bots.is_mandatory IS 'Part of mandatory adversarial set (S244)';

-- ============================================================================
-- buyer_bot_variants: Difficulty/behavior variations
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_bench.buyer_bot_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES sales_bench.buyer_bots(id),
  name VARCHAR(100) NOT NULL,

  -- Override hidden states for this variant
  state_overrides JSONB NOT NULL DEFAULT '{}',

  -- Override failure triggers for this variant
  trigger_overrides JSONB NOT NULL DEFAULT '{}',

  -- Difficulty adjustment (-1 = easier, +1 = harder)
  difficulty_modifier NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (
    difficulty_modifier >= -1 AND difficulty_modifier <= 1
  ),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Unique variant name per bot
  CONSTRAINT variant_name_bot_unique UNIQUE (bot_id, name)
);

-- Indexes for variants
CREATE INDEX IF NOT EXISTS idx_variants_bot
  ON sales_bench.buyer_bot_variants(bot_id);

CREATE INDEX IF NOT EXISTS idx_variants_active
  ON sales_bench.buyer_bot_variants(is_active) WHERE is_active = true;

COMMENT ON TABLE sales_bench.buyer_bot_variants IS 'Buyer Bot variants for difficulty/behavior testing';
COMMENT ON COLUMN sales_bench.buyer_bot_variants.difficulty_modifier IS '-1 = easier, 0 = normal, +1 = harder';

-- ============================================================================
-- Update scenario_runs to reference buyer_bot_variants
-- ============================================================================

-- Add foreign key if not exists (scenario_runs already has buyer_bot_id column from S241)
-- We just need to ensure it references the correct table
DO $$
BEGIN
  -- Check if foreign key already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_runs_buyer_bot' AND conrelid = 'sales_bench.scenario_runs'::regclass
  ) THEN
    ALTER TABLE sales_bench.scenario_runs
      ADD CONSTRAINT fk_runs_buyer_bot
      FOREIGN KEY (buyer_bot_id) REFERENCES sales_bench.buyer_bots(id);
  END IF;
END $$;

DO $$
BEGIN
  -- Check if variant foreign key already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_runs_buyer_bot_variant' AND conrelid = 'sales_bench.scenario_runs'::regclass
  ) THEN
    ALTER TABLE sales_bench.scenario_runs
      ADD CONSTRAINT fk_runs_buyer_bot_variant
      FOREIGN KEY (buyer_bot_variant_id) REFERENCES sales_bench.buyer_bot_variants(id);
  END IF;
END $$;

-- ============================================================================
-- View: Buyer Bots with variant counts
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_buyer_bots AS
SELECT
  b.id,
  b.name,
  b.category,
  b.vertical,
  b.sub_vertical,
  b.persona_description,
  b.is_mandatory,
  b.is_active,
  b.created_at,
  (SELECT COUNT(*) FROM sales_bench.buyer_bot_variants v WHERE v.bot_id = b.id AND v.is_active = true) as variant_count,
  (SELECT COUNT(*) FROM sales_bench.scenario_runs r WHERE r.buyer_bot_id = b.id) as run_count
FROM sales_bench.buyer_bots b
WHERE b.is_active = true;

COMMENT ON VIEW sales_bench.v_buyer_bots IS 'Active Buyer Bots with variant and run counts';

-- ============================================================================
-- View: Mandatory bots per vertical (S244 compliance check)
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench.v_mandatory_coverage AS
SELECT
  vertical,
  sub_vertical,
  category,
  COUNT(*) as bot_count,
  array_agg(name ORDER BY name) as bot_names
FROM sales_bench.buyer_bots
WHERE is_mandatory = true AND is_active = true
GROUP BY vertical, sub_vertical, category;

COMMENT ON VIEW sales_bench.v_mandatory_coverage IS 'Mandatory bot coverage by vertical and category (S244)';

-- ============================================================================
-- Migration complete
-- ============================================================================

SELECT 'S243: Buyer Bot Framework migration complete' as status,
       'buyer_bots table created' as bots_status,
       'buyer_bot_variants table created' as variants_status,
       'foreign keys added to scenario_runs' as fk_status;
