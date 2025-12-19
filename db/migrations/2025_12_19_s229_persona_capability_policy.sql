-- ============================================================================
-- Sprint 229: Persona Capability Policy
-- ============================================================================
--
-- This migration extends persona policies with capability controls:
-- 1. Add capability columns to os_persona_policies
-- 2. Create authorize_capability function (pre-SIVA guard)
-- 3. Create denial logging table
--
-- INVARIANT: Capability not in allowed_capabilities = DENIED
-- INVARIANT: Capability in forbidden_capabilities = DENIED (always wins)
-- INVARIANT: This is about DENIAL, not routing. SIVA must not run on denial.
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXTEND os_persona_policies WITH CAPABILITY COLUMNS
-- ============================================================================

-- Add capability control columns
ALTER TABLE os_persona_policies
  ADD COLUMN IF NOT EXISTS allowed_capabilities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forbidden_capabilities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_cost_per_call NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS max_latency_ms INTEGER;

-- Add comment explaining the semantics
COMMENT ON COLUMN os_persona_policies.allowed_capabilities IS
  'Whitelist: Only these capabilities can be requested. Empty = none allowed (deny all).';
COMMENT ON COLUMN os_persona_policies.forbidden_capabilities IS
  'Blacklist: These capabilities are always denied, even if in allowed list. Takes precedence.';
COMMENT ON COLUMN os_persona_policies.max_cost_per_call IS
  'Maximum cost budget per single capability call (USD). NULL = no limit.';
COMMENT ON COLUMN os_persona_policies.max_latency_ms IS
  'Maximum latency budget per call (milliseconds). NULL = no limit.';

-- Index for capability lookups
CREATE INDEX IF NOT EXISTS idx_os_persona_policies_capabilities
  ON os_persona_policies USING GIN (allowed_capabilities);

-- ============================================================================
-- CAPABILITY AUTHORIZATION DENIALS LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_capability_denials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was requested
  persona_id UUID NOT NULL REFERENCES os_personas(id),
  capability_key VARCHAR(50) NOT NULL,

  -- Why it was denied
  denial_reason VARCHAR(50) NOT NULL CHECK (denial_reason IN (
    'NOT_IN_ALLOWED',      -- Capability not in allowed_capabilities list
    'IN_FORBIDDEN',        -- Capability explicitly forbidden
    'COST_BUDGET_EXCEEDED', -- max_cost_per_call exceeded
    'LATENCY_BUDGET_EXCEEDED', -- max_latency_ms exceeded
    'PERSONA_NOT_FOUND',   -- Persona doesn't exist
    'POLICY_NOT_FOUND',    -- No policy for persona
    'CAPABILITY_NOT_FOUND' -- Capability doesn't exist in registry
  )),
  denial_details TEXT,

  -- Context from envelope (for debugging/audit)
  envelope_hash VARCHAR(64),
  request_context JSONB,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_capability_denials_persona ON os_capability_denials(persona_id);
CREATE INDEX IF NOT EXISTS idx_os_capability_denials_capability ON os_capability_denials(capability_key);
CREATE INDEX IF NOT EXISTS idx_os_capability_denials_reason ON os_capability_denials(denial_reason);
CREATE INDEX IF NOT EXISTS idx_os_capability_denials_created ON os_capability_denials(created_at);

-- ============================================================================
-- AUTHORIZE_CAPABILITY FUNCTION
-- ============================================================================
-- This is the OS-level guard. Called BEFORE any model routing.
-- Returns: { authorized: boolean, denial_reason?: string, denial_id?: uuid }
--
-- Authorization Logic:
-- 1. Persona must exist
-- 2. Policy must exist for persona
-- 3. Capability must exist in registry
-- 4. Capability must be in allowed_capabilities (whitelist)
-- 5. Capability must NOT be in forbidden_capabilities (blacklist wins)
-- 6. Cost budget not exceeded (if set)
-- 7. Latency budget not exceeded (if set)
-- ============================================================================

CREATE OR REPLACE FUNCTION authorize_capability(
  p_persona_id UUID,
  p_capability_key VARCHAR,
  p_envelope_hash VARCHAR DEFAULT NULL,
  p_request_context JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_policy RECORD;
  v_capability RECORD;
  v_denial_reason VARCHAR(50);
  v_denial_details TEXT;
  v_denial_id UUID;
BEGIN
  -- ========================================
  -- CHECK 1: Persona exists
  -- ========================================
  IF NOT EXISTS (SELECT 1 FROM os_personas WHERE id = p_persona_id) THEN
    v_denial_reason := 'PERSONA_NOT_FOUND';
    v_denial_details := format('Persona %s does not exist', p_persona_id);

    INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
    VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
    RETURNING id INTO v_denial_id;

    RETURN jsonb_build_object(
      'authorized', false,
      'denial_reason', v_denial_reason,
      'denial_details', v_denial_details,
      'denial_id', v_denial_id
    );
  END IF;

  -- ========================================
  -- CHECK 2: Policy exists for persona
  -- ========================================
  SELECT * INTO v_policy
  FROM os_persona_policies
  WHERE persona_id = p_persona_id;

  IF v_policy IS NULL THEN
    v_denial_reason := 'POLICY_NOT_FOUND';
    v_denial_details := format('No policy configured for persona %s', p_persona_id);

    INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
    VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
    RETURNING id INTO v_denial_id;

    RETURN jsonb_build_object(
      'authorized', false,
      'denial_reason', v_denial_reason,
      'denial_details', v_denial_details,
      'denial_id', v_denial_id
    );
  END IF;

  -- ========================================
  -- CHECK 3: Capability exists in registry
  -- ========================================
  SELECT * INTO v_capability
  FROM os_model_capabilities
  WHERE capability_key = p_capability_key AND is_active = true;

  IF v_capability IS NULL THEN
    v_denial_reason := 'CAPABILITY_NOT_FOUND';
    v_denial_details := format('Capability %s not found or inactive in registry', p_capability_key);

    INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
    VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
    RETURNING id INTO v_denial_id;

    RETURN jsonb_build_object(
      'authorized', false,
      'denial_reason', v_denial_reason,
      'denial_details', v_denial_details,
      'denial_id', v_denial_id
    );
  END IF;

  -- ========================================
  -- CHECK 4: Capability in forbidden list (BLACKLIST WINS)
  -- ========================================
  IF p_capability_key = ANY(v_policy.forbidden_capabilities) THEN
    v_denial_reason := 'IN_FORBIDDEN';
    v_denial_details := format('Capability %s is explicitly forbidden for persona %s', p_capability_key, p_persona_id);

    INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
    VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
    RETURNING id INTO v_denial_id;

    RETURN jsonb_build_object(
      'authorized', false,
      'denial_reason', v_denial_reason,
      'denial_details', v_denial_details,
      'denial_id', v_denial_id
    );
  END IF;

  -- ========================================
  -- CHECK 5: Capability in allowed list (WHITELIST)
  -- ========================================
  IF NOT (p_capability_key = ANY(v_policy.allowed_capabilities)) THEN
    v_denial_reason := 'NOT_IN_ALLOWED';
    v_denial_details := format('Capability %s not in allowed list for persona %s. Allowed: %s',
      p_capability_key, p_persona_id, array_to_string(v_policy.allowed_capabilities, ', '));

    INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
    VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
    RETURNING id INTO v_denial_id;

    RETURN jsonb_build_object(
      'authorized', false,
      'denial_reason', v_denial_reason,
      'denial_details', v_denial_details,
      'denial_id', v_denial_id
    );
  END IF;

  -- ========================================
  -- CHECK 6: Cost budget (if set)
  -- ========================================
  IF v_policy.max_cost_per_call IS NOT NULL THEN
    -- Get minimum cost model for this capability
    DECLARE
      v_min_cost NUMERIC;
    BEGIN
      SELECT MIN((m.input_cost_per_million + m.output_cost_per_million) / 2000)
      INTO v_min_cost
      FROM llm_models m
      JOIN os_model_capability_mappings mcm ON mcm.model_id = m.id
      JOIN os_model_capabilities c ON mcm.capability_id = c.id
      WHERE c.capability_key = p_capability_key
        AND mcm.is_supported = true
        AND m.is_active = true
        AND m.is_eligible = true;

      IF v_min_cost IS NOT NULL AND v_min_cost > v_policy.max_cost_per_call THEN
        v_denial_reason := 'COST_BUDGET_EXCEEDED';
        v_denial_details := format('Min cost for %s is $%s/1k, but policy max is $%s/1k',
          p_capability_key, v_min_cost, v_policy.max_cost_per_call);

        INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
        VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
        RETURNING id INTO v_denial_id;

        RETURN jsonb_build_object(
          'authorized', false,
          'denial_reason', v_denial_reason,
          'denial_details', v_denial_details,
          'denial_id', v_denial_id
        );
      END IF;
    END;
  END IF;

  -- ========================================
  -- CHECK 7: Latency budget (if set)
  -- ========================================
  IF v_policy.max_latency_ms IS NOT NULL THEN
    -- Get minimum latency model for this capability
    DECLARE
      v_min_latency INTEGER;
    BEGIN
      SELECT MIN(m.avg_latency_ms)
      INTO v_min_latency
      FROM llm_models m
      JOIN os_model_capability_mappings mcm ON mcm.model_id = m.id
      JOIN os_model_capabilities c ON mcm.capability_id = c.id
      WHERE c.capability_key = p_capability_key
        AND mcm.is_supported = true
        AND m.is_active = true
        AND m.is_eligible = true;

      IF v_min_latency IS NOT NULL AND v_min_latency > v_policy.max_latency_ms THEN
        v_denial_reason := 'LATENCY_BUDGET_EXCEEDED';
        v_denial_details := format('Min latency for %s is %sms, but policy max is %sms',
          p_capability_key, v_min_latency, v_policy.max_latency_ms);

        INSERT INTO os_capability_denials (persona_id, capability_key, denial_reason, denial_details, envelope_hash, request_context)
        VALUES (p_persona_id, p_capability_key, v_denial_reason, v_denial_details, p_envelope_hash, p_request_context)
        RETURNING id INTO v_denial_id;

        RETURN jsonb_build_object(
          'authorized', false,
          'denial_reason', v_denial_reason,
          'denial_details', v_denial_details,
          'denial_id', v_denial_id
        );
      END IF;
    END;
  END IF;

  -- ========================================
  -- ALL CHECKS PASSED - AUTHORIZED
  -- ========================================
  RETURN jsonb_build_object(
    'authorized', true,
    'capability_key', p_capability_key,
    'persona_id', p_persona_id,
    'max_cost_per_call', v_policy.max_cost_per_call,
    'max_latency_ms', v_policy.max_latency_ms
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED: Update existing persona policies with default capabilities
-- ============================================================================

-- For existing personas, grant all 6 core capabilities by default
-- This prevents breaking existing workflows
UPDATE os_persona_policies
SET allowed_capabilities = ARRAY[
  'summarize_fast',
  'reason_deep',
  'classify_cheap',
  'extract_structured',
  'draft_safe',
  'chat_low_risk'
]
WHERE allowed_capabilities = '{}';

-- ============================================================================
-- VIEW: Capability Authorization Summary
-- ============================================================================

CREATE OR REPLACE VIEW v_persona_capability_summary AS
SELECT
  p.id as persona_id,
  p.key as persona_key,
  p.name as persona_name,
  sv.key as sub_vertical_key,
  pp.allowed_capabilities,
  pp.forbidden_capabilities,
  pp.max_cost_per_call,
  pp.max_latency_ms,
  (SELECT COUNT(*) FROM os_capability_denials d WHERE d.persona_id = p.id) as total_denials
FROM os_personas p
JOIN os_sub_verticals sv ON p.sub_vertical_id = sv.id
LEFT JOIN os_persona_policies pp ON pp.persona_id = p.id
ORDER BY sv.key, p.key;

COMMIT;
