-- Sprint 19 Database Seeder
-- Populates tables with realistic test data for smoke tests

-- 1. Seed source_performance_metrics
INSERT INTO source_performance_metrics (
  source_id, total_executions, successful_executions, failed_executions,
  success_rate, total_signals_discovered, high_quality_signals, quality_rate,
  avg_execution_time_ms, calculated_priority, manual_priority_override,
  effective_priority, last_execution_at, metrics_updated_at
) VALUES
  ('linkedin', 150, 135, 15, 0.9000, 850, 520, 0.6118, 2500, 0.85, 0.85, 0.85, NOW(), NOW()),
  ('news', 120, 110, 10, 0.9167, 450, 280, 0.6222, 1800, 0.80, NULL, 0.80, NOW(), NOW()),
  ('jobs', 80, 75, 5, 0.9375, 320, 195, 0.6094, 2200, 0.75, NULL, 0.75, NOW(), NOW()),
  ('social', 95, 88, 7, 0.9263, 410, 240, 0.5854, 2000, 0.70, NULL, 0.70, NOW(), NOW())
ON CONFLICT (source_id) DO UPDATE SET
  total_executions = EXCLUDED.total_executions,
  successful_executions = EXCLUDED.successful_executions,
  failed_executions = EXCLUDED.failed_executions,
  success_rate = EXCLUDED.success_rate,
  total_signals_discovered = EXCLUDED.total_signals_discovered,
  high_quality_signals = EXCLUDED.high_quality_signals,
  quality_rate = EXCLUDED.quality_rate,
  avg_execution_time_ms = EXCLUDED.avg_execution_time_ms,
  calculated_priority = EXCLUDED.calculated_priority,
  manual_priority_override = EXCLUDED.manual_priority_override,
  effective_priority = EXCLUDED.effective_priority,
  last_execution_at = EXCLUDED.last_execution_at,
  metrics_updated_at = EXCLUDED.metrics_updated_at;

-- 2. Seed source_health (circuit breaker)
INSERT INTO source_health (
  source_id, is_healthy, failure_count, last_failure_at,
  circuit_breaker_state, last_checked_at
) VALUES
  ('linkedin', true, 0, NULL, 'closed', NOW()),
  ('news', true, 0, NULL, 'closed', NOW()),
  ('jobs', true, 1, NOW() - INTERVAL '2 hours', 'closed', NOW()),
  ('social', false, 3, NOW() - INTERVAL '30 minutes', 'open', NOW())
ON CONFLICT (source_id) DO UPDATE SET
  is_healthy = EXCLUDED.is_healthy,
  failure_count = EXCLUDED.failure_count,
  last_failure_at = EXCLUDED.last_failure_at,
  circuit_breaker_state = EXCLUDED.circuit_breaker_state,
  last_checked_at = EXCLUDED.last_checked_at;

-- 3. Seed hiring_signals with quality scores
INSERT INTO hiring_signals (
  tenant_id, company, domain, sector, location,
  trigger_type, description, source_url, source_date,
  source_type, confidence_score, quality_score, quality_tier,
  quality_breakdown, dedupe_hash, created_at
) VALUES
  -- High quality signals
  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'Emirates NBD', 'emiratesnbd.com', 'Banking', 'Dubai',
   'EXPANSION', 'Emirates NBD announces major expansion in Dubai',
   'https://linkedin.com/company/emiratesnbd', NOW() - INTERVAL '2 days',
   'SOCIAL_MEDIA', 0.92, 0.88, 'HIGH',
   '{"confidence": 0.92, "reliability": 0.85, "freshness": 0.95, "completeness": 0.90}',
   'emiratesnbd-linkedin-1', NOW() - INTERVAL '2 days'),

  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'First Abu Dhabi Bank', 'bankfab.com', 'Banking', 'Abu Dhabi',
   'EXPANSION', 'FAB opens new technology center in Abu Dhabi',
   'https://linkedin.com/company/fab', NOW() - INTERVAL '1 day',
   'SOCIAL_MEDIA', 0.88, 0.82, 'HIGH',
   '{"confidence": 0.88, "reliability": 0.80, "freshness": 0.90, "completeness": 0.85}',
   'fab-linkedin-1', NOW() - INTERVAL '1 day'),

  -- Medium quality signals
  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'Dubai Islamic Bank', 'dib.ae', 'Banking', 'Dubai',
   'PRODUCT_LAUNCH', 'DIB launches new digital banking platform',
   'https://linkedin.com/company/dib', NOW() - INTERVAL '5 days',
   'SOCIAL_MEDIA', 0.75, 0.68, 'MEDIUM',
   '{"confidence": 0.75, "reliability": 0.70, "freshness": 0.65, "completeness": 0.70}',
   'dib-linkedin-1', NOW() - INTERVAL '5 days'),

  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'Mashreq Bank', 'mashreqbank.com', 'Banking', 'Dubai',
   'HIRING', 'Mashreq Bank hiring software engineers in Dubai',
   'https://linkedin.com/company/mashreq', NOW() - INTERVAL '7 days',
   'SOCIAL_MEDIA', 0.70, 0.62, 'MEDIUM',
   '{"confidence": 0.70, "reliability": 0.65, "freshness": 0.55, "completeness": 0.68}',
   'mashreq-linkedin-1', NOW() - INTERVAL '7 days'),

  -- Duplicate signal for deduplication testing
  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'Emirates NBD', 'emiratesnbd.com', 'Banking', 'Dubai',
   'EXPANSION', 'Emirates NBD major expansion announced in Dubai area',
   'https://news.example.com/emiratesnbd-expansion', NOW() - INTERVAL '2 days',
   'NEWS', 0.85, 0.80, 'HIGH',
   '{"confidence": 0.85, "reliability": 0.82, "freshness": 0.95, "completeness": 0.75}',
   'emiratesnbd-news-1', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- 4. Seed orchestration_runs
INSERT INTO orchestration_runs (
  tenant_id, orchestration_id, sources_requested, sources_executed,
  sources_successful, sources_failed, filters, total_signals,
  unique_signals, execution_time_ms, deduplication_stats,
  quality_stats, created_at
) VALUES
  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'orch_seed_1',
   ARRAY['linkedin', 'news'], ARRAY['linkedin', 'news'],
   ARRAY['linkedin', 'news'], ARRAY[]::text[],
   '{"location": "UAE", "sector": "Banking"}'::jsonb,
   5, 4, 2800,
   '{"originalCount": 5, "uniqueCount": 4, "duplicatesRemoved": 1}'::jsonb,
   '{"averageScore": 0.76, "highQualityCount": 2, "highQualityRate": 0.50}'::jsonb,
   NOW() - INTERVAL '1 day'),

  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'orch_seed_2',
   ARRAY['linkedin'], ARRAY['linkedin'],
   ARRAY['linkedin'], ARRAY[]::text[],
   '{"location": "Dubai"}'::jsonb,
   2, 2, 1500,
   '{"originalCount": 2, "uniqueCount": 2, "duplicatesRemoved": 0}'::jsonb,
   '{"averageScore": 0.85, "highQualityCount": 2, "highQualityRate": 1.0}'::jsonb,
   NOW() - INTERVAL '3 hours'),

  ('e2d48fa8-f6d1-4b70-a939-29efb47b0dc9', 'orch_seed_3',
   ARRAY['linkedin', 'news', 'jobs'], ARRAY['linkedin', 'news', 'jobs'],
   ARRAY['linkedin', 'news'], ARRAY['jobs'],
   '{"sector": "Banking"}'::jsonb,
   3, 3, 4200,
   '{"originalCount": 3, "uniqueCount": 3, "duplicatesRemoved": 0}'::jsonb,
   '{"averageScore": 0.70, "highQualityCount": 1, "highQualityRate": 0.33}'::jsonb,
   NOW() - INTERVAL '12 hours')
ON CONFLICT DO NOTHING;

-- Verify seeded data
SELECT 'source_performance_metrics' as table_name, COUNT(*) as count FROM source_performance_metrics
UNION ALL
SELECT 'source_health', COUNT(*) FROM source_health
UNION ALL
SELECT 'hiring_signals (with quality)', COUNT(*) FROM hiring_signals WHERE quality_score IS NOT NULL
UNION ALL
SELECT 'orchestration_runs', COUNT(*) FROM orchestration_runs;
