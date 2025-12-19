-- =============================================================================
-- OS CONTROL PLANE SCHEMA
-- Migration: 008_os_control_plane.sql
-- Purpose: Authoritative control plane tables for OS runtime configuration
-- Rule: OS tables are source of truth. SaaS never holds config as "its own truth".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OS VERTICALS
-- Top-level industry/sector (e.g., saas_sales, banking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,                    -- e.g., 'saas_sales'
    name VARCHAR(200) NOT NULL,                          -- e.g., 'SaaS Sales'
    entity_type VARCHAR(50) NOT NULL,                    -- 'deal' | 'company' | 'individual'
    region_scope JSONB NOT NULL DEFAULT '["US"]',        -- Allowed regions
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_entity_type CHECK (entity_type IN ('deal', 'company', 'individual'))
);

-- -----------------------------------------------------------------------------
-- 2. OS SUB-VERTICALS
-- Specific function/role within a vertical (e.g., deal_evaluation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_sub_verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id UUID NOT NULL REFERENCES os_verticals(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,                           -- e.g., 'deal_evaluation'
    name VARCHAR(200) NOT NULL,                          -- e.g., 'Deal Evaluation'
    default_agent VARCHAR(100) NOT NULL,                 -- Required: agent type to use
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vertical_id, key)
);

-- -----------------------------------------------------------------------------
-- 3. OS PERSONAS
-- The "brain" configuration for SIVA - controls reasoning and behavior
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_vertical_id UUID NOT NULL REFERENCES os_sub_verticals(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,                           -- e.g., 'skeptical_cfo'
    name VARCHAR(200) NOT NULL,                          -- e.g., 'Skeptical CFO'
    mission TEXT,                                        -- Core mission statement
    decision_lens TEXT,                                  -- How this persona evaluates
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sub_vertical_id, key)
);

-- -----------------------------------------------------------------------------
-- 4. OS PERSONA POLICIES
-- Granular policy controls for SIVA behavior (PRD-required envelope fields)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_persona_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES os_personas(id) ON DELETE CASCADE,
    policy_version INTEGER DEFAULT 1,                    -- Increment on update

    -- SIVA Intent Controls
    allowed_intents JSONB NOT NULL DEFAULT '[]',         -- What SIVA can do
    forbidden_outputs JSONB NOT NULL DEFAULT '[]',       -- What SIVA must never output
    allowed_tools JSONB NOT NULL DEFAULT '[]',           -- Tools SIVA can invoke

    -- Scope Controls
    evidence_scope JSONB DEFAULT '{}',                   -- Data SIVA can access
    memory_scope JSONB DEFAULT '{}',                     -- Context persistence rules

    -- Resource Budgets
    cost_budget JSONB DEFAULT '{}',                      -- LLM cost limits
    latency_budget JSONB DEFAULT '{}',                   -- Response time limits

    -- Operational Rules
    escalation_rules JSONB DEFAULT '{}',                 -- When to escalate to human
    disclaimer_rules JSONB DEFAULT '{}',                 -- Required disclaimers

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(persona_id)
);

-- -----------------------------------------------------------------------------
-- 5. OS WORKSPACE BINDINGS
-- Links a tenant's workspace to a specific vertical/sub-vertical/persona
-- This is what resolve-config uses at runtime
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_workspace_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,                             -- From SaaS tenants table
    workspace_id VARCHAR(100) NOT NULL,                  -- Workspace identifier
    vertical_id UUID NOT NULL REFERENCES os_verticals(id),
    sub_vertical_id UUID NOT NULL REFERENCES os_sub_verticals(id),
    persona_id UUID NOT NULL REFERENCES os_personas(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id)
);

-- -----------------------------------------------------------------------------
-- 6. OS CONTROL PLANE AUDIT
-- Every write operation is logged here for compliance and debugging
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_controlplane_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user VARCHAR(255) NOT NULL,                    -- Email of who made the change
    action VARCHAR(100) NOT NULL,                        -- create_vertical, update_policy, etc.
    target_type VARCHAR(100) NOT NULL,                   -- vertical, sub_vertical, persona, policy, binding
    target_id UUID,                                      -- ID of affected row
    request_json JSONB,                                  -- Full request payload
    result_json JSONB,                                   -- Result or error
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- INDEXES for performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_os_sub_verticals_vertical ON os_sub_verticals(vertical_id);
CREATE INDEX IF NOT EXISTS idx_os_personas_sub_vertical ON os_personas(sub_vertical_id);
CREATE INDEX IF NOT EXISTS idx_os_persona_policies_persona ON os_persona_policies(persona_id);
CREATE INDEX IF NOT EXISTS idx_os_workspace_bindings_tenant ON os_workspace_bindings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_os_workspace_bindings_lookup ON os_workspace_bindings(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_os_controlplane_audit_actor ON os_controlplane_audit(actor_user);
CREATE INDEX IF NOT EXISTS idx_os_controlplane_audit_target ON os_controlplane_audit(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_os_controlplane_audit_time ON os_controlplane_audit(created_at DESC);

-- -----------------------------------------------------------------------------
-- TRIGGERS for updated_at auto-update
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_os_verticals_updated ON os_verticals;
CREATE TRIGGER trg_os_verticals_updated
    BEFORE UPDATE ON os_verticals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_os_sub_verticals_updated ON os_sub_verticals;
CREATE TRIGGER trg_os_sub_verticals_updated
    BEFORE UPDATE ON os_sub_verticals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_os_personas_updated ON os_personas;
CREATE TRIGGER trg_os_personas_updated
    BEFORE UPDATE ON os_personas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_os_persona_policies_updated ON os_persona_policies;
CREATE TRIGGER trg_os_persona_policies_updated
    BEFORE UPDATE ON os_persona_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_os_workspace_bindings_updated ON os_workspace_bindings;
CREATE TRIGGER trg_os_workspace_bindings_updated
    BEFORE UPDATE ON os_workspace_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- TRIGGER for policy_version auto-increment
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_policy_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.policy_version = COALESCE(OLD.policy_version, 0) + 1;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_os_persona_policies_version ON os_persona_policies;
CREATE TRIGGER trg_os_persona_policies_version
    BEFORE UPDATE ON os_persona_policies
    FOR EACH ROW EXECUTE FUNCTION increment_policy_version();

-- -----------------------------------------------------------------------------
-- SEED DATA: SaaS Sales Vertical with Skeptical CFO Persona
-- -----------------------------------------------------------------------------

-- Insert SaaS Sales vertical
INSERT INTO os_verticals (key, name, entity_type, region_scope, is_active)
VALUES ('saas_sales', 'SaaS Sales', 'deal', '["US"]', true)
ON CONFLICT (key) DO NOTHING;

-- Insert Deal Evaluation sub-vertical
INSERT INTO os_sub_verticals (vertical_id, key, name, default_agent, is_active)
SELECT v.id, 'deal_evaluation', 'Deal Evaluation', 'deal-evaluation', true
FROM os_verticals v WHERE v.key = 'saas_sales'
ON CONFLICT (vertical_id, key) DO NOTHING;

-- Insert Skeptical CFO persona
INSERT INTO os_personas (sub_vertical_id, key, name, mission, decision_lens, is_active)
SELECT sv.id,
    'skeptical_cfo',
    'Skeptical CFO',
    'Protect the company from bad deals. Every dollar spent must have clear ROI justification.',
    'Assume every deal is risky until proven otherwise. Look for red flags, validate claims, question optimism.',
    true
FROM os_sub_verticals sv
JOIN os_verticals v ON sv.vertical_id = v.id
WHERE v.key = 'saas_sales' AND sv.key = 'deal_evaluation'
ON CONFLICT (sub_vertical_id, key) DO NOTHING;

-- Insert default persona policy for Skeptical CFO
INSERT INTO os_persona_policies (
    persona_id,
    policy_version,
    allowed_intents,
    forbidden_outputs,
    allowed_tools,
    evidence_scope,
    memory_scope,
    cost_budget,
    latency_budget,
    escalation_rules,
    disclaimer_rules
)
SELECT p.id,
    1,
    '["evaluate_deal", "assess_risk", "provide_verdict", "explain_reasoning"]'::JSONB,
    '["approve_without_evidence", "ignore_red_flags", "make_promises", "guarantee_outcomes"]'::JSONB,
    '["web_search", "company_lookup", "financial_analysis", "risk_assessment"]'::JSONB,
    '{"sources": ["crunchbase", "linkedin", "news", "financials"], "max_depth": 3}'::JSONB,
    '{"session_context": true, "cross_session": false}'::JSONB,
    '{"max_tokens_per_query": 4000, "max_queries_per_session": 10}'::JSONB,
    '{"target_ms": 5000, "max_ms": 15000}'::JSONB,
    '{"on_high_risk": "require_human_review", "on_large_deal": "flag_for_approval"}'::JSONB,
    '{"always_show": ["This is an AI assessment", "Not financial advice"], "on_verdict": ["Final decision rests with humans"]}'::JSONB
FROM os_personas p
JOIN os_sub_verticals sv ON p.sub_vertical_id = sv.id
JOIN os_verticals v ON sv.vertical_id = v.id
WHERE v.key = 'saas_sales' AND sv.key = 'deal_evaluation' AND p.key = 'skeptical_cfo'
ON CONFLICT (persona_id) DO NOTHING;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
