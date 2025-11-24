-- ================================================================
-- Sprint 37: Multi-Agent Collaboration & Reflection
-- Phase 11: Intelligent Agent Orchestration System
-- ================================================================

-- ================================================================
-- AGENTS TABLE
-- Stores registered agents with their capabilities and status
-- ================================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN ('Discovery', 'Validation', 'Critic', 'Coordinator', 'Custom')),
  agent_id VARCHAR(100) UNIQUE NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'BUSY', 'ERROR', 'OFFLINE')),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  performance_metrics JSONB DEFAULT '{
    "tasks_completed": 0,
    "success_rate": 1.0,
    "avg_response_time_ms": 0,
    "total_reflections": 0
  }'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_agent_type ON agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON agents USING gin(capabilities);

-- ================================================================
-- AGENT_TASKS TABLE
-- Tracks tasks assigned to agents
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(100) UNIQUE NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  assigned_to UUID REFERENCES agents(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
  priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_task_id ON agent_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned_to ON agent_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON agent_tasks(created_at);

-- ================================================================
-- AGENT_COMMUNICATIONS TABLE
-- Tracks inter-agent communications
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(100) UNIQUE NOT NULL,
  from_agent UUID REFERENCES agents(id) ON DELETE CASCADE,
  to_agent UUID REFERENCES agents(id) ON DELETE CASCADE,
  message_type VARCHAR(50) NOT NULL,
  message JSONB NOT NULL,
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  sent_at TIMESTAMP DEFAULT NOW(),
  received_at TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  response JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_comms_from_agent ON agent_communications(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_comms_to_agent ON agent_communications(to_agent);
CREATE INDEX IF NOT EXISTS idx_agent_comms_message_type ON agent_communications(message_type);
CREATE INDEX IF NOT EXISTS idx_agent_comms_acknowledged ON agent_communications(acknowledged);

-- ================================================================
-- AGENT_REFLECTIONS TABLE
-- Stores agent reflections on decisions and outcomes
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id VARCHAR(100) UNIQUE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  decision_id VARCHAR(100),
  decision JSONB NOT NULL,
  outcome JSONB,
  reflection TEXT,
  learnings JSONB DEFAULT '[]'::jsonb,
  shared_with JSONB DEFAULT '[]'::jsonb,
  impact_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reflections_agent_id ON agent_reflections(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reflections_decision_id ON agent_reflections(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_reflections_created_at ON agent_reflections(created_at);

-- ================================================================
-- AGENT_WORKFLOWS TABLE
-- Defines and tracks multi-agent workflows
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(100) UNIQUE NOT NULL,
  workflow_type VARCHAR(50) NOT NULL CHECK (workflow_type IN ('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL', 'REVIEW', 'CUSTOM')),
  workflow_name VARCHAR(200),
  definition JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
  participating_agents JSONB DEFAULT '[]'::jsonb,
  input JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  results JSONB,
  error JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_workflow_id ON agent_workflows(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_workflow_type ON agent_workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_status ON agent_workflows(status);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_created_at ON agent_workflows(created_at);

-- ================================================================
-- AGENT_CONSENSUS TABLE
-- Tracks consensus building among agents
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_consensus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consensus_id VARCHAR(100) UNIQUE NOT NULL,
  task_id VARCHAR(100) NOT NULL,
  participating_agents JSONB NOT NULL,
  individual_opinions JSONB NOT NULL,
  consensus_result JSONB,
  consensus_method VARCHAR(50) DEFAULT 'MAJORITY_VOTE' CHECK (consensus_method IN ('MAJORITY_VOTE', 'WEIGHTED', 'UNANIMOUS', 'FIRST_VALID', 'CUSTOM')),
  agreement_score DECIMAL(5,2),
  conflicts JSONB DEFAULT '[]'::jsonb,
  resolution JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_consensus_task_id ON agent_consensus(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_consensus_created_at ON agent_consensus(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_consensus_agreement_score ON agent_consensus(agreement_score);

-- ================================================================
-- VIEWS
-- ================================================================

-- Agent Performance View
CREATE OR REPLACE VIEW agent_performance_view AS
SELECT
  a.id,
  a.agent_id,
  a.agent_type,
  a.status,
  a.performance_metrics->>'tasks_completed' as tasks_completed,
  a.performance_metrics->>'success_rate' as success_rate,
  a.performance_metrics->>'avg_response_time_ms' as avg_response_time_ms,
  COUNT(at.id) FILTER (WHERE at.status = 'IN_PROGRESS') as active_tasks,
  COUNT(at.id) FILTER (WHERE at.status = 'COMPLETED') as completed_tasks,
  COUNT(at.id) FILTER (WHERE at.status = 'FAILED') as failed_tasks,
  AVG(at.duration_ms) FILTER (WHERE at.status = 'COMPLETED') as avg_task_duration_ms,
  a.last_active_at
FROM agents a
LEFT JOIN agent_tasks at ON a.id = at.assigned_to
GROUP BY a.id, a.agent_id, a.agent_type, a.status, a.performance_metrics, a.last_active_at;

-- Workflow Summary View
CREATE OR REPLACE VIEW workflow_summary_view AS
SELECT
  w.workflow_id,
  w.workflow_type,
  w.workflow_name,
  w.status,
  w.started_at,
  w.completed_at,
  w.duration_ms,
  jsonb_array_length(w.participating_agents) as agent_count,
  w.created_at
FROM agent_workflows w
ORDER BY w.created_at DESC;

-- Agent Collaboration View
CREATE OR REPLACE VIEW agent_collaboration_view AS
SELECT
  ac.from_agent,
  ac.to_agent,
  fa.agent_id as from_agent_name,
  ta.agent_id as to_agent_name,
  COUNT(*) as message_count,
  COUNT(*) FILTER (WHERE ac.acknowledged = true) as acknowledged_count,
  AVG(EXTRACT(EPOCH FROM (ac.received_at - ac.sent_at))) as avg_response_time_seconds,
  MAX(ac.sent_at) as last_communication
FROM agent_communications ac
JOIN agents fa ON ac.from_agent = fa.id
JOIN agents ta ON ac.to_agent = ta.id
GROUP BY ac.from_agent, ac.to_agent, fa.agent_id, ta.agent_id;

-- ================================================================
-- FUNCTIONS
-- ================================================================

-- Function to update agent metrics
CREATE OR REPLACE FUNCTION update_agent_metrics(
  p_agent_id UUID,
  p_task_completed BOOLEAN,
  p_duration_ms INTEGER
) RETURNS VOID AS $$
DECLARE
  v_current_metrics JSONB;
  v_tasks_completed INTEGER;
  v_total_tasks INTEGER;
  v_success_rate DECIMAL;
  v_avg_response_time DECIMAL;
BEGIN
  -- Get current metrics
  SELECT performance_metrics INTO v_current_metrics
  FROM agents WHERE id = p_agent_id;

  -- Update metrics
  v_tasks_completed := (v_current_metrics->>'tasks_completed')::INTEGER;

  IF p_task_completed THEN
    v_tasks_completed := v_tasks_completed + 1;
  END IF;

  v_total_tasks := v_tasks_completed +
    (SELECT COUNT(*) FROM agent_tasks WHERE assigned_to = p_agent_id AND status = 'FAILED');

  v_success_rate := CASE
    WHEN v_total_tasks > 0 THEN v_tasks_completed::DECIMAL / v_total_tasks
    ELSE 1.0
  END;

  v_avg_response_time := (
    SELECT AVG(duration_ms)
    FROM agent_tasks
    WHERE assigned_to = p_agent_id AND status = 'COMPLETED'
  );

  -- Update agent
  UPDATE agents
  SET
    performance_metrics = jsonb_build_object(
      'tasks_completed', v_tasks_completed,
      'success_rate', v_success_rate,
      'avg_response_time_ms', COALESCE(v_avg_response_time, 0),
      'total_reflections', (v_current_metrics->>'total_reflections')::INTEGER
    ),
    last_active_at = NOW()
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find available agents by capability
CREATE OR REPLACE FUNCTION find_available_agents(
  p_capabilities JSONB
) RETURNS TABLE (
  agent_id UUID,
  agent_name VARCHAR,
  agent_type VARCHAR,
  matching_capabilities JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.agent_id,
    a.agent_type,
    a.capabilities
  FROM agents a
  WHERE
    a.status IN ('IDLE', 'BUSY')
    AND a.capabilities ?| ARRAY(SELECT jsonb_array_elements_text(p_capabilities))
  ORDER BY
    (a.performance_metrics->>'success_rate')::DECIMAL DESC,
    (SELECT COUNT(*) FROM agent_tasks WHERE assigned_to = a.id AND status = 'IN_PROGRESS') ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate consensus score
CREATE OR REPLACE FUNCTION calculate_consensus_score(
  p_opinions JSONB
) RETURNS DECIMAL AS $$
DECLARE
  v_total_opinions INTEGER;
  v_matching_opinions INTEGER;
  v_score DECIMAL;
BEGIN
  v_total_opinions := jsonb_array_length(p_opinions);

  IF v_total_opinions <= 1 THEN
    RETURN 1.0;
  END IF;

  -- Simple consensus: count how many agree with majority
  v_matching_opinions := (
    SELECT COUNT(*)::INTEGER
    FROM jsonb_array_elements(p_opinions) AS opinion
    WHERE opinion->>'decision' = (
      SELECT opinion->>'decision'
      FROM jsonb_array_elements(p_opinions) AS opinion
      GROUP BY opinion->>'decision'
      ORDER BY COUNT(*) DESC
      LIMIT 1
    )
  );

  v_score := v_matching_opinions::DECIMAL / v_total_opinions;
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- SEED DATA
-- ================================================================

-- Seed initial agent types (will be registered programmatically)
-- This is just for reference

COMMENT ON TABLE agents IS 'Registry of all agents in the multi-agent system';
COMMENT ON TABLE agent_tasks IS 'Tasks assigned to and processed by agents';
COMMENT ON TABLE agent_communications IS 'Inter-agent communication messages';
COMMENT ON TABLE agent_reflections IS 'Agent reflections on decisions and outcomes';
COMMENT ON TABLE agent_workflows IS 'Multi-agent workflow definitions and executions';
COMMENT ON TABLE agent_consensus IS 'Consensus building results among agents';

-- ================================================================
-- DEPLOYMENT COMPLETE
-- ================================================================
