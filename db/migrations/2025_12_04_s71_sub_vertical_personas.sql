-- ============================================================================
-- Sprint 71: Sub-Vertical Personas - Multi-Vertical SIVA Architecture
-- ============================================================================
--
-- Purpose: Store persona configurations per sub-vertical to make SIVA
-- truly multi-vertical. Each sub-vertical gets its own brain specification.
--
-- Architecture Decision (Dec 4, 2025):
-- - Vertical = WHAT industry the salesperson works in
-- - Sub-Vertical = WHO the salesperson is (their role)
-- - Persona = HOW the salesperson thinks (their brain)
--
-- Therefore: Persona MUST be stored per Sub-Vertical.
-- ============================================================================

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS siva;

-- ============================================================================
-- MAIN TABLE: sub_vertical_personas
-- ============================================================================

CREATE TABLE IF NOT EXISTS siva.sub_vertical_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to sub-vertical (can be slug or UUID depending on vertical_packs structure)
  sub_vertical_slug VARCHAR(100) NOT NULL,
  sub_vertical_id UUID,  -- Optional FK if vertical_packs uses UUID

  -- ========================================
  -- IDENTITY SECTION
  -- ========================================
  persona_name VARCHAR(100) NOT NULL,           -- "EB Sales Officer"
  persona_role VARCHAR(200),                     -- "Senior Retail Banking Officer"
  persona_organization VARCHAR(200),             -- "Emirates NBD" (template org)
  persona_description TEXT,                      -- Extended description

  -- ========================================
  -- MISSION SECTION
  -- ========================================
  primary_mission TEXT,                          -- "Become designated point of contact..."
  core_goal TEXT,                                -- "Build long-term payroll relationships..."
  north_star_metric TEXT,                        -- "≥200 qualified companies/month"
  core_belief TEXT,                              -- "Quality companies create quality customers"

  -- ========================================
  -- TARGET ENTITY
  -- ========================================
  entity_type VARCHAR(50) DEFAULT 'company',     -- 'company' | 'individual' | 'family'

  -- ========================================
  -- CONTACT PRIORITY RULES (JSONB)
  -- ========================================
  -- Structure:
  -- {
  --   "tiers": [
  --     { "size_min": 0, "size_max": 50, "titles": ["Founder", "COO"], "reason": "..." },
  --     { "size_min": 50, "size_max": 500, "titles": ["HR Director", "HR Manager"], "reason": "..." }
  --   ],
  --   "boost_conditions": [
  --     { "condition": "hiring_velocity > 10", "add_titles": ["Head of Talent Acquisition"] }
  --   ],
  --   "seniority_order": ["C-Level", "VP", "Director", "Manager", "Individual"]
  -- }
  contact_priority_rules JSONB DEFAULT '{"tiers": [], "boost_conditions": []}'::jsonb,

  -- ========================================
  -- EDGE CASES (JSONB)
  -- ========================================
  -- Structure:
  -- {
  --   "blockers": [
  --     { "type": "company_name", "values": ["Etihad", "Emirates"], "multiplier": 0.1, "reason": "Enterprise brand" },
  --     { "type": "sector", "values": ["government"], "multiplier": 0.05, "reason": "Government entity" }
  --   ],
  --   "boosters": [
  --     { "type": "license_type", "values": ["Free Zone"], "multiplier": 1.3, "reason": "Free Zone bonus" },
  --     { "type": "signal_recency", "days_max": 30, "multiplier": 1.5, "reason": "Recent expansion" }
  --   ]
  -- }
  edge_cases JSONB DEFAULT '{"blockers": [], "boosters": []}'::jsonb,

  -- ========================================
  -- TIMING RULES (JSONB)
  -- ========================================
  -- Structure:
  -- {
  --   "calendar": [
  --     { "period": "Q1", "months": [1, 2], "multiplier": 1.3, "reason": "New budgets" },
  --     { "period": "Ramadan", "dynamic": true, "multiplier": 0.3, "reason": "Pause outreach" }
  --   ],
  --   "signal_freshness": [
  --     { "days_max": 7, "multiplier": 1.5, "label": "HOT" },
  --     { "days_max": 14, "multiplier": 1.2, "label": "WARM" }
  --   ],
  --   "follow_up_cadence": {
  --     "day_0": "initial_email",
  --     "day_7": "follow_up",
  --     "day_21": "final_check"
  --   }
  -- }
  timing_rules JSONB DEFAULT '{"calendar": [], "signal_freshness": []}'::jsonb,

  -- ========================================
  -- OUTREACH DOCTRINE (JSONB)
  -- ========================================
  -- Structure:
  -- {
  --   "always": [
  --     "Reference specific company signal",
  --     "Position as 'Point of Contact', not sales"
  --   ],
  --   "never": [
  --     "Mention pricing or rates",
  --     "Use pressure language"
  --   ],
  --   "tone": "professional",
  --   "formality": "formal",
  --   "channels": ["email", "linkedin"],
  --   "cta_style": "low_friction",
  --   "opening_templates": [
  --     { "signal_type": "hiring", "template": "I noticed {{company}} is expanding..." }
  --   ]
  -- }
  outreach_doctrine JSONB DEFAULT '{"always": [], "never": [], "tone": "professional", "formality": "formal", "channels": ["email"]}'::jsonb,

  -- ========================================
  -- QUALITY STANDARDS (JSONB)
  -- ========================================
  -- Structure:
  -- {
  --   "always": ["Verify UAE presence", "Validate email before send"],
  --   "never": ["Proceed if confidence < 70", "Bypass human review after edge-case"],
  --   "min_confidence": 70,
  --   "contact_cooldown_days": 90,
  --   "dedupe_by": "domain",
  --   "validation_rules": [
  --     { "field": "email", "rule": "matches_company_domain" }
  --   ]
  -- }
  quality_standards JSONB DEFAULT '{"always": [], "never": [], "min_confidence": 70, "contact_cooldown_days": 90}'::jsonb,

  -- ========================================
  -- ANTI-PATTERNS (JSONB)
  -- ========================================
  -- Structure:
  -- [
  --   { "mistake": "Generic Opening", "wrong": "I hope this email...", "correct": "I noticed {{company}}..." },
  --   { "mistake": "Wrong Contact", "wrong": "CEO of 800-person firm", "correct": "Payroll Manager" }
  -- ]
  anti_patterns JSONB DEFAULT '[]'::jsonb,

  -- ========================================
  -- SUCCESS/FAILURE PATTERNS (JSONB)
  -- ========================================
  success_patterns JSONB DEFAULT '[]'::jsonb,
  failure_patterns JSONB DEFAULT '[]'::jsonb,

  -- ========================================
  -- CONFIDENCE GATES (JSONB)
  -- ========================================
  -- When to ask human for help
  -- Structure:
  -- [
  --   { "condition": "top_2_confidence_delta < 0.15", "action": "flag_for_manual_choice" },
  --   { "condition": "edge_case_triggered AND score > 70", "action": "ask_confirmation" }
  -- ]
  confidence_gates JSONB DEFAULT '[]'::jsonb,

  -- ========================================
  -- SCORING CONFIG (JSONB)
  -- ========================================
  -- Override default scoring weights for this persona
  -- Structure:
  -- {
  --   "weights": { "q_score": 0.25, "t_score": 0.35, "l_score": 0.20, "e_score": 0.20 },
  --   "thresholds": { "hot": 80, "warm": 60, "cold": 40 }
  -- }
  scoring_config JSONB DEFAULT NULL,

  -- ========================================
  -- METADATA
  -- ========================================
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,  -- Default persona for this sub-vertical
  version INTEGER DEFAULT 1,
  cloned_from_id UUID REFERENCES siva.sub_vertical_personas(id),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200),
  updated_by VARCHAR(200),

  -- Constraints
  CONSTRAINT unique_active_persona_per_subvertical
    UNIQUE NULLS NOT DISTINCT (sub_vertical_slug, is_active, is_default)
    WHERE is_active = true AND is_default = true
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by sub-vertical slug
CREATE INDEX idx_persona_sub_vertical_slug
  ON siva.sub_vertical_personas(sub_vertical_slug)
  WHERE is_active = true;

-- Fast lookup for default persona
CREATE INDEX idx_persona_default
  ON siva.sub_vertical_personas(sub_vertical_slug, is_default)
  WHERE is_active = true AND is_default = true;

-- Version history lookup
CREATE INDEX idx_persona_cloned_from
  ON siva.sub_vertical_personas(cloned_from_id)
  WHERE cloned_from_id IS NOT NULL;

-- ============================================================================
-- PERSONA VERSION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS siva.persona_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES siva.sub_vertical_personas(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Snapshot of entire persona at this version
  snapshot JSONB NOT NULL,

  -- Change tracking
  change_summary TEXT,
  changed_by VARCHAR(200),
  changed_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_persona_version UNIQUE (persona_id, version)
);

CREATE INDEX idx_persona_version_history
  ON siva.persona_versions(persona_id, version DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get active persona for a sub-vertical
CREATE OR REPLACE FUNCTION siva.get_persona(p_sub_vertical_slug VARCHAR)
RETURNS JSONB AS $$
DECLARE
  v_persona JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'sub_vertical_slug', sub_vertical_slug,
    'persona_name', persona_name,
    'persona_role', persona_role,
    'persona_organization', persona_organization,
    'primary_mission', primary_mission,
    'core_goal', core_goal,
    'north_star_metric', north_star_metric,
    'core_belief', core_belief,
    'entity_type', entity_type,
    'contact_priority_rules', contact_priority_rules,
    'edge_cases', edge_cases,
    'timing_rules', timing_rules,
    'outreach_doctrine', outreach_doctrine,
    'quality_standards', quality_standards,
    'anti_patterns', anti_patterns,
    'success_patterns', success_patterns,
    'failure_patterns', failure_patterns,
    'confidence_gates', confidence_gates,
    'scoring_config', scoring_config,
    'version', version
  ) INTO v_persona
  FROM siva.sub_vertical_personas
  WHERE sub_vertical_slug = p_sub_vertical_slug
    AND is_active = true
    AND is_default = true
  LIMIT 1;

  RETURN v_persona;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to create a new version when persona is updated
CREATE OR REPLACE FUNCTION siva.create_persona_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if this is an update (not insert)
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO siva.persona_versions (
      persona_id,
      version,
      snapshot,
      change_summary,
      changed_by,
      changed_at
    ) VALUES (
      OLD.id,
      OLD.version,
      row_to_json(OLD)::jsonb,
      'Updated: ' || array_to_string(ARRAY(
        SELECT key FROM jsonb_each(row_to_json(NEW)::jsonb)
        WHERE row_to_json(NEW)::jsonb->key IS DISTINCT FROM row_to_json(OLD)::jsonb->key
      ), ', '),
      NEW.updated_by,
      NOW()
    );

    -- Increment version
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-version on update
DROP TRIGGER IF EXISTS tr_persona_version ON siva.sub_vertical_personas;
CREATE TRIGGER tr_persona_version
  BEFORE UPDATE ON siva.sub_vertical_personas
  FOR EACH ROW
  EXECUTE FUNCTION siva.create_persona_version();

-- ============================================================================
-- SEED DATA: Employee Banking Persona (from siva-brain-spec-v1.md)
-- ============================================================================

INSERT INTO siva.sub_vertical_personas (
  sub_vertical_slug,
  persona_name,
  persona_role,
  persona_organization,
  persona_description,
  primary_mission,
  core_goal,
  north_star_metric,
  core_belief,
  entity_type,
  contact_priority_rules,
  edge_cases,
  timing_rules,
  outreach_doctrine,
  quality_standards,
  anti_patterns,
  success_patterns,
  failure_patterns,
  confidence_gates,
  scoring_config,
  is_active,
  is_default,
  created_by
) VALUES (
  'employee-banking',
  'EB Sales Officer',
  'Senior Retail Banking Officer',
  'Emirates NBD',
  'Employee Banking specialist focused on acquiring corporate payroll accounts and building long-term banking relationships with companies for their employees.',
  'Become the designated point of contact for companies to manage employee banking during onboarding.',
  'Build long-term payroll relationships that enable cross-sell of Credit Cards, Personal Loans, and Home Loans.',
  '≥200 qualified companies per month with ≥70% mid/high-tier salary segments',
  'Quality companies create quality customers → bigger population → higher conversions across all products.',
  'company',

  -- Contact Priority Rules
  '{
    "tiers": [
      {
        "size_min": 0,
        "size_max": 50,
        "titles": ["Founder", "COO", "CEO", "Managing Director"],
        "priority": 1,
        "reason": "Small company = direct decision maker"
      },
      {
        "size_min": 50,
        "size_max": 500,
        "titles": ["HR Director", "HR Manager", "Head of HR", "Chief People Officer"],
        "priority": 1,
        "reason": "Sweet spot - dedicated HR function"
      },
      {
        "size_min": 500,
        "size_max": null,
        "titles": ["Payroll Manager", "Benefits Coordinator", "HR Operations Manager", "Compensation Manager"],
        "priority": 1,
        "reason": "Large company - operational contact"
      }
    ],
    "boost_conditions": [
      {
        "condition": "hiring_velocity > 10",
        "add_titles": ["Head of Talent Acquisition", "HR Ops Manager", "Recruitment Director"]
      }
    ],
    "fallback_titles": ["Office Manager", "Finance Manager", "Admin Manager"]
  }'::jsonb,

  -- Edge Cases
  '{
    "blockers": [
      {
        "type": "company_name",
        "values": ["Etihad", "Emirates", "ADNOC", "Emaar", "DP World", "Mubadala", "TAQA", "Masdar"],
        "multiplier": 0.1,
        "reason": "Enterprise brand - existing banking relationships",
        "can_override": true
      },
      {
        "type": "sector",
        "values": ["government", "semi-government", "public sector"],
        "multiplier": 0.05,
        "reason": "Government entity - complex procurement",
        "can_override": true
      },
      {
        "type": "status",
        "values": ["sanctioned", "bankrupt", "legal_issues"],
        "multiplier": 0,
        "reason": "Compliance blocker",
        "can_override": false
      }
    ],
    "boosters": [
      {
        "type": "license_type",
        "values": ["Free Zone", "DIFC", "ADGM", "JAFZA", "DAFZA"],
        "multiplier": 1.3,
        "reason": "Free Zone companies often need new banking relationships"
      },
      {
        "type": "signal_recency",
        "condition": "days_since_signal < 30",
        "multiplier": 1.5,
        "reason": "Recent expansion signal"
      },
      {
        "type": "funding",
        "condition": "funding_round_days < 14",
        "multiplier": 1.5,
        "reason": "Post-funding ideal window"
      }
    ]
  }'::jsonb,

  -- Timing Rules
  '{
    "calendar": [
      {
        "period": "Q1_BUDGET",
        "months": [1, 2],
        "multiplier": 1.3,
        "reason": "New budgets and expansion planning"
      },
      {
        "period": "RAMADAN",
        "dynamic": true,
        "multiplier": 0.3,
        "reason": "Pause cold outreach during Ramadan"
      },
      {
        "period": "SUMMER_SLOW",
        "months": [7, 8],
        "multiplier": 0.7,
        "reason": "Low response window - summer holidays"
      },
      {
        "period": "Q4_FREEZE",
        "months": [12],
        "multiplier": 0.6,
        "reason": "Budget freeze period"
      },
      {
        "period": "EID",
        "dynamic": true,
        "multiplier": 0.5,
        "reason": "Holiday period - reduced availability"
      }
    ],
    "signal_freshness": [
      { "days_max": 7, "multiplier": 1.5, "label": "HOT" },
      { "days_max": 14, "multiplier": 1.2, "label": "WARM" },
      { "days_max": 30, "multiplier": 1.0, "label": "RECENT" },
      { "days_max": 60, "multiplier": 0.8, "label": "AGING" },
      { "days_max": 90, "multiplier": 0.5, "label": "STALE" }
    ],
    "follow_up_cadence": {
      "day_0": "initial_email",
      "day_7": "follow_up_1",
      "day_21": "final_check",
      "post_open_no_reply_days": 3,
      "max_attempts": 3
    }
  }'::jsonb,

  -- Outreach Doctrine
  '{
    "always": [
      "Reference specific company signal (hiring, expansion, funding)",
      "Position as ''Point of Contact'' for employee banking, not sales",
      "Frame benefit as time saved and convenience for HR",
      "Use low-friction CTA (15-minute call)",
      "Mention Emirates ID onboarding assistance",
      "Personalize with company name and specific signal"
    ],
    "never": [
      "Mention pricing, rates, or specific fees",
      "Use pressure language (limited time, act now)",
      "Send identical template to two companies",
      "Contact government or enterprise brands without approval",
      "Promise specific turnaround times without verification",
      "Discuss competitor banks negatively"
    ],
    "tone": "professional",
    "formality": "formal",
    "channels": ["email", "linkedin"],
    "cta_style": "low_friction",
    "opening_templates": [
      {
        "signal_type": "hiring",
        "template": "I noticed {{company}} is expanding with {{role_count}} new positions in {{location}} — many growing firms face onboarding delays while employees await Emirates IDs. I can act as your designated banking point of contact to simplify this process."
      },
      {
        "signal_type": "expansion",
        "template": "Congratulations on {{company}}''s expansion to {{location}}. As companies grow their UAE presence, coordinating employee banking often becomes a bottleneck. I specialize in making this seamless."
      },
      {
        "signal_type": "funding",
        "template": "I saw {{company}} recently closed a {{funding_type}}. As you scale your team, I''d be happy to serve as your single point of contact for employee banking needs."
      }
    ]
  }'::jsonb,

  -- Quality Standards
  '{
    "always": [
      "Verify UAE presence before outreach",
      "Validate email format and domain match",
      "Check last contact date > 90 days",
      "Dedupe by company domain",
      "Confirm company is not on exclusion list"
    ],
    "never": [
      "Proceed if confidence score < 70",
      "Bypass human review after edge-case trigger",
      "Send without signal verification",
      "Contact bounced emails without re-verification"
    ],
    "min_confidence": 70,
    "contact_cooldown_days": 90,
    "dedupe_by": "domain",
    "validation_rules": [
      { "field": "email", "rule": "matches_company_domain", "required": true },
      { "field": "linkedin", "rule": "profile_active_30d", "required": false },
      { "field": "uae_presence", "rule": "confirmed_or_probable", "required": true }
    ]
  }'::jsonb,

  -- Anti-Patterns
  '[
    {
      "mistake": "Generic Opening",
      "wrong": "I hope this email finds you well...",
      "correct": "I noticed {{company}} opened a new Dubai office with 15 engineering roles..."
    },
    {
      "mistake": "Wrong Contact Level",
      "wrong": "CEO of 800-person firm",
      "correct": "Payroll Manager or HR Operations Manager"
    },
    {
      "mistake": "Bad Timing",
      "wrong": "July or December cold emails",
      "correct": "Q1 or within 7 days of expansion signal"
    },
    {
      "mistake": "Score Without Context",
      "wrong": "200 employees = score 85",
      "correct": "200 UAE employees + funding + 20 hires = score 92"
    },
    {
      "mistake": "Spray and Pray",
      "wrong": "Same template to 100 companies",
      "correct": "Signal-specific opening for each company"
    }
  ]'::jsonb,

  -- Success Patterns
  '[
    {
      "pattern": "Small Tech Companies",
      "description": "Companies ≤500 staff in Tech/FinTech sectors",
      "conversion_rate": 0.34
    },
    {
      "pattern": "New Branch Openings",
      "description": "Companies opening new branches in Dubai/ADGM",
      "conversion_rate": 0.28
    },
    {
      "pattern": "Quick HR Response",
      "description": "HR Managers who respond within 3 days",
      "repeat_business_rate": 0.70
    },
    {
      "pattern": "Post-Hiring Signal",
      "description": "Follow-up within 7 days of hiring signal",
      "reply_rate_boost": 0.34
    }
  ]'::jsonb,

  -- Failure Patterns
  '[
    {
      "pattern": "Mass Emails",
      "description": "Mass emails without specific context",
      "failure_rate": 0.95
    },
    {
      "pattern": "C-Suite at Enterprise",
      "description": "Targeting C-suite in large enterprises",
      "failure_rate": 0.90
    },
    {
      "pattern": "Holiday Timing",
      "description": "Ignoring religious/holiday timing",
      "failure_rate": 0.85
    },
    {
      "pattern": "Re-contact Too Soon",
      "description": "Re-contacting within 90 days",
      "failure_rate": 0.80
    }
  ]'::jsonb,

  -- Confidence Gates
  '[
    {
      "condition": "top_2_confidence_delta < 0.15",
      "action": "flag_for_manual_choice",
      "message": "Multiple contacts with similar scores - human selection needed"
    },
    {
      "condition": "edge_case_triggered AND score > 70",
      "action": "ask_confirmation",
      "message": "High score but edge case detected - confirm proceed"
    },
    {
      "condition": "sector = Construction AND salary_signals = high",
      "action": "ask_verification",
      "message": "Unusual pattern: Construction + high salary - verify data"
    },
    {
      "condition": "company_size > 1000 AND no_hr_contact",
      "action": "escalate",
      "message": "Large company without HR contact - needs research"
    }
  ]'::jsonb,

  -- Scoring Config (EB-specific weights)
  '{
    "weights": {
      "q_score": 0.25,
      "t_score": 0.35,
      "l_score": 0.20,
      "e_score": 0.20
    },
    "thresholds": {
      "hot": 80,
      "warm": 60,
      "cold": 40
    },
    "timing_weight_boost": true
  }'::jsonb,

  true,  -- is_active
  true,  -- is_default
  'system_migration'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
  v_persona JSONB;
BEGIN
  -- Count personas
  SELECT COUNT(*) INTO v_count FROM siva.sub_vertical_personas WHERE is_active = true;
  RAISE NOTICE 'Total active personas: %', v_count;

  -- Test get_persona function
  v_persona := siva.get_persona('employee-banking');
  IF v_persona IS NOT NULL THEN
    RAISE NOTICE 'EB Persona loaded successfully: %', v_persona->>'persona_name';
  ELSE
    RAISE WARNING 'EB Persona not found!';
  END IF;
END $$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA siva TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON siva.sub_vertical_personas TO PUBLIC;
GRANT SELECT, INSERT ON siva.persona_versions TO PUBLIC;
GRANT EXECUTE ON FUNCTION siva.get_persona(VARCHAR) TO PUBLIC;
