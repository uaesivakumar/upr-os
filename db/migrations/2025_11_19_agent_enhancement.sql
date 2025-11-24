-- ================================================================
-- Sprint 38: Agent Enhancement & Optimization
-- Phase 12: Multi-Agent System Maturity
-- ================================================================

-- ================================================================
-- AGENT PERFORMANCE METRICS TABLE
-- Granular performance tracking for all agents
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('TASK', 'QUALITY', 'COLLABORATION', 'RESOURCE', 'LEARNING')),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_perf_metrics_agent_id ON agent_performance_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_recorded_at ON agent_performance_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_type ON agent_performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_name ON agent_performance_metrics(metric_name);

-- ================================================================
-- AGENT PERFORMANCE SNAPSHOTS TABLE
-- Daily performance snapshots for trend analysis
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,
  avg_response_time_ms DECIMAL,
  success_rate DECIMAL(5,4),
  quality_score DECIMAL(3,2),
  collaboration_score DECIMAL(3,2),
  metrics_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_agent_id ON agent_performance_snapshots(agent_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON agent_performance_snapshots(snapshot_date);

-- ================================================================
-- AGENT SPECIALIZATIONS TABLE
-- Track agent domain expertise and specializations
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  specialization_type VARCHAR(50) NOT NULL CHECK (specialization_type IN ('DOMAIN', 'TASK_TYPE', 'DATA_TYPE', 'INDUSTRY')),
  domain VARCHAR(100) NOT NULL,
  expertise_level DECIMAL(3,2) DEFAULT 0.5 CHECK (expertise_level >= 0 AND expertise_level <= 1),
  tasks_completed INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2) DEFAULT 0,
  acquired_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_spec_agent_id ON agent_specializations(agent_id);
CREATE INDEX IF NOT EXISTS idx_spec_domain ON agent_specializations(domain);
CREATE INDEX IF NOT EXISTS idx_spec_type ON agent_specializations(specialization_type);

-- ================================================================
-- AGENT IMPROVEMENT PLANS TABLE
-- Track auto-improvement plans and results
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('PERFORMANCE_TUNING', 'FAILURE_LEARNING', 'PEER_LEARNING', 'SELF_ASSESSMENT')),
  opportunities JSONB NOT NULL,
  actions JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
  priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  completed_at TIMESTAMP,
  results JSONB
);

CREATE INDEX IF NOT EXISTS idx_improvement_agent_id ON agent_improvement_plans(agent_id);
CREATE INDEX IF NOT EXISTS idx_improvement_status ON agent_improvement_plans(status);
CREATE INDEX IF NOT EXISTS idx_improvement_priority ON agent_improvement_plans(priority);

-- ================================================================
-- COLLABORATIVE LEARNINGS TABLE
-- Shared learnings from multi-agent workflows
-- ================================================================
CREATE TABLE IF NOT EXISTS collaborative_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(100),
  participating_agents JSONB NOT NULL,
  learning_type VARCHAR(50) NOT NULL CHECK (learning_type IN ('WORKFLOW_PATTERN', 'CONSENSUS_STRATEGY', 'KNOWLEDGE_TRANSFER', 'TEAM_PERFORMANCE')),
  insights JSONB NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  applied_count INTEGER DEFAULT 0,
  effectiveness_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  last_applied TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collab_learning_workflow ON collaborative_learnings(workflow_id);
CREATE INDEX IF NOT EXISTS idx_collab_learning_type ON collaborative_learnings(learning_type);
CREATE INDEX IF NOT EXISTS idx_collab_learning_created ON collaborative_learnings(created_at);

-- ================================================================
-- VIEWS
-- ================================================================

-- Dashboard Summary View
CREATE OR REPLACE VIEW dashboard_summary_view AS
SELECT
  COUNT(DISTINCT a.id) as total_agents,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'IDLE') as idle_agents,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'BUSY') as busy_agents,
  COUNT(at.id) FILTER (WHERE at.status = 'COMPLETED' AND at.completed_at >= NOW() - INTERVAL '24 hours') as tasks_24h,
  COUNT(aw.id) FILTER (WHERE aw.status = 'IN_PROGRESS') as active_workflows,
  AVG(aps.success_rate) FILTER (WHERE aps.snapshot_date >= CURRENT_DATE - 7) as avg_success_rate_7d,
  AVG(aps.quality_score) FILTER (WHERE aps.snapshot_date >= CURRENT_DATE - 7) as avg_quality_score_7d
FROM agents a
LEFT JOIN agent_tasks at ON a.id = at.assigned_to
LEFT JOIN agent_workflows aw ON 1=1
LEFT JOIN agent_performance_snapshots aps ON a.id = aps.agent_id;

-- Agent Specialization View
CREATE OR REPLACE VIEW agent_specialization_view AS
SELECT
  a.agent_id,
  a.agent_type,
  asp.specialization_type,
  asp.domain,
  asp.expertise_level,
  asp.tasks_completed,
  asp.success_rate,
  asp.last_used
FROM agents a
JOIN agent_specializations asp ON a.id = asp.agent_id
WHERE asp.expertise_level >= 0.6
ORDER BY asp.expertise_level DESC;

-- Performance Trends View
CREATE OR REPLACE VIEW performance_trends_view AS
SELECT
  a.agent_id,
  a.agent_type,
  aps.snapshot_date,
  aps.tasks_completed,
  aps.success_rate,
  aps.quality_score,
  aps.collaboration_score,
  LAG(aps.success_rate) OVER (PARTITION BY a.id ORDER BY aps.snapshot_date) as prev_success_rate,
  aps.success_rate - LAG(aps.success_rate) OVER (PARTITION BY a.id ORDER BY aps.snapshot_date) as success_rate_change
FROM agents a
JOIN agent_performance_snapshots aps ON a.id = aps.agent_id
ORDER BY a.agent_id, aps.snapshot_date DESC;

-- ================================================================
-- FUNCTIONS
-- ================================================================

-- Record performance metric
CREATE OR REPLACE FUNCTION record_performance_metric(
  p_agent_id UUID,
  p_metric_type VARCHAR,
  p_metric_name VARCHAR,
  p_metric_value DECIMAL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
BEGIN
  INSERT INTO agent_performance_metrics (agent_id, metric_type, metric_name, metric_value, metadata)
  VALUES (p_agent_id, p_metric_type, p_metric_name, p_metric_value, p_metadata)
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Create daily performance snapshot
CREATE OR REPLACE FUNCTION create_performance_snapshot(
  p_agent_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS VOID AS $$
DECLARE
  v_tasks_completed INTEGER;
  v_tasks_failed INTEGER;
  v_avg_response_time DECIMAL;
  v_success_rate DECIMAL;
BEGIN
  -- Calculate metrics for the day
  SELECT
    COUNT(*) FILTER (WHERE at.status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE at.status = 'FAILED'),
    AVG(at.duration_ms) FILTER (WHERE at.status = 'COMPLETED'),
    CASE
      WHEN COUNT(*) > 0 THEN
        COUNT(*) FILTER (WHERE at.status = 'COMPLETED')::DECIMAL / COUNT(*)
      ELSE 1.0
    END
  INTO v_tasks_completed, v_tasks_failed, v_avg_response_time, v_success_rate
  FROM agent_tasks at
  WHERE at.assigned_to = p_agent_id
    AND DATE(at.started_at) = p_date;

  -- Insert or update snapshot
  INSERT INTO agent_performance_snapshots (
    agent_id, snapshot_date, tasks_completed, tasks_failed,
    avg_response_time_ms, success_rate, quality_score, collaboration_score
  )
  VALUES (
    p_agent_id, p_date, v_tasks_completed, v_tasks_failed,
    v_avg_response_time, v_success_rate, 0.8, 0.7
  )
  ON CONFLICT (agent_id, snapshot_date) DO UPDATE
  SET
    tasks_completed = EXCLUDED.tasks_completed,
    tasks_failed = EXCLUDED.tasks_failed,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    success_rate = EXCLUDED.success_rate;
END;
$$ LANGUAGE plpgsql;

-- Calculate system health score
CREATE OR REPLACE FUNCTION calculate_system_health() RETURNS DECIMAL AS $$
DECLARE
  v_health_score DECIMAL;
  v_active_agents INTEGER;
  v_total_agents INTEGER;
  v_avg_success_rate DECIMAL;
  v_error_agents INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status IN ('IDLE', 'BUSY')),
    COUNT(*),
    AVG((performance_metrics->>'success_rate')::DECIMAL),
    COUNT(*) FILTER (WHERE status = 'ERROR')
  INTO v_active_agents, v_total_agents, v_avg_success_rate, v_error_agents
  FROM agents;

  -- Calculate health score
  v_health_score := 1.0;

  -- Penalize for inactive agents
  IF v_total_agents > 0 THEN
    v_health_score := v_health_score * (v_active_agents::DECIMAL / v_total_agents);
  END IF;

  -- Factor in success rate
  v_health_score := v_health_score * COALESCE(v_avg_success_rate, 1.0);

  -- Penalize for error agents
  IF v_error_agents > 0 THEN
    v_health_score := v_health_score * (1.0 - (v_error_agents::DECIMAL / v_total_agents) * 0.3);
  END IF;

  RETURN GREATEST(0, LEAST(1, v_health_score));
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- COMMENTS
-- ================================================================
COMMENT ON TABLE agent_performance_metrics IS 'Granular performance metrics for all agents';
COMMENT ON TABLE agent_performance_snapshots IS 'Daily performance snapshots for trend analysis';
COMMENT ON TABLE agent_specializations IS 'Agent domain expertise and specializations';
COMMENT ON TABLE agent_improvement_plans IS 'Auto-improvement plans and execution tracking';
COMMENT ON TABLE collaborative_learnings IS 'Shared learnings from multi-agent workflows';

-- ================================================================
-- DEPLOYMENT COMPLETE
-- ================================================================
