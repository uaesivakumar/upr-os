-- ============================================================================
-- Sprint 235: Sales-Bench Persona Binding (Phase 1.5)
-- ============================================================================
--
-- CRITICAL: Sales-Bench must invoke the SAME SIVA runtime path as production.
-- This migration creates:
-- 1. EB RM persona for employee_banking sub-vertical
-- 2. Persona policy with allowed capabilities
-- 3. View to retrieve persona for suite execution
--
-- REQUIREMENT: persona_id must NOT be null in validation traces
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE EB RM PERSONA FOR EMPLOYEE BANKING
-- ============================================================================

INSERT INTO os_personas (
  id,
  sub_vertical_id,
  key,
  name,
  mission,
  decision_lens,
  is_active
)
VALUES (
  'ebf50a00-0001-4000-8000-000000000001',
  'b2c3d4e5-f6a7-4890-bcde-222222222222', -- employee_banking sub-vertical
  'eb_rm',
  'Employee Banking RM',
  'Identify and qualify corporate payroll opportunities for UAE Employee Banking products',
  'As an Employee Banking Relationship Manager, I evaluate companies based on: (1) Payroll opportunity size (headcount growth), (2) WPS compliance needs, (3) Decision-maker accessibility, (4) Banking relationship openness, (5) Timing signals (new entity, expansion, contract renewal)',
  true
)
ON CONFLICT (sub_vertical_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  mission = EXCLUDED.mission,
  decision_lens = EXCLUDED.decision_lens,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. CREATE PERSONA POLICY WITH ALLOWED CAPABILITIES
-- ============================================================================

INSERT INTO os_persona_policies (
  persona_id,
  allowed_capabilities,
  forbidden_capabilities,
  max_cost_per_call,
  max_latency_ms
)
VALUES (
  'ebf50a00-0001-4000-8000-000000000001',
  ARRAY[
    'summarize_fast',
    'reason_deep',
    'classify_cheap',
    'extract_structured',
    'draft_safe',
    'chat_low_risk',
    'score_company',
    'detect_edge_cases',
    'calculate_timing',
    'match_product'
  ],
  ARRAY[]::TEXT[], -- No forbidden capabilities
  0.01, -- Max $0.01 per call
  5000  -- Max 5 seconds latency
)
ON CONFLICT (persona_id) DO UPDATE SET
  allowed_capabilities = EXCLUDED.allowed_capabilities,
  max_cost_per_call = EXCLUDED.max_cost_per_call,
  max_latency_ms = EXCLUDED.max_latency_ms,
  updated_at = NOW();

-- ============================================================================
-- 3. CREATE FUNCTION TO GET PERSONA FOR SUITE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_persona_for_suite(p_suite_key VARCHAR)
RETURNS TABLE (
  persona_id UUID,
  persona_key VARCHAR,
  persona_name VARCHAR,
  mission TEXT,
  decision_lens TEXT,
  sub_vertical_id UUID,
  sub_vertical_key VARCHAR,
  allowed_capabilities TEXT[],
  forbidden_capabilities TEXT[],
  max_cost_per_call NUMERIC,
  max_latency_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as persona_id,
    p.key as persona_key,
    p.name as persona_name,
    p.mission,
    p.decision_lens,
    sv.id as sub_vertical_id,
    sv.key as sub_vertical_key,
    pp.allowed_capabilities,
    pp.forbidden_capabilities,
    pp.max_cost_per_call,
    pp.max_latency_ms
  FROM sales_bench_suites s
  JOIN os_sub_verticals sv ON s.sub_vertical_id = sv.id
  JOIN os_personas p ON p.sub_vertical_id = sv.id
  LEFT JOIN os_persona_policies pp ON pp.persona_id = p.id
  WHERE s.suite_key = p_suite_key
    AND p.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. VIEW FOR SUITE PERSONA BINDING STATUS
-- ============================================================================

CREATE OR REPLACE VIEW v_sales_bench_persona_binding AS
SELECT
  s.suite_key,
  s.name as suite_name,
  v.key as vertical,
  sv.key as sub_vertical,
  p.id as persona_id,
  p.key as persona_key,
  p.name as persona_name,
  CASE
    WHEN p.id IS NULL THEN 'NO_PERSONA'
    WHEN pp.id IS NULL THEN 'NO_POLICY'
    ELSE 'BOUND'
  END as binding_status
FROM sales_bench_suites s
JOIN os_verticals v ON s.vertical_id = v.id
JOIN os_sub_verticals sv ON s.sub_vertical_id = sv.id
LEFT JOIN os_personas p ON p.sub_vertical_id = sv.id AND p.is_active = true
LEFT JOIN os_persona_policies pp ON pp.persona_id = p.id;

COMMIT;
