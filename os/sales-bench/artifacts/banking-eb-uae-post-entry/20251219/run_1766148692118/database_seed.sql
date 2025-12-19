
-- ============================================================================
-- SALES-BENCH INITIAL DATA SEED
-- Generated: 2025-12-19T12:51:32.122Z
-- Suite: banking-eb-uae-post-entry
-- ============================================================================

-- Insert suite (requires vertical/sub_vertical IDs from existing data)
INSERT INTO sales_bench_suites (
    suite_key, name, description,
    vertical_id, sub_vertical_id, region_code,
    stage, scenario_manifest_hash, scenario_count,
    is_frozen, frozen_at, frozen_by, created_by
)
SELECT
    'banking-eb-uae-post-entry',
    'Banking/EB/UAE - Payroll Solutioning (Post-Entry)',
    'Employee Banking scenarios for UAE market. Post-entry sales conversations with existing leads.',
    v.id,
    sv.id,
    'UAE',
    'POST_ENTRY',
    '2f38551fc8f9157074c599a1d7cdda5bec855ef1a2f0107c93cc3623fa1f5124',
    70,
    true,
    '2025-12-19T12:51:32.122Z',
    'archive-script',
    'archive-script'
FROM os_verticals v
JOIN os_sub_verticals sv ON sv.vertical_id = v.id
WHERE v.slug = 'banking' AND sv.key = 'employee_banking'
ON CONFLICT (suite_key) DO UPDATE SET
    scenario_manifest_hash = EXCLUDED.scenario_manifest_hash,
    scenario_count = EXCLUDED.scenario_count,
    is_frozen = true,
    frozen_at = EXCLUDED.frozen_at;

-- Insert suite status
INSERT INTO sales_bench_suite_status (suite_id, status, system_validated_at, system_metrics)
SELECT
    s.id,
    'SYSTEM_VALIDATED',
    NOW(),
    '{"golden_pass_rate":91.4,"kill_containment_rate":100,"cohens_d":8.05,"coherence_status":"COHERENT","adversarial_status":"FULLY_CONTAINED","policy_status":"ZERO_TOLERANCE","overall_status":"SYSTEM_VALIDATED"}'::jsonb
FROM sales_bench_suites s
WHERE s.suite_key = 'banking-eb-uae-post-entry'
ON CONFLICT (suite_id) DO UPDATE SET
    status = 'SYSTEM_VALIDATED',
    system_validated_at = NOW(),
    system_metrics = EXCLUDED.system_metrics;

-- Insert run record
INSERT INTO sales_bench_runs (
    suite_id, suite_key, run_number, run_mode,
    scenario_manifest_hash, siva_version, model_slug, code_commit_sha,
    environment, triggered_by, trigger_source,
    started_at, ended_at, status,
    scenario_count, golden_count, kill_count,
    pass_count, fail_count, block_count,
    golden_pass_rate, kill_containment_rate, cohens_d,
    metrics, artifact_path
)
SELECT
    s.id,
    'banking-eb-uae-post-entry',
    1,
    'FULL',
    '2f38551fc8f9157074c599a1d7cdda5bec855ef1a2f0107c93cc3623fa1f5124',
    '1.0.0',
    'mock-execution',
    '6e2d2b4fba2e20cf0f8e00f7c1c834b8efe76033',
    'LOCAL',
    'archive-script',
    'CLI',
    '2025-12-19T11:26:14.496Z',
    '2025-12-19T12:51:32.121Z',
    'COMPLETED',
    70,
    35,
    35,
    32,
    0,
    0,
    91.4,
    100,
    8.05,
    '{"golden_pass_rate":91.4,"kill_containment_rate":100,"cohens_d":8.05,"coherence_status":"COHERENT","adversarial_status":"FULLY_CONTAINED","policy_status":"ZERO_TOLERANCE","overall_status":"SYSTEM_VALIDATED"}'::jsonb,
    'run_1766148692118'
FROM sales_bench_suites s
WHERE s.suite_key = 'banking-eb-uae-post-entry';

-- Insert audit log entry
INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
SELECT
    s.id,
    'SUITE_CREATED',
    'Initial suite creation and system validation archive',
    'archive-script',
    'SYSTEM'
FROM sales_bench_suites s
WHERE s.suite_key = 'banking-eb-uae-post-entry';
