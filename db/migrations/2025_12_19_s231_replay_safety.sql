-- ============================================================================
-- Sprint 231: Replay Safety Integration
-- ============================================================================
--
-- Make every routing decision replayable, explainable, and deviation-aware.
--
-- INVARIANT: Replay is not "best effort." Replay is law.
-- INVARIANT: No overwrites. No updates. Append-only.
-- INVARIANT: Replay is exact or flagged, never hidden.
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXTEND os_routing_decisions FOR REPLAY
-- ============================================================================

-- Add interaction_id for replay lookups
ALTER TABLE os_routing_decisions
  ADD COLUMN IF NOT EXISTS interaction_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS routing_score NUMERIC(6,2);

-- Create index for interaction_id lookups (primary replay key)
CREATE INDEX IF NOT EXISTS idx_os_routing_decisions_interaction
  ON os_routing_decisions(interaction_id) WHERE interaction_id IS NOT NULL;

-- Comment explaining append-only semantics
COMMENT ON TABLE os_routing_decisions IS
  'Append-only routing decision log. NO overwrites. NO updates. Each interaction_id appears exactly once.';

COMMENT ON COLUMN os_routing_decisions.interaction_id IS
  'Unique interaction identifier for replay. Once written, never modified.';

-- ============================================================================
-- REPLAY RESOLUTION FUNCTION
-- ============================================================================
-- resolve_model_for_replay(interaction_id)
--
-- Behavior:
-- 1. Load original routing decision
-- 2. Check if original model is still active, eligible, supports capability
-- 3. If yes → reuse same model
-- 4. If no → flag deviation (NO silent substitution)
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_model_for_replay(p_interaction_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_decision RECORD;
  v_model RECORD;
  v_deviation_reason TEXT;
BEGIN
  -- ========================================
  -- STEP 1: Load original routing decision
  -- ========================================
  SELECT * INTO v_decision
  FROM os_routing_decisions
  WHERE interaction_id = p_interaction_id;

  IF v_decision IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DECISION_NOT_FOUND',
      'message', format('No routing decision found for interaction_id: %s', p_interaction_id)
    );
  END IF;

  -- ========================================
  -- STEP 2: Check if original model is still valid
  -- ========================================
  SELECT m.*, p.provider_type
  INTO v_model
  FROM llm_models m
  JOIN llm_providers p ON m.provider_id = p.id
  WHERE m.id = v_decision.model_id;

  IF v_model IS NULL THEN
    -- Model was deleted (should never happen, but handle it)
    v_deviation_reason := 'MODEL_DELETED';
  ELSIF NOT v_model.is_active THEN
    v_deviation_reason := 'MODEL_INACTIVE';
  ELSIF NOT v_model.is_eligible THEN
    v_deviation_reason := 'MODEL_INELIGIBLE';
  ELSIF NOT (v_decision.capability_key = ANY(v_model.supported_capabilities)) THEN
    v_deviation_reason := 'CAPABILITY_NO_LONGER_SUPPORTED';
  ELSIF v_decision.capability_key = ANY(COALESCE(v_model.disallowed_capabilities, '{}')) THEN
    v_deviation_reason := 'CAPABILITY_NOW_DISALLOWED';
  ELSE
    v_deviation_reason := NULL;  -- No deviation
  END IF;

  -- ========================================
  -- STEP 3: Return replay resolution
  -- ========================================
  IF v_deviation_reason IS NULL THEN
    -- No deviation: reuse exact same model
    RETURN jsonb_build_object(
      'success', true,
      'replay_deviation', false,
      'original_model_id', v_decision.model_id,
      'replay_model_id', v_decision.model_id,
      'original_model_slug', v_model.slug,
      'replay_model_slug', v_model.slug,
      'capability_key', v_decision.capability_key,
      'routing_score', v_decision.routing_score,
      'routing_reason', v_decision.routing_reason,
      'envelope_hash', v_decision.envelope_hash,
      'original_created_at', v_decision.created_at
    );
  ELSE
    -- Deviation detected: flag it explicitly
    RETURN jsonb_build_object(
      'success', true,
      'replay_deviation', true,
      'deviation_reason', v_deviation_reason,
      'original_model_id', v_decision.model_id,
      'replay_model_id', NULL,  -- Caller must re-route if needed
      'original_model_slug', COALESCE(v_model.slug, 'UNKNOWN'),
      'replay_model_slug', NULL,
      'capability_key', v_decision.capability_key,
      'routing_score', v_decision.routing_score,
      'routing_reason', v_decision.routing_reason,
      'envelope_hash', v_decision.envelope_hash,
      'original_created_at', v_decision.created_at,
      'deviation_details', CASE v_deviation_reason
        WHEN 'MODEL_DELETED' THEN 'Original model has been deleted from the system'
        WHEN 'MODEL_INACTIVE' THEN 'Original model has been deactivated'
        WHEN 'MODEL_INELIGIBLE' THEN 'Original model is no longer eligible for routing'
        WHEN 'CAPABILITY_NO_LONGER_SUPPORTED' THEN format('Original model no longer supports capability: %s', v_decision.capability_key)
        WHEN 'CAPABILITY_NOW_DISALLOWED' THEN format('Capability %s is now disallowed for original model', v_decision.capability_key)
        ELSE 'Unknown deviation'
      END
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- REPLAY AUDIT VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_routing_decision_audit AS
SELECT
  rd.id,
  rd.interaction_id,
  rd.capability_key,
  rd.persona_id,
  p.key as persona_key,
  rd.model_id,
  m.slug as model_slug,
  m.is_active as model_active,
  m.is_eligible as model_eligible,
  rd.routing_score,
  rd.routing_reason,
  rd.envelope_hash,
  rd.channel,
  rd.created_at,
  -- Replay status (computed)
  CASE
    WHEN m.id IS NULL THEN 'MODEL_DELETED'
    WHEN NOT m.is_active THEN 'MODEL_INACTIVE'
    WHEN NOT m.is_eligible THEN 'MODEL_INELIGIBLE'
    WHEN NOT (rd.capability_key = ANY(m.supported_capabilities)) THEN 'CAPABILITY_CHANGED'
    ELSE 'REPLAYABLE'
  END as replay_status
FROM os_routing_decisions rd
LEFT JOIN llm_models m ON rd.model_id = m.id
LEFT JOIN os_personas p ON rd.persona_id = p.id
ORDER BY rd.created_at DESC;

COMMIT;
