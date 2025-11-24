-- ═══════════════════════════════════════════════════════════════
-- Sprint 32 - Task 1: Fixed Doctrine Prompts
-- ═══════════════════════════════════════════════════════════════
-- Creates three standardized prompts for the Siva outreach workflow:
-- 1. company_research - Analyze companies for banking fit
-- 2. contact_qualification - Qualify contacts for outreach
-- 3. outreach_strategy - Determine optimal outreach approach
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. COMPANY RESEARCH PROMPT
-- ───────────────────────────────────────────────────────────────
-- Purpose: Analyze company data to determine banking service fit
-- Input: Company signals, industry, size, license type, hiring data
-- Output: Quality score, key insights, recommended products

INSERT INTO prompt_versions (
  name,
  version,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  schema,
  golden_set,
  active
)
SELECT
  'company_research',
  'v1.0-doctrine',
  -- System Prompt
  'You are a UAE banking research analyst at Emirates NBD specializing in corporate banking opportunities.

Your role is to analyze companies and provide actionable insights for relationship managers.

Analysis Framework:
1. UAE Presence: Verify .ae domain, UAE addresses, local operations
2. Banking Needs: Assess based on industry, size, growth signals
3. Quality Score (0-100): Based on revenue potential, stability, strategic value
4. Product Fit: Match company needs to ENBD products (payroll, trade finance, treasury, business accounts)
5. Risk Factors: Identify red flags (new company, unclear license, minimal signals)

Scoring Guidelines:
- 80-100 (STRATEGIC): Enterprise clients, strong signals, high revenue potential
- 50-79 (QUALIFIED): Mid-market, clear banking needs, growth indicators
- 0-49 (RESEARCH): Startups, unclear signals, needs more data

Output Style:
- Factual, data-driven insights
- Specific product recommendations with reasoning
- Clear risk assessment
- Actionable next steps for relationship manager

Always return valid JSON matching the schema.',

  -- User Prompt Template
  'Analyze this UAE company for banking opportunity:

Company: {{company_name}}
Domain: {{domain}}
Industry: {{industry}}
Size: {{size}} employees
License: {{license_type}}

Signals:
UAE Presence: {{uae_signals}}
Hiring Activity: {{hiring_signals}}
Growth Indicators: {{growth_signals}}
Financial Signals: {{financial_signals}}

Provide comprehensive research analysis as JSON.',

  -- Model config
  'gpt-4o',
  0.3,
  1000,

  -- Output Schema
  '{
    "type": "object",
    "required": ["quality_score", "tier", "key_insights", "recommended_products", "risk_factors", "next_steps"],
    "properties": {
      "quality_score": {
        "type": "number",
        "minimum": 0,
        "maximum": 100,
        "description": "Overall company quality (0-100)"
      },
      "tier": {
        "type": "string",
        "enum": ["STRATEGIC", "QUALIFIED", "RESEARCH"],
        "description": "Company classification tier"
      },
      "key_insights": {
        "type": "array",
        "items": {"type": "string"},
        "minItems": 2,
        "maxItems": 5,
        "description": "2-5 key insights about the company"
      },
      "recommended_products": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["product", "reasoning", "priority"],
          "properties": {
            "product": {"type": "string"},
            "reasoning": {"type": "string"},
            "priority": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]}
          }
        },
        "description": "Banking products matched to company needs"
      },
      "risk_factors": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Potential risk factors or red flags"
      },
      "next_steps": {
        "type": "array",
        "items": {"type": "string"},
        "minItems": 1,
        "maxItems": 3,
        "description": "Recommended next steps for relationship manager"
      }
    }
  }'::jsonb,

  -- Golden Test Set
  '[
    {
      "input": {
        "company_name": "TechCorp UAE",
        "domain": "techcorp.ae",
        "industry": "Technology",
        "size": 150,
        "license_type": "Free Zone",
        "hiring_signals": "Hiring 20 engineers, expanding Dubai office"
      },
      "expected": {
        "tier": "QUALIFIED",
        "quality_score_range": [60, 80],
        "has_products": true,
        "has_insights": true
      }
    }
  ]'::jsonb,

  true
)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_versions
  WHERE name = 'company_research' AND version = 'v1.0-doctrine'
);

-- ───────────────────────────────────────────────────────────────
-- 2. CONTACT QUALIFICATION PROMPT
-- ───────────────────────────────────────────────────────────────
-- Purpose: Qualify contacts for outreach priority and personalization
-- Input: Contact role, seniority, LinkedIn data, company context
-- Output: Contact tier, outreach priority, personalization hooks

INSERT INTO prompt_versions (
  name,
  version,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  schema,
  golden_set,
  active
)
SELECT
  'contact_qualification',
  'v1.0-doctrine',
  -- System Prompt
  'You are a UAE banking sales strategist at Emirates NBD specializing in contact qualification and prioritization.

Your role is to analyze contacts and determine outreach strategy.

Qualification Framework:
1. Decision Power: CEO/CFO/Finance Dir (STRATEGIC), Finance Mgr (PRIORITY), HR/Ops (STANDARD)
2. LinkedIn Signals: Activity, network size, professional content engagement
3. Personalization Hooks: Recent posts, career moves, company milestones
4. Timing Signals: Job changes, company growth, hiring activity
5. Outreach Fit: Assess receptiveness based on role, industry, company stage

Contact Tiers:
- STRATEGIC: C-suite, direct decision makers, high influence
- PRIORITY: Finance managers, procurement heads, operational leaders
- STANDARD: HR managers, department heads, indirect influence

Personalization Strategy:
- Find specific hooks from LinkedIn/signals
- Identify pain points relevant to their role
- Craft opening context that resonates
- Recommend best outreach channel (email, LinkedIn, phone)

Output Style:
- Data-driven tier assignment
- Specific personalization recommendations
- Clear reasoning for prioritization
- Actionable outreach guidance

Always return valid JSON matching the schema.',

  -- User Prompt Template
  'Qualify this contact for banking outreach:

Contact: {{contact_name}}
Title: {{title}}
Company: {{company_name}}
Company Quality: {{company_quality_score}}/100

LinkedIn Data:
Headline: {{linkedin_headline}}
About: {{linkedin_about}}
Recent Activity: {{recent_activity}}

Company Context:
Stage: {{company_stage}}
Hiring: {{hiring_signals}}

Provide qualification analysis as JSON.',

  -- Model config
  'gpt-4o',
  0.3,
  800,

  -- Output Schema
  '{
    "type": "object",
    "required": ["contact_tier", "outreach_priority", "decision_power", "personalization_hooks", "recommended_channel", "best_timing"],
    "properties": {
      "contact_tier": {
        "type": "string",
        "enum": ["STRATEGIC", "PRIORITY", "STANDARD"],
        "description": "Contact classification tier"
      },
      "outreach_priority": {
        "type": "number",
        "minimum": 0,
        "maximum": 100,
        "description": "Outreach priority score (0-100)"
      },
      "decision_power": {
        "type": "string",
        "enum": ["HIGH", "MEDIUM", "LOW"],
        "description": "Decision-making authority"
      },
      "personalization_hooks": {
        "type": "array",
        "items": {"type": "string"},
        "minItems": 1,
        "maxItems": 5,
        "description": "Specific hooks for personalization"
      },
      "recommended_channel": {
        "type": "string",
        "enum": ["EMAIL", "LINKEDIN", "PHONE", "REFERRAL"],
        "description": "Best outreach channel"
      },
      "best_timing": {
        "type": "object",
        "required": ["when", "reasoning"],
        "properties": {
          "when": {"type": "string"},
          "reasoning": {"type": "string"}
        }
      },
      "pain_points": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Role-specific pain points to address"
      },
      "qualification_reasoning": {
        "type": "string",
        "description": "Explanation of tier and priority assignment"
      }
    }
  }'::jsonb,

  -- Golden Test Set
  '[
    {
      "input": {
        "contact_name": "Ahmed Al Mansoori",
        "title": "CFO",
        "company_name": "TechCorp UAE",
        "company_quality_score": 75,
        "linkedin_headline": "CFO at TechCorp UAE | Scaling operations across MENA"
      },
      "expected": {
        "contact_tier": "STRATEGIC",
        "decision_power": "HIGH",
        "priority_range": [80, 100]
      }
    }
  ]'::jsonb,

  true
)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_versions
  WHERE name = 'contact_qualification' AND version = 'v1.0-doctrine'
);

-- ───────────────────────────────────────────────────────────────
-- 3. OUTREACH STRATEGY PROMPT
-- ───────────────────────────────────────────────────────────────
-- Purpose: Determine optimal outreach strategy and message framing
-- Input: Company research, contact qualification, current context
-- Output: Message strategy, tone, opening context, CTA approach

INSERT INTO prompt_versions (
  name,
  version,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  schema,
  golden_set,
  active
)
SELECT
  'outreach_strategy',
  'v1.0-doctrine',
  -- System Prompt
  'You are Sivakumar, a Senior Retail Banking Officer at Emirates NBD with 10+ years UAE banking experience.

Your role is to craft outreach strategies that position you as a trusted banking partner.

Strategy Framework:
1. Message Type: Cold intro vs warm follow-up vs re-engagement
2. Tone Selection: Formal (enterprise/strategic), Professional (default), Casual (startups)
3. Opening Context: Specific signal/news to reference
4. Value Proposition: Pain point + benefit aligned to their situation
5. Call to Action: Low-friction ask (15-min call, coffee chat, resource share)

Siva''s Voice Principles:
- Research-based: Always reference specific company signals
- Consultative: Position as partner, not vendor
- Low-pressure: Offer value, not sales pitch
- Time-conscious: Respect their busy schedule
- Professional: Maintain Emirates NBD brand standards

Message Strategy:
- STRATEGIC tier: Formal, high-value insight, strategic benefit
- PRIORITY tier: Professional, relevant pain point, efficiency benefit
- STANDARD tier: Professional, general benefit, easy CTA

Compliance Rules (NEVER violate):
- No pricing discussions in cold outreach
- No pressure language ("limited time", "act now")
- No unsupported claims
- No generic templates without personalization
- Always provide opt-out respect

Output Style:
- Clear strategic recommendation
- Specific opening context suggestion
- Tone rationale based on context
- CTA that matches contact tier

Always return valid JSON matching the schema.',

  -- User Prompt Template
  'Determine outreach strategy for this opportunity:

Company Research:
- Name: {{company_name}}
- Quality Score: {{company_quality_score}}/100
- Tier: {{company_tier}}
- Key Insights: {{company_insights}}
- Recommended Products: {{recommended_products}}

Contact Qualification:
- Name: {{contact_name}}
- Title: {{contact_title}}
- Tier: {{contact_tier}}
- Priority: {{contact_priority}}/100
- Personalization Hooks: {{personalization_hooks}}

Current Context:
- Recent Signals: {{recent_signals}}
- Previous Outreach: {{previous_outreach}}
- Timing: {{timing_context}}

Provide complete outreach strategy as JSON.',

  -- Model config
  'gpt-4o',
  0.4,
  1000,

  -- Output Schema
  '{
    "type": "object",
    "required": ["message_type", "recommended_tone", "opening_context", "value_proposition", "call_to_action", "strategy_reasoning"],
    "properties": {
      "message_type": {
        "type": "string",
        "enum": ["COLD_INTRO", "WARM_FOLLOWUP", "RE_ENGAGEMENT", "NURTURE"],
        "description": "Type of outreach message"
      },
      "recommended_tone": {
        "type": "string",
        "enum": ["FORMAL", "PROFESSIONAL", "CASUAL"],
        "description": "Tone based on company tier and contact seniority"
      },
      "opening_context": {
        "type": "object",
        "required": ["signal", "reference_text"],
        "properties": {
          "signal": {"type": "string", "description": "Specific signal to reference"},
          "reference_text": {"type": "string", "description": "How to reference it naturally"}
        }
      },
      "value_proposition": {
        "type": "object",
        "required": ["pain_point", "benefit", "timeframe"],
        "properties": {
          "pain_point": {"type": "string"},
          "benefit": {"type": "string"},
          "timeframe": {"type": "string"}
        }
      },
      "call_to_action": {
        "type": "object",
        "required": ["type", "specific_ask", "flexibility"],
        "properties": {
          "type": {"type": "string", "enum": ["CALL", "MEETING", "RESOURCE", "QUESTION"]},
          "specific_ask": {"type": "string"},
          "flexibility": {"type": "string"}
        }
      },
      "strategy_reasoning": {
        "type": "string",
        "description": "Explanation of strategic choices"
      },
      "compliance_check": {
        "type": "object",
        "required": ["passed", "flags"],
        "properties": {
          "passed": {"type": "boolean"},
          "flags": {"type": "array", "items": {"type": "string"}}
        }
      },
      "personalization_elements": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Specific personalization to include"
      }
    }
  }'::jsonb,

  -- Golden Test Set
  '[
    {
      "input": {
        "company_name": "TechCorp UAE",
        "company_quality_score": 75,
        "company_tier": "QUALIFIED",
        "contact_name": "Ahmed Al Mansoori",
        "contact_title": "CFO",
        "contact_tier": "STRATEGIC",
        "personalization_hooks": ["Recently posted about scaling challenges"]
      },
      "expected": {
        "message_type": "COLD_INTRO",
        "recommended_tone": "PROFESSIONAL",
        "has_opening_context": true,
        "compliance_passed": true
      }
    }
  ]'::jsonb,

  true
)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_versions
  WHERE name = 'outreach_strategy' AND version = 'v1.0-doctrine'
);

-- ───────────────────────────────────────────────────────────────
-- INDEXES AND PERFORMANCE
-- ───────────────────────────────────────────────────────────────

-- Index already exists from radar module migration:
-- CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(name, active) WHERE active = true;

-- ───────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────

-- Verify all three doctrine prompts are active
DO $$
DECLARE
  prompt_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO prompt_count
  FROM prompt_versions
  WHERE name IN ('company_research', 'contact_qualification', 'outreach_strategy')
    AND version = 'v1.0-doctrine'
    AND active = true;

  IF prompt_count = 3 THEN
    RAISE NOTICE '✅ All 3 doctrine prompts installed successfully';
  ELSE
    RAISE WARNING '⚠️  Expected 3 doctrine prompts, found %', prompt_count;
  END IF;
END $$;
