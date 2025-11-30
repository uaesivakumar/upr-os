-- ============================================================================
-- JOURNEY ENGINE COMPLETE SYSTEM
-- Sprints: S58 (Core) + S59 (Steps) + S60 (Templates) + S61 (Monitoring)
-- ============================================================================
-- This migration creates a unified schema for the entire Journey Engine system.
-- Doing all 4 sprints together ensures:
--   1. No double work / schema rewrites
--   2. Deterministic behavior from the start
--   3. Unified test environment
--   4. Zero technical debt
-- ============================================================================

-- ============================================================================
-- S58: JOURNEY ENGINE CORE TABLES
-- ============================================================================

-- Journey Definitions (the blueprint)
CREATE TABLE IF NOT EXISTS journey_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,

    -- Definition structure
    initial_state VARCHAR(100) NOT NULL DEFAULT 'pending',
    states JSONB NOT NULL DEFAULT '[]',
    transitions JSONB NOT NULL DEFAULT '[]',
    steps JSONB NOT NULL DEFAULT '[]',

    -- Preconditions & validation
    preconditions JSONB DEFAULT '[]',
    validators JSONB DEFAULT '[]',

    -- Context requirements
    required_context JSONB DEFAULT '[]',
    optional_context JSONB DEFAULT '[]',

    -- Vertical/territory binding (optional)
    vertical_slug VARCHAR(100),
    territory_code VARCHAR(50),

    -- Metadata
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    tags JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),

    CONSTRAINT valid_states CHECK (jsonb_typeof(states) = 'array'),
    CONSTRAINT valid_transitions CHECK (jsonb_typeof(transitions) = 'array'),
    CONSTRAINT valid_steps CHECK (jsonb_typeof(steps) = 'array')
);

-- Journey Instances (running journeys)
CREATE TABLE IF NOT EXISTS journey_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES journey_definitions(id),

    -- Current state
    current_state VARCHAR(100) NOT NULL,
    previous_state VARCHAR(100),

    -- Context (passed from SaaS, no tenant info in schema)
    context JSONB NOT NULL DEFAULT '{}',

    -- Execution tracking
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Step progress
    current_step_index INTEGER DEFAULT 0,
    steps_completed INTEGER DEFAULT 0,
    steps_total INTEGER DEFAULT 0,

    -- Results & outcomes
    results JSONB DEFAULT '{}',
    error_details JSONB,

    -- State lock for concurrency
    lock_id UUID,
    lock_acquired_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,

    -- Rollback support
    rollback_stack JSONB DEFAULT '[]',
    can_rollback BOOLEAN DEFAULT true,

    -- Metadata
    priority INTEGER DEFAULT 50,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    initiated_by VARCHAR(255),

    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rolling_back'))
);

-- Journey State History (audit trail)
CREATE TABLE IF NOT EXISTS journey_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES journey_instances(id) ON DELETE CASCADE,

    -- State transition
    from_state VARCHAR(100),
    to_state VARCHAR(100) NOT NULL,
    transition_name VARCHAR(100),

    -- Trigger info
    trigger_type VARCHAR(50) NOT NULL,
    trigger_data JSONB,

    -- Execution details
    step_index INTEGER,
    step_slug VARCHAR(100),
    duration_ms INTEGER,

    -- Results
    success BOOLEAN NOT NULL,
    error_message TEXT,

    -- Snapshot for rollback
    context_snapshot JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journey Reasoning Trace (evidence chain)
CREATE TABLE IF NOT EXISTS journey_reasoning_trace (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES journey_instances(id) ON DELETE CASCADE,

    -- Reasoning metadata
    step_index INTEGER NOT NULL,
    step_slug VARCHAR(100) NOT NULL,
    reasoning_type VARCHAR(50) NOT NULL,

    -- Evidence chain
    evidence JSONB NOT NULL DEFAULT '[]',
    confidence_score DECIMAL(5,4),

    -- Multi-path reasoning
    paths_considered JSONB DEFAULT '[]',
    selected_path VARCHAR(100),
    path_weights JSONB DEFAULT '{}',

    -- Time-weighted factors
    time_factors JSONB DEFAULT '{}',
    decay_applied BOOLEAN DEFAULT false,

    -- Agent arbitration (multi-agent)
    agents_consulted JSONB DEFAULT '[]',
    consensus_method VARCHAR(50),

    -- Vertical-aware context
    vertical_context JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- S59: JOURNEY STEPS LIBRARY TABLES
-- ============================================================================

-- Step Type Registry
CREATE TABLE IF NOT EXISTS journey_step_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,

    -- Executor configuration
    executor_type VARCHAR(50) NOT NULL,
    default_config JSONB DEFAULT '{}',

    -- Input/Output schema
    input_schema JSONB DEFAULT '{}',
    output_schema JSONB DEFAULT '{}',

    -- Model selection
    requires_llm BOOLEAN DEFAULT false,
    default_model_task VARCHAR(100),
    model_config JSONB DEFAULT '{}',

    -- Timing
    default_timeout_ms INTEGER DEFAULT 30000,
    supports_async BOOLEAN DEFAULT true,
    supports_parallel BOOLEAN DEFAULT false,

    -- Retry behavior
    retryable BOOLEAN DEFAULT true,
    default_max_retries INTEGER DEFAULT 3,

    -- Vertical/Region awareness
    vertical_specific BOOLEAN DEFAULT false,
    region_specific BOOLEAN DEFAULT false,

    -- System flags
    is_system BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_category CHECK (category IN (
        'discovery', 'enrichment', 'scoring', 'outreach',
        'validation', 'control_flow', 'notification', 'integration'
    )),
    CONSTRAINT valid_executor CHECK (executor_type IN (
        'discovery', 'enrichment', 'scoring', 'outreach',
        'conditional', 'parallel', 'wait', 'validation',
        'notification', 'custom', 'llm'
    ))
);

-- Step Execution Log
CREATE TABLE IF NOT EXISTS journey_step_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES journey_instances(id) ON DELETE CASCADE,
    step_type_id UUID REFERENCES journey_step_types(id),

    -- Step identification
    step_index INTEGER NOT NULL,
    step_slug VARCHAR(100) NOT NULL,
    step_config JSONB DEFAULT '{}',

    -- Execution state
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Input/Output
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',

    -- Model usage (if LLM step)
    model_used VARCHAR(100),
    model_provider VARCHAR(50),
    tokens_used INTEGER,

    -- Performance
    duration_ms INTEGER,
    retries_attempted INTEGER DEFAULT 0,

    -- Error handling
    error_type VARCHAR(50),
    error_message TEXT,
    error_stack TEXT,

    -- Parallel execution support
    parent_execution_id UUID REFERENCES journey_step_executions(id),
    parallel_group_id UUID,
    parallel_index INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_exec_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'))
);

-- Conditional Branch Rules
CREATE TABLE IF NOT EXISTS journey_branch_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_type_id UUID REFERENCES journey_step_types(id),

    -- Rule definition
    name VARCHAR(255) NOT NULL,
    condition_type VARCHAR(50) NOT NULL,
    condition_config JSONB NOT NULL,

    -- Branch targets
    true_branch VARCHAR(100),
    false_branch VARCHAR(100),
    default_branch VARCHAR(100),

    -- Priority (for multiple rules)
    priority INTEGER DEFAULT 50,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- S60: JOURNEY TEMPLATES PER VERTICAL
-- ============================================================================

-- Journey Templates
CREATE TABLE IF NOT EXISTS journey_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Template versioning
    version INTEGER DEFAULT 1,
    parent_version_id UUID REFERENCES journey_templates(id),
    is_latest BOOLEAN DEFAULT true,

    -- Vertical/Persona binding
    vertical_slug VARCHAR(100) NOT NULL,
    persona_slug VARCHAR(100),

    -- Template content
    journey_definition JSONB NOT NULL,
    default_context JSONB DEFAULT '{}',

    -- Customization points
    customizable_steps JSONB DEFAULT '[]',
    locked_steps JSONB DEFAULT '[]',

    -- TonePack integration
    tone_pack_slug VARCHAR(100),
    outreach_config JSONB DEFAULT '{}',

    -- Personalization
    personalization_rules JSONB DEFAULT '[]',
    auto_draft_enabled BOOLEAN DEFAULT false,

    -- Completion behavior
    completion_mode VARCHAR(50) DEFAULT 'sequential',
    success_criteria JSONB DEFAULT '{}',

    -- System flags
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),

    UNIQUE(slug, version),
    CONSTRAINT valid_completion_mode CHECK (completion_mode IN (
        'sequential', 'parallel', 'any_path', 'all_paths', 'manual'
    ))
);

-- Template Clone History
CREATE TABLE IF NOT EXISTS journey_template_clones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_template_id UUID NOT NULL REFERENCES journey_templates(id),
    cloned_template_id UUID NOT NULL REFERENCES journey_templates(id),

    -- Clone metadata
    clone_reason VARCHAR(255),
    modifications_made JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- Vertical Journey Bindings
CREATE TABLE IF NOT EXISTS vertical_journey_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_slug VARCHAR(100) NOT NULL,
    template_id UUID NOT NULL REFERENCES journey_templates(id),

    -- Binding type
    binding_type VARCHAR(50) NOT NULL,
    trigger_conditions JSONB DEFAULT '{}',

    -- Priority for multiple templates
    priority INTEGER DEFAULT 50,

    -- Auto-start configuration
    auto_start BOOLEAN DEFAULT false,
    auto_start_config JSONB DEFAULT '{}',

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(vertical_slug, template_id, binding_type),
    CONSTRAINT valid_binding_type CHECK (binding_type IN (
        'onboarding', 'qualification', 'nurturing', 'outreach', 'retention', 'custom'
    ))
);

-- ============================================================================
-- S61: JOURNEY MONITORING TABLES
-- ============================================================================

-- Journey Metrics (aggregated)
CREATE TABLE IF NOT EXISTS journey_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Metric identification
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,

    -- Scope
    journey_definition_id UUID REFERENCES journey_definitions(id),
    template_id UUID REFERENCES journey_templates(id),
    vertical_slug VARCHAR(100),

    -- Time bucket
    bucket_start TIMESTAMPTZ NOT NULL,
    bucket_end TIMESTAMPTZ NOT NULL,
    bucket_size VARCHAR(20) DEFAULT '1h',

    -- Metric values
    value_count INTEGER DEFAULT 0,
    value_sum DECIMAL(20,4) DEFAULT 0,
    value_avg DECIMAL(20,4) DEFAULT 0,
    value_min DECIMAL(20,4),
    value_max DECIMAL(20,4),
    value_p50 DECIMAL(20,4),
    value_p95 DECIMAL(20,4),
    value_p99 DECIMAL(20,4),

    -- Additional dimensions
    dimensions JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(metric_type, metric_name, bucket_start, journey_definition_id, template_id, vertical_slug)
);

-- Journey A/B Tests
CREATE TABLE IF NOT EXISTS journey_ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Test configuration
    test_type VARCHAR(50) NOT NULL,
    control_config JSONB NOT NULL,
    variant_configs JSONB NOT NULL DEFAULT '[]',

    -- Traffic allocation
    traffic_allocation JSONB DEFAULT '{"control": 50}',

    -- Target scope
    journey_definition_id UUID REFERENCES journey_definitions(id),
    template_id UUID REFERENCES journey_templates(id),
    vertical_slug VARCHAR(100),

    -- Test lifecycle
    status VARCHAR(50) DEFAULT 'draft',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Success metrics
    primary_metric VARCHAR(100) NOT NULL,
    secondary_metrics JSONB DEFAULT '[]',
    min_sample_size INTEGER DEFAULT 100,
    confidence_level DECIMAL(5,4) DEFAULT 0.95,

    -- Results
    results JSONB DEFAULT '{}',
    winner_variant VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),

    CONSTRAINT valid_test_type CHECK (test_type IN (
        'step_variant', 'flow_variant', 'timing_variant', 'model_variant', 'template_variant'
    )),
    CONSTRAINT valid_test_status CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled'))
);

-- Journey Memory (long-term learning)
CREATE TABLE IF NOT EXISTS journey_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Memory scope
    memory_type VARCHAR(50) NOT NULL,
    scope_type VARCHAR(50) NOT NULL,
    scope_id VARCHAR(255) NOT NULL,

    -- Memory content
    memory_key VARCHAR(255) NOT NULL,
    memory_value JSONB NOT NULL,

    -- Relevance & decay
    relevance_score DECIMAL(5,4) DEFAULT 1.0,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,

    -- TTL
    expires_at TIMESTAMPTZ,

    -- Source tracking
    source_journey_id UUID REFERENCES journey_instances(id),
    source_step_slug VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(memory_type, scope_type, scope_id, memory_key),
    CONSTRAINT valid_memory_type CHECK (memory_type IN (
        'enrichment', 'outcome', 'preference', 'pattern', 'learning'
    )),
    CONSTRAINT valid_scope_type CHECK (scope_type IN (
        'company', 'contact', 'user', 'vertical', 'global'
    ))
);

-- Journey Debug Sessions
CREATE TABLE IF NOT EXISTS journey_debug_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES journey_instances(id),

    -- Debug configuration
    breakpoints JSONB DEFAULT '[]',
    watch_expressions JSONB DEFAULT '[]',
    trace_level VARCHAR(20) DEFAULT 'info',

    -- Captured data
    captured_states JSONB DEFAULT '[]',
    captured_context JSONB DEFAULT '[]',
    captured_logs JSONB DEFAULT '[]',

    -- Session lifecycle
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    created_by VARCHAR(255)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Journey definitions
CREATE INDEX IF NOT EXISTS idx_journey_definitions_slug ON journey_definitions(slug);
CREATE INDEX IF NOT EXISTS idx_journey_definitions_vertical ON journey_definitions(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_journey_definitions_active ON journey_definitions(is_active) WHERE is_active = true;

-- Journey instances
CREATE INDEX IF NOT EXISTS idx_journey_instances_definition ON journey_instances(definition_id);
CREATE INDEX IF NOT EXISTS idx_journey_instances_status ON journey_instances(status);
CREATE INDEX IF NOT EXISTS idx_journey_instances_state ON journey_instances(current_state);
CREATE INDEX IF NOT EXISTS idx_journey_instances_lock ON journey_instances(lock_id) WHERE lock_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journey_instances_created ON journey_instances(created_at DESC);

-- State history
CREATE INDEX IF NOT EXISTS idx_journey_state_history_instance ON journey_state_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_journey_state_history_created ON journey_state_history(created_at DESC);

-- Reasoning trace
CREATE INDEX IF NOT EXISTS idx_journey_reasoning_instance ON journey_reasoning_trace(instance_id);
CREATE INDEX IF NOT EXISTS idx_journey_reasoning_step ON journey_reasoning_trace(step_slug);

-- Step types
CREATE INDEX IF NOT EXISTS idx_journey_step_types_slug ON journey_step_types(slug);
CREATE INDEX IF NOT EXISTS idx_journey_step_types_category ON journey_step_types(category);

-- Step executions
CREATE INDEX IF NOT EXISTS idx_journey_step_executions_instance ON journey_step_executions(instance_id);
CREATE INDEX IF NOT EXISTS idx_journey_step_executions_status ON journey_step_executions(status);
CREATE INDEX IF NOT EXISTS idx_journey_step_executions_parallel ON journey_step_executions(parallel_group_id) WHERE parallel_group_id IS NOT NULL;

-- Templates
CREATE INDEX IF NOT EXISTS idx_journey_templates_vertical ON journey_templates(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_journey_templates_slug_version ON journey_templates(slug, version);
CREATE INDEX IF NOT EXISTS idx_journey_templates_latest ON journey_templates(slug) WHERE is_latest = true;

-- Vertical bindings
CREATE INDEX IF NOT EXISTS idx_vertical_journey_bindings_vertical ON vertical_journey_bindings(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_vertical_journey_bindings_template ON vertical_journey_bindings(template_id);

-- Metrics
CREATE INDEX IF NOT EXISTS idx_journey_metrics_type ON journey_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_journey_metrics_bucket ON journey_metrics(bucket_start, bucket_end);
CREATE INDEX IF NOT EXISTS idx_journey_metrics_vertical ON journey_metrics(vertical_slug) WHERE vertical_slug IS NOT NULL;

-- A/B Tests
CREATE INDEX IF NOT EXISTS idx_journey_ab_tests_status ON journey_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_journey_ab_tests_definition ON journey_ab_tests(journey_definition_id);

-- Memory
CREATE INDEX IF NOT EXISTS idx_journey_memory_scope ON journey_memory(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_journey_memory_type ON journey_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_journey_memory_expires ON journey_memory(expires_at) WHERE expires_at IS NOT NULL;

-- Debug sessions
CREATE INDEX IF NOT EXISTS idx_journey_debug_instance ON journey_debug_sessions(instance_id);

-- ============================================================================
-- SEED DATA: S59 STEP TYPES
-- ============================================================================

INSERT INTO journey_step_types (slug, name, description, category, executor_type, default_config, requires_llm, default_model_task, is_system) VALUES

-- Discovery steps
('discovery_company', 'Company Discovery', 'Discover companies matching criteria', 'discovery', 'discovery',
 '{"target_type": "company_search", "max_results": 100}', false, NULL, true),
('discovery_contact', 'Contact Discovery', 'Discover contacts at companies', 'discovery', 'discovery',
 '{"target_type": "contact_search", "max_results": 50}', false, NULL, true),
('discovery_signal', 'Signal Discovery', 'Discover market signals', 'discovery', 'discovery',
 '{"target_type": "signal_hiring", "lookback_days": 30}', false, NULL, true),

-- Enrichment steps
('enrich_company', 'Company Enrichment', 'Enrich company data from multiple sources', 'enrichment', 'enrichment',
 '{"sources": ["clearbit", "apollo", "crunchbase"]}', false, NULL, true),
('enrich_contact', 'Contact Enrichment', 'Enrich contact data', 'enrichment', 'enrichment',
 '{"sources": ["apollo", "linkedin"]}', false, NULL, true),
('enrich_daily', 'Daily Enrichment', 'Scheduled daily enrichment refresh', 'enrichment', 'enrichment',
 '{"schedule": "daily", "priority": "low"}', false, NULL, true),

-- Scoring steps
('score_qtl', 'Q/T/L Scoring', 'Calculate Q-Score, T-Score, L-Score', 'scoring', 'scoring',
 '{"score_types": ["q_score", "t_score", "l_score"]}', false, NULL, true),
('score_auto_rank', 'Auto Score & Rank', 'Automatic scoring and ranking', 'scoring', 'scoring',
 '{"auto_rank": true, "ranking_profile": "balanced"}', false, NULL, true),

-- Outreach steps
('outreach_generate', 'Generate Outreach', 'Generate personalized outreach message', 'outreach', 'outreach',
 '{"tone_pack": "professional", "channel": "email"}', true, 'outreach_generation', true),
('outreach_auto_draft', 'Auto-Draft Outreach', 'Automatically draft outreach sequences', 'outreach', 'outreach',
 '{"auto_personalize": true, "sequence_length": 3}', true, 'outreach_generation', true),

-- Validation steps
('validate_data', 'Data Validation', 'Validate data quality and completeness', 'validation', 'validation',
 '{"rules": ["email_valid", "company_exists"]}', false, NULL, true),
('validate_precondition', 'Precondition Check', 'Check journey preconditions', 'validation', 'validation',
 '{"fail_on_missing": true}', false, NULL, true),

-- Control flow steps
('conditional_branch', 'Conditional Branch', 'Branch based on conditions', 'control_flow', 'conditional',
 '{"default_branch": "continue"}', false, NULL, true),
('parallel_execute', 'Parallel Execution', 'Execute multiple steps in parallel', 'control_flow', 'parallel',
 '{"max_parallel": 5, "fail_fast": false}', false, NULL, true),
('wait_delay', 'Wait/Delay', 'Wait for a specified duration', 'control_flow', 'wait',
 '{"default_duration_ms": 1000}', false, NULL, true),
('wait_condition', 'Wait for Condition', 'Wait until condition is met', 'control_flow', 'wait',
 '{"timeout_ms": 300000, "poll_interval_ms": 5000}', false, NULL, true),

-- Notification steps
('notify_email', 'Email Notification', 'Send email notification', 'notification', 'notification',
 '{"channel": "email"}', false, NULL, true),
('notify_webhook', 'Webhook Notification', 'Send webhook notification', 'notification', 'notification',
 '{"method": "POST"}', false, NULL, true),
('notify_internal', 'Internal Alert', 'Send internal system alert', 'notification', 'notification',
 '{"priority": "normal"}', false, NULL, true)

ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    executor_type = EXCLUDED.executor_type,
    default_config = EXCLUDED.default_config,
    requires_llm = EXCLUDED.requires_llm,
    default_model_task = EXCLUDED.default_model_task,
    updated_at = NOW();

-- ============================================================================
-- SEED DATA: S60 VERTICAL JOURNEY TEMPLATES
-- ============================================================================

-- Banking Employee Onboarding Journey
INSERT INTO journey_templates (slug, name, description, vertical_slug, version, journey_definition, default_context, tone_pack_slug, completion_mode, is_system) VALUES
('banking_employee_onboarding', 'Banking Employee Onboarding', 'Journey for onboarding new banking sector employees', 'banking', 1,
'{
  "initial_state": "discovered",
  "states": ["discovered", "enriched", "qualified", "outreach_ready", "contacted", "engaged", "completed"],
  "transitions": [
    {"from": "discovered", "to": "enriched", "trigger": "enrich_complete"},
    {"from": "enriched", "to": "qualified", "trigger": "score_complete"},
    {"from": "qualified", "to": "outreach_ready", "trigger": "qualify_pass"},
    {"from": "outreach_ready", "to": "contacted", "trigger": "outreach_sent"},
    {"from": "contacted", "to": "engaged", "trigger": "response_received"},
    {"from": "engaged", "to": "completed", "trigger": "onboarding_complete"}
  ],
  "steps": [
    {"slug": "discover", "type": "discovery_contact", "config": {"filters": {"department": ["HR", "Operations"]}}},
    {"slug": "enrich", "type": "enrich_contact", "config": {}},
    {"slug": "score", "type": "score_qtl", "config": {}},
    {"slug": "qualify", "type": "conditional_branch", "config": {"condition": "q_score >= 70"}},
    {"slug": "generate_outreach", "type": "outreach_generate", "config": {"tone": "formal", "template": "banking_intro"}},
    {"slug": "send_outreach", "type": "outreach_auto_draft", "config": {"channel": "email"}}
  ]
}',
'{"vertical": "banking", "persona": "new_hire"}',
'formal_banking', 'sequential', true),

-- Insurance Lead Qualification Journey
('insurance_lead_qualification', 'Insurance Lead Qualification', 'Qualify and nurture insurance leads', 'insurance', 1,
'{
  "initial_state": "new_lead",
  "states": ["new_lead", "enriched", "scored", "qualified", "nurturing", "converted", "lost"],
  "transitions": [
    {"from": "new_lead", "to": "enriched", "trigger": "enrich_complete"},
    {"from": "enriched", "to": "scored", "trigger": "score_complete"},
    {"from": "scored", "to": "qualified", "trigger": "score_high"},
    {"from": "scored", "to": "nurturing", "trigger": "score_medium"},
    {"from": "scored", "to": "lost", "trigger": "score_low"},
    {"from": "qualified", "to": "converted", "trigger": "conversion"},
    {"from": "nurturing", "to": "qualified", "trigger": "score_improved"}
  ],
  "steps": [
    {"slug": "enrich_lead", "type": "enrich_company", "config": {}},
    {"slug": "enrich_contact", "type": "enrich_contact", "config": {}},
    {"slug": "score_lead", "type": "score_qtl", "config": {"include_e_score": true}},
    {"slug": "branch_score", "type": "conditional_branch", "config": {"thresholds": {"high": 80, "medium": 50}}},
    {"slug": "generate_proposal", "type": "outreach_generate", "config": {"template": "insurance_proposal"}}
  ]
}',
'{"vertical": "insurance", "lead_type": "inbound"}',
'consultative', 'sequential', true),

-- Real Estate Family Matching Journey
('real_estate_family_matching', 'Real Estate Family Matching', 'Match families with suitable properties', 'real_estate', 1,
'{
  "initial_state": "family_registered",
  "states": ["family_registered", "needs_assessed", "properties_matched", "viewings_scheduled", "offer_stage", "closed"],
  "transitions": [
    {"from": "family_registered", "to": "needs_assessed", "trigger": "assessment_complete"},
    {"from": "needs_assessed", "to": "properties_matched", "trigger": "matches_found"},
    {"from": "properties_matched", "to": "viewings_scheduled", "trigger": "viewing_booked"},
    {"from": "viewings_scheduled", "to": "offer_stage", "trigger": "offer_submitted"},
    {"from": "offer_stage", "to": "closed", "trigger": "deal_closed"}
  ],
  "steps": [
    {"slug": "assess_needs", "type": "validate_data", "config": {"required": ["budget", "location", "bedrooms"]}},
    {"slug": "discover_properties", "type": "discovery_company", "config": {"target_type": "property_search"}},
    {"slug": "score_matches", "type": "score_auto_rank", "config": {"profile": "family_fit"}},
    {"slug": "notify_matches", "type": "notify_email", "config": {"template": "property_matches"}}
  ]
}',
'{"vertical": "real_estate", "client_type": "family"}',
'friendly_professional', 'sequential', true),

-- Recruitment Pipeline Journey
('recruitment_pipeline', 'Recruitment Pipeline', 'End-to-end recruitment workflow', 'recruitment', 1,
'{
  "initial_state": "job_posted",
  "states": ["job_posted", "sourcing", "screening", "interviewing", "offer", "hired", "rejected"],
  "transitions": [
    {"from": "job_posted", "to": "sourcing", "trigger": "start_sourcing"},
    {"from": "sourcing", "to": "screening", "trigger": "candidates_found"},
    {"from": "screening", "to": "interviewing", "trigger": "screen_pass"},
    {"from": "screening", "to": "rejected", "trigger": "screen_fail"},
    {"from": "interviewing", "to": "offer", "trigger": "interview_pass"},
    {"from": "interviewing", "to": "rejected", "trigger": "interview_fail"},
    {"from": "offer", "to": "hired", "trigger": "offer_accepted"},
    {"from": "offer", "to": "rejected", "trigger": "offer_declined"}
  ],
  "steps": [
    {"slug": "source_candidates", "type": "discovery_contact", "config": {"filters": {"skills_match": true}}},
    {"slug": "enrich_candidates", "type": "enrich_contact", "config": {"sources": ["linkedin", "github"]}},
    {"slug": "score_fit", "type": "score_qtl", "config": {"profile": "candidate_fit"}},
    {"slug": "parallel_outreach", "type": "parallel_execute", "config": {"steps": ["email", "linkedin"]}}
  ]
}',
'{"vertical": "recruitment", "job_type": "technical"}',
'professional_friendly', 'sequential', true)

ON CONFLICT (slug, version) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    journey_definition = EXCLUDED.journey_definition,
    default_context = EXCLUDED.default_context,
    tone_pack_slug = EXCLUDED.tone_pack_slug,
    updated_at = NOW();

-- Bind templates to verticals
INSERT INTO vertical_journey_bindings (vertical_slug, template_id, binding_type, auto_start, priority)
SELECT 'banking', id, 'onboarding', false, 10 FROM journey_templates WHERE slug = 'banking_employee_onboarding'
ON CONFLICT DO NOTHING;

INSERT INTO vertical_journey_bindings (vertical_slug, template_id, binding_type, auto_start, priority)
SELECT 'insurance', id, 'qualification', true, 10 FROM journey_templates WHERE slug = 'insurance_lead_qualification'
ON CONFLICT DO NOTHING;

INSERT INTO vertical_journey_bindings (vertical_slug, template_id, binding_type, auto_start, priority)
SELECT 'real_estate', id, 'nurturing', false, 10 FROM journey_templates WHERE slug = 'real_estate_family_matching'
ON CONFLICT DO NOTHING;

INSERT INTO vertical_journey_bindings (vertical_slug, template_id, binding_type, auto_start, priority)
SELECT 'recruitment', id, 'custom', false, 10 FROM journey_templates WHERE slug = 'recruitment_pipeline'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS: JOURNEY STATE MACHINE
-- ============================================================================

-- Function to acquire state lock
CREATE OR REPLACE FUNCTION acquire_journey_lock(
    p_instance_id UUID,
    p_lock_duration_seconds INTEGER DEFAULT 30
) RETURNS BOOLEAN AS $$
DECLARE
    v_lock_id UUID;
    v_acquired BOOLEAN;
BEGIN
    v_lock_id := gen_random_uuid();

    UPDATE journey_instances
    SET lock_id = v_lock_id,
        lock_acquired_at = NOW(),
        lock_expires_at = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
    WHERE id = p_instance_id
      AND (lock_id IS NULL OR lock_expires_at < NOW())
    RETURNING true INTO v_acquired;

    RETURN COALESCE(v_acquired, false);
END;
$$ LANGUAGE plpgsql;

-- Function to release state lock
CREATE OR REPLACE FUNCTION release_journey_lock(
    p_instance_id UUID,
    p_lock_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_released BOOLEAN;
BEGIN
    UPDATE journey_instances
    SET lock_id = NULL,
        lock_acquired_at = NULL,
        lock_expires_at = NULL
    WHERE id = p_instance_id
      AND (p_lock_id IS NULL OR lock_id = p_lock_id)
    RETURNING true INTO v_released;

    RETURN COALESCE(v_released, false);
END;
$$ LANGUAGE plpgsql;

-- Function to transition state (deterministic)
CREATE OR REPLACE FUNCTION transition_journey_state(
    p_instance_id UUID,
    p_to_state VARCHAR(100),
    p_trigger_type VARCHAR(50),
    p_trigger_data JSONB DEFAULT NULL,
    p_step_index INTEGER DEFAULT NULL,
    p_step_slug VARCHAR(100) DEFAULT NULL
) RETURNS journey_instances AS $$
DECLARE
    v_instance journey_instances;
    v_from_state VARCHAR(100);
    v_definition journey_definitions;
    v_transition JSONB;
    v_valid BOOLEAN := false;
BEGIN
    -- Get current instance with lock check
    SELECT * INTO v_instance FROM journey_instances WHERE id = p_instance_id FOR UPDATE;

    IF v_instance IS NULL THEN
        RAISE EXCEPTION 'Journey instance not found: %', p_instance_id;
    END IF;

    -- Verify lock is held
    IF v_instance.lock_id IS NULL OR v_instance.lock_expires_at < NOW() THEN
        RAISE EXCEPTION 'State lock not held for instance: %', p_instance_id;
    END IF;

    v_from_state := v_instance.current_state;

    -- Get definition to validate transition
    SELECT * INTO v_definition FROM journey_definitions WHERE id = v_instance.definition_id;

    -- Validate transition is allowed
    FOR v_transition IN SELECT * FROM jsonb_array_elements(v_definition.transitions)
    LOOP
        IF v_transition->>'from' = v_from_state AND v_transition->>'to' = p_to_state THEN
            v_valid := true;
            EXIT;
        END IF;
    END LOOP;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid transition from % to % for journey %', v_from_state, p_to_state, v_definition.slug;
    END IF;

    -- Record state history (for rollback)
    INSERT INTO journey_state_history (
        instance_id, from_state, to_state, transition_name,
        trigger_type, trigger_data, step_index, step_slug,
        success, context_snapshot
    ) VALUES (
        p_instance_id, v_from_state, p_to_state, v_transition->>'name',
        p_trigger_type, p_trigger_data, p_step_index, p_step_slug,
        true, v_instance.context
    );

    -- Update instance state
    UPDATE journey_instances
    SET current_state = p_to_state,
        previous_state = v_from_state,
        updated_at = NOW()
    WHERE id = p_instance_id
    RETURNING * INTO v_instance;

    RETURN v_instance;
END;
$$ LANGUAGE plpgsql;

-- Function to rollback journey state
CREATE OR REPLACE FUNCTION rollback_journey_state(
    p_instance_id UUID,
    p_steps INTEGER DEFAULT 1
) RETURNS journey_instances AS $$
DECLARE
    v_instance journey_instances;
    v_history journey_state_history;
    v_rollback_count INTEGER := 0;
BEGIN
    -- Get instance
    SELECT * INTO v_instance FROM journey_instances WHERE id = p_instance_id FOR UPDATE;

    IF NOT v_instance.can_rollback THEN
        RAISE EXCEPTION 'Rollback not allowed for instance: %', p_instance_id;
    END IF;

    -- Update status
    UPDATE journey_instances SET status = 'rolling_back' WHERE id = p_instance_id;

    -- Process rollback steps
    FOR v_history IN
        SELECT * FROM journey_state_history
        WHERE instance_id = p_instance_id
        ORDER BY created_at DESC
        LIMIT p_steps
    LOOP
        IF v_history.from_state IS NOT NULL THEN
            UPDATE journey_instances
            SET current_state = v_history.from_state,
                context = COALESCE(v_history.context_snapshot, context),
                updated_at = NOW()
            WHERE id = p_instance_id;

            v_rollback_count := v_rollback_count + 1;
        END IF;
    END LOOP;

    -- Update rollback stack
    UPDATE journey_instances
    SET rollback_stack = rollback_stack || jsonb_build_object(
            'rolled_back_at', NOW(),
            'steps_rolled_back', v_rollback_count
        ),
        status = 'paused',
        updated_at = NOW()
    WHERE id = p_instance_id
    RETURNING * INTO v_instance;

    RETURN v_instance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: JOURNEY METRICS
-- ============================================================================

-- Function to record metric
CREATE OR REPLACE FUNCTION record_journey_metric(
    p_metric_type VARCHAR(50),
    p_metric_name VARCHAR(100),
    p_value DECIMAL,
    p_journey_definition_id UUID DEFAULT NULL,
    p_template_id UUID DEFAULT NULL,
    p_vertical_slug VARCHAR(100) DEFAULT NULL,
    p_dimensions JSONB DEFAULT '{}'
) RETURNS journey_metrics AS $$
DECLARE
    v_bucket_start TIMESTAMPTZ;
    v_bucket_end TIMESTAMPTZ;
    v_metric journey_metrics;
BEGIN
    -- Calculate hourly bucket
    v_bucket_start := date_trunc('hour', NOW());
    v_bucket_end := v_bucket_start + INTERVAL '1 hour';

    -- Upsert metric
    INSERT INTO journey_metrics (
        metric_type, metric_name, bucket_start, bucket_end, bucket_size,
        journey_definition_id, template_id, vertical_slug,
        value_count, value_sum, value_avg, value_min, value_max,
        dimensions
    ) VALUES (
        p_metric_type, p_metric_name, v_bucket_start, v_bucket_end, '1h',
        p_journey_definition_id, p_template_id, p_vertical_slug,
        1, p_value, p_value, p_value, p_value,
        p_dimensions
    )
    ON CONFLICT (metric_type, metric_name, bucket_start, journey_definition_id, template_id, vertical_slug)
    DO UPDATE SET
        value_count = journey_metrics.value_count + 1,
        value_sum = journey_metrics.value_sum + p_value,
        value_avg = (journey_metrics.value_sum + p_value) / (journey_metrics.value_count + 1),
        value_min = LEAST(journey_metrics.value_min, p_value),
        value_max = GREATEST(journey_metrics.value_max, p_value)
    RETURNING * INTO v_metric;

    RETURN v_metric;
END;
$$ LANGUAGE plpgsql;

-- Function to update memory with decay
CREATE OR REPLACE FUNCTION update_journey_memory(
    p_memory_type VARCHAR(50),
    p_scope_type VARCHAR(50),
    p_scope_id VARCHAR(255),
    p_memory_key VARCHAR(255),
    p_memory_value JSONB,
    p_source_journey_id UUID DEFAULT NULL,
    p_source_step_slug VARCHAR(100) DEFAULT NULL,
    p_ttl_days INTEGER DEFAULT NULL
) RETURNS journey_memory AS $$
DECLARE
    v_memory journey_memory;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF p_ttl_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_ttl_days || ' days')::INTERVAL;
    END IF;

    INSERT INTO journey_memory (
        memory_type, scope_type, scope_id, memory_key, memory_value,
        source_journey_id, source_step_slug, expires_at
    ) VALUES (
        p_memory_type, p_scope_type, p_scope_id, p_memory_key, p_memory_value,
        p_source_journey_id, p_source_step_slug, v_expires_at
    )
    ON CONFLICT (memory_type, scope_type, scope_id, memory_key)
    DO UPDATE SET
        memory_value = p_memory_value,
        relevance_score = LEAST(1.0, journey_memory.relevance_score + 0.1),
        last_accessed_at = NOW(),
        access_count = journey_memory.access_count + 1,
        source_journey_id = COALESCE(p_source_journey_id, journey_memory.source_journey_id),
        source_step_slug = COALESCE(p_source_step_slug, journey_memory.source_step_slug),
        expires_at = COALESCE(v_expires_at, journey_memory.expires_at),
        updated_at = NOW()
    RETURNING * INTO v_memory;

    RETURN v_memory;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_journey_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journey_definitions_updated
    BEFORE UPDATE ON journey_definitions
    FOR EACH ROW EXECUTE FUNCTION update_journey_timestamp();

CREATE TRIGGER trg_journey_instances_updated
    BEFORE UPDATE ON journey_instances
    FOR EACH ROW EXECUTE FUNCTION update_journey_timestamp();

CREATE TRIGGER trg_journey_templates_updated
    BEFORE UPDATE ON journey_templates
    FOR EACH ROW EXECUTE FUNCTION update_journey_timestamp();

CREATE TRIGGER trg_journey_memory_updated
    BEFORE UPDATE ON journey_memory
    FOR EACH ROW EXECUTE FUNCTION update_journey_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE journey_definitions IS 'S58: Journey blueprints with states, transitions, and steps';
COMMENT ON TABLE journey_instances IS 'S58: Running journey instances with state tracking';
COMMENT ON TABLE journey_state_history IS 'S58: Audit trail for state transitions (supports rollback)';
COMMENT ON TABLE journey_reasoning_trace IS 'S58: Evidence chain and reasoning trace for each step';
COMMENT ON TABLE journey_step_types IS 'S59: Registry of available step types';
COMMENT ON TABLE journey_step_executions IS 'S59: Log of step executions';
COMMENT ON TABLE journey_branch_rules IS 'S59: Conditional branching rules';
COMMENT ON TABLE journey_templates IS 'S60: Vertical-specific journey templates';
COMMENT ON TABLE journey_template_clones IS 'S60: Clone history for template versioning';
COMMENT ON TABLE vertical_journey_bindings IS 'S60: Template-to-vertical assignments';
COMMENT ON TABLE journey_metrics IS 'S61: Aggregated journey metrics';
COMMENT ON TABLE journey_ab_tests IS 'S61: A/B test configurations and results';
COMMENT ON TABLE journey_memory IS 'S61: Long-term learning memory';
COMMENT ON TABLE journey_debug_sessions IS 'S61: Debug session data';
