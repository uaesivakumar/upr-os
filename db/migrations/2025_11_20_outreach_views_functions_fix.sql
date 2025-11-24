-- Sprint 45: Add missing views and functions for QC certification
-- This adds the views and functions that may not have been created in the initial migration

-- ==========================================================================
-- VIEWS
-- ==========================================================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_quality_summary CASCADE;
DROP VIEW IF EXISTS v_ab_test_performance CASCADE;
DROP VIEW IF EXISTS v_feedback_insights CASCADE;

-- View 1: Quality Summary
CREATE VIEW v_quality_summary AS
SELECT
  DATE(scored_at) as date,
  COUNT(*) as total_messages,
  AVG(overall_quality) as avg_quality,
  COUNT(*) FILTER (WHERE quality_tier = 'EXCELLENT') as excellent_count,
  COUNT(*) FILTER (WHERE quality_tier = 'GOOD') as good_count,
  COUNT(*) FILTER (WHERE quality_tier = 'FAIR') as fair_count,
  COUNT(*) FILTER (WHERE quality_tier = 'POOR') as poor_count
FROM outreach_quality_scores
GROUP BY DATE(scored_at)
ORDER BY date DESC;

-- View 2: A/B Test Performance
CREATE VIEW v_ab_test_performance AS
SELECT
  t.id as test_id,
  t.test_name,
  t.status,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'A') as variant_a_count,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'B') as variant_b_count,
  AVG(CASE WHEN a.assigned_variant = 'A' THEN CASE WHEN a.converted THEN 1 ELSE 0 END END) as variant_a_conversion,
  AVG(CASE WHEN a.assigned_variant = 'B' THEN CASE WHEN a.converted THEN 1 ELSE 0 END END) as variant_b_conversion,
  t.winner,
  t.confidence_level
FROM outreach_ab_tests t
LEFT JOIN outreach_ab_assignments a ON t.id = a.test_id
GROUP BY t.id, t.test_name, t.status, t.winner, t.confidence_level;

-- View 3: Feedback Insights
CREATE VIEW v_feedback_insights AS
SELECT
  DATE(created_at) as date,
  feedback_type,
  COUNT(*) as feedback_count,
  AVG(overall_rating) as avg_rating,
  COUNT(*) FILTER (WHERE sentiment = 'POSITIVE') as positive_count,
  COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE') as negative_count,
  COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed_count
FROM outreach_feedback
GROUP BY DATE(created_at), feedback_type;

-- ==========================================================================
-- FUNCTIONS
-- ==========================================================================

-- Function 1: Auto-set quality tier based on score
CREATE OR REPLACE FUNCTION auto_set_quality_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_quality >= 85 THEN
    NEW.quality_tier := 'EXCELLENT';
  ELSIF NEW.overall_quality >= 70 THEN
    NEW.quality_tier := 'GOOD';
  ELSIF NEW.overall_quality >= 60 THEN
    NEW.quality_tier := 'FAIR';
  ELSE
    NEW.quality_tier := 'POOR';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Update A/B test results on assignment change
CREATE OR REPLACE FUNCTION update_ab_test_results()
RETURNS TRIGGER AS $$
DECLARE
  test_record RECORD;
  a_conversions INTEGER;
  b_conversions INTEGER;
  a_total INTEGER;
  b_total INTEGER;
BEGIN
  -- Get current test stats
  SELECT
    COUNT(*) FILTER (WHERE assigned_variant = 'A' AND converted = TRUE) as a_conv,
    COUNT(*) FILTER (WHERE assigned_variant = 'B' AND converted = TRUE) as b_conv,
    COUNT(*) FILTER (WHERE assigned_variant = 'A') as a_tot,
    COUNT(*) FILTER (WHERE assigned_variant = 'B') as b_tot
  INTO a_conversions, b_conversions, a_total, b_total
  FROM outreach_ab_assignments
  WHERE test_id = NEW.test_id;

  -- Update test results summary
  UPDATE outreach_ab_tests
  SET results_summary = jsonb_build_object(
    'variant_a', jsonb_build_object('total', a_total, 'conversions', a_conversions),
    'variant_b', jsonb_build_object('total', b_total, 'conversions', b_conversions),
    'updated_at', NOW()
  )
  WHERE id = NEW.test_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Calculate performance rates
CREATE OR REPLACE FUNCTION calculate_performance_rates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.messages_sent > 0 THEN
    NEW.delivery_rate := (NEW.messages_delivered::NUMERIC / NEW.messages_sent::NUMERIC) * 100;
    NEW.open_rate := (NEW.messages_opened::NUMERIC / NEW.messages_sent::NUMERIC) * 100;
    NEW.click_rate := (NEW.messages_clicked::NUMERIC / NEW.messages_sent::NUMERIC) * 100;
    NEW.reply_rate := (NEW.messages_replied::NUMERIC / NEW.messages_sent::NUMERIC) * 100;
    NEW.conversion_rate := (NEW.messages_converted::NUMERIC / NEW.messages_sent::NUMERIC) * 100;
  ELSE
    NEW.delivery_rate := 0;
    NEW.open_rate := 0;
    NEW.click_rate := 0;
    NEW.reply_rate := 0;
    NEW.conversion_rate := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- TRIGGERS
-- ==========================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_auto_set_quality_tier ON outreach_quality_scores;
DROP TRIGGER IF EXISTS trigger_update_ab_test_results ON outreach_ab_assignments;
DROP TRIGGER IF EXISTS trigger_calculate_performance_rates ON outreach_performance_metrics;

-- Trigger 1: Auto-set quality tier
CREATE TRIGGER trigger_auto_set_quality_tier
  BEFORE INSERT OR UPDATE OF overall_quality ON outreach_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_quality_tier();

-- Trigger 2: Update A/B test results
CREATE TRIGGER trigger_update_ab_test_results
  AFTER INSERT OR UPDATE ON outreach_ab_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_ab_test_results();

-- Trigger 3: Calculate performance rates
CREATE TRIGGER trigger_calculate_performance_rates
  BEFORE INSERT OR UPDATE ON outreach_performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION calculate_performance_rates();

-- Verify installation
SELECT 'Views created:' as status;
SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'v_%';

SELECT 'Functions created:' as status;
SELECT proname FROM pg_proc WHERE proname IN ('auto_set_quality_tier', 'update_ab_test_results', 'calculate_performance_rates');

SELECT 'Triggers created:' as status;
SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public' AND event_object_table IN ('outreach_quality_scores', 'outreach_ab_assignments', 'outreach_performance_metrics');
