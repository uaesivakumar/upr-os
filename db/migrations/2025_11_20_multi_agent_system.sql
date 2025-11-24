/**
 * Sprint 42: Multi-Agent System Database Schema
 * Date: 2025-11-20
 *
 * Creates tables and indexes for:
 * - Agent message communication
 * - Agent performance tracking
 * - Consensus voting mechanism
 */

-- Ensure agent_core schema exists
CREATE SCHEMA IF NOT EXISTS agent_core;

-- =============================================================================
-- 1. AGENT MESSAGES TABLE
-- =============================================================================
-- Tracks all inter-agent communications for auditing and debugging

CREATE TABLE IF NOT EXISTS agent_core.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE,
  correlation_id UUID NOT NULL,
  from_agent VARCHAR(100) NOT NULL,
  to_agent VARCHAR(100) NOT NULL,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('REQUEST', 'RESPONSE', 'NOTIFICATION')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Indexes for efficient queries
  CONSTRAINT valid_message_type CHECK (message_type IN ('REQUEST', 'RESPONSE', 'NOTIFICATION'))
);

CREATE INDEX idx_agent_messages_correlation ON agent_core.agent_messages(correlation_id);
CREATE INDEX idx_agent_messages_to_agent ON agent_core.agent_messages(to_agent, processed_at);
CREATE INDEX idx_agent_messages_from_agent ON agent_core.agent_messages(from_agent, created_at);
CREATE INDEX idx_agent_messages_created_at ON agent_core.agent_messages(created_at DESC);

COMMENT ON TABLE agent_core.agent_messages IS 'Inter-agent communication messages with correlation tracking';
COMMENT ON COLUMN agent_core.agent_messages.message_id IS 'Unique message identifier';
COMMENT ON COLUMN agent_core.agent_messages.correlation_id IS 'Links related messages in a conversation thread';
COMMENT ON COLUMN agent_core.agent_messages.from_agent IS 'Source agent identifier';
COMMENT ON COLUMN agent_core.agent_messages.to_agent IS 'Destination agent identifier (or "broadcast")';
COMMENT ON COLUMN agent_core.agent_messages.message_type IS 'Type: REQUEST, RESPONSE, or NOTIFICATION';
COMMENT ON COLUMN agent_core.agent_messages.payload IS 'Message payload with action, data, and context';

-- =============================================================================
-- 2. AGENT PERFORMANCE TABLE
-- =============================================================================
-- Tracks performance metrics for each agent over time

CREATE TABLE IF NOT EXISTS agent_core.agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL,
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN ('discovery', 'validation', 'critic')),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  period VARCHAR(20) CHECK (period IN ('hourly', 'daily', 'weekly'))
);

CREATE INDEX idx_agent_performance_agent ON agent_core.agent_performance(agent_id, measured_at DESC);
CREATE INDEX idx_agent_performance_metric ON agent_core.agent_performance(metric_name, measured_at DESC);
CREATE INDEX idx_agent_performance_type ON agent_core.agent_performance(agent_type, measured_at DESC);

COMMENT ON TABLE agent_core.agent_performance IS 'Performance metrics for individual agents';
COMMENT ON COLUMN agent_core.agent_performance.agent_id IS 'Agent identifier';
COMMENT ON COLUMN agent_core.agent_performance.agent_type IS 'Type of agent: discovery, validation, or critic';
COMMENT ON COLUMN agent_core.agent_performance.metric_name IS 'Name of the metric being measured';
COMMENT ON COLUMN agent_core.agent_performance.metric_value IS 'Numeric value of the metric';
COMMENT ON COLUMN agent_core.agent_performance.period IS 'Aggregation period: hourly, daily, or weekly';

-- =============================================================================
-- 3. CONSENSUS VOTES TABLE
-- =============================================================================
-- Tracks individual agent votes in consensus decisions

CREATE TABLE IF NOT EXISTS agent_core.consensus_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL,
  agent_id VARCHAR(100) NOT NULL,
  vote JSONB NOT NULL,
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_consensus_votes_decision ON agent_core.consensus_votes(decision_id, voted_at);
CREATE INDEX idx_consensus_votes_agent ON agent_core.consensus_votes(agent_id, voted_at DESC);

COMMENT ON TABLE agent_core.consensus_votes IS 'Individual agent votes for consensus decision-making';
COMMENT ON COLUMN agent_core.consensus_votes.decision_id IS 'Decision identifier (references agent_decisions)';
COMMENT ON COLUMN agent_core.consensus_votes.agent_id IS 'Agent identifier who cast the vote';
COMMENT ON COLUMN agent_core.consensus_votes.vote IS 'The vote data/decision';
COMMENT ON COLUMN agent_core.consensus_votes.confidence IS 'Confidence score (0.0 to 1.0)';
COMMENT ON COLUMN agent_core.consensus_votes.reasoning IS 'Explanation for the vote';

-- =============================================================================
-- 4. UPDATE EXISTING AGENT_DECISIONS TABLE
-- =============================================================================
-- Add new columns to support multi-agent workflows

DO $$
BEGIN
  -- Check if agent_id column exists, add if not
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'agent_core'
    AND table_name = 'agent_decisions'
    AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE agent_core.agent_decisions
    ADD COLUMN agent_id VARCHAR(100);

    COMMENT ON COLUMN agent_core.agent_decisions.agent_id IS 'Identifier of the agent that made the decision';
  END IF;

  -- Check if agent_type column exists, add if not
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'agent_core'
    AND table_name = 'agent_decisions'
    AND column_name = 'agent_type'
  ) THEN
    ALTER TABLE agent_core.agent_decisions
    ADD COLUMN agent_type VARCHAR(50);

    COMMENT ON COLUMN agent_core.agent_decisions.agent_type IS 'Type of agent: discovery, validation, or critic';
  END IF;

  -- Check if parent_decision_id column exists, add if not
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'agent_core'
    AND table_name = 'agent_decisions'
    AND column_name = 'parent_decision_id'
  ) THEN
    ALTER TABLE agent_core.agent_decisions
    ADD COLUMN parent_decision_id UUID REFERENCES agent_core.agent_decisions(decision_id);

    CREATE INDEX idx_agent_decisions_parent ON agent_core.agent_decisions(parent_decision_id);

    COMMENT ON COLUMN agent_core.agent_decisions.parent_decision_id IS 'Links child decisions to parent (for decision chains)';
  END IF;

  -- Check if consensus_score column exists, add if not
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'agent_core'
    AND table_name = 'agent_decisions'
    AND column_name = 'consensus_score'
  ) THEN
    ALTER TABLE agent_core.agent_decisions
    ADD COLUMN consensus_score DECIMAL(5,2) CHECK (consensus_score IS NULL OR (consensus_score >= 0 AND consensus_score <= 100));

    COMMENT ON COLUMN agent_core.agent_decisions.consensus_score IS 'Consensus agreement percentage (0-100)';
  END IF;
END $$;

-- =============================================================================
-- 5. MATERIALIZED VIEW: AGENT PERFORMANCE SUMMARY
-- =============================================================================
-- Aggregated performance metrics for monitoring dashboard

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_core.agent_performance_summary AS
SELECT
  COALESCE(agent_id, 'unknown') as agent_id,
  COALESCE(agent_type, 'unknown') as agent_type,
  COUNT(*) as total_decisions,
  AVG(confidence_score) as avg_confidence,
  COUNT(CASE WHEN consensus_score >= 90 THEN 1 END)::FLOAT / NULLIF(COUNT(consensus_score), 0) as strong_consensus_rate,
  MAX(created_at) as last_decision_at,
  COUNT(DISTINCT DATE(created_at)) as active_days
FROM agent_core.agent_decisions
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND agent_id IS NOT NULL
GROUP BY agent_id, agent_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_performance_summary_agent ON agent_core.agent_performance_summary(agent_id);

COMMENT ON MATERIALIZED VIEW agent_core.agent_performance_summary IS 'Aggregated performance metrics for the last 30 days';

-- =============================================================================
-- 6. FUNCTION: REFRESH AGENT PERFORMANCE SUMMARY
-- =============================================================================

CREATE OR REPLACE FUNCTION agent_core.refresh_agent_performance_summary()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY agent_core.agent_performance_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION agent_core.refresh_agent_performance_summary() IS 'Refreshes the agent performance summary materialized view';

-- =============================================================================
-- 7. FUNCTION: GET MESSAGE CHAIN
-- =============================================================================
-- Retrieves all messages in a conversation thread

CREATE OR REPLACE FUNCTION agent_core.get_message_chain(p_correlation_id UUID)
RETURNS TABLE (
  message_id UUID,
  from_agent VARCHAR(100),
  to_agent VARCHAR(100),
  message_type VARCHAR(20),
  payload JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.message_id,
    am.from_agent,
    am.to_agent,
    am.message_type,
    am.payload,
    am.created_at
  FROM agent_core.agent_messages am
  WHERE am.correlation_id = p_correlation_id
  ORDER BY am.created_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION agent_core.get_message_chain(UUID) IS 'Retrieves all messages for a given correlation ID';

-- =============================================================================
-- 8. FUNCTION: CALCULATE CONSENSUS
-- =============================================================================
-- Calculates consensus statistics for a decision

CREATE OR REPLACE FUNCTION agent_core.calculate_consensus(p_decision_id UUID)
RETURNS TABLE (
  total_votes INTEGER,
  avg_confidence DECIMAL(5,2),
  consensus_level VARCHAR(20),
  winning_vote JSONB
) AS $$
DECLARE
  v_total_votes INTEGER;
  v_avg_confidence DECIMAL(5,2);
  v_consensus_level VARCHAR(20);
  v_winning_vote JSONB;
  v_max_weight DECIMAL(10,2);
BEGIN
  -- Count total votes
  SELECT COUNT(*) INTO v_total_votes
  FROM agent_core.consensus_votes
  WHERE decision_id = p_decision_id;

  -- Calculate average confidence
  SELECT AVG(confidence) INTO v_avg_confidence
  FROM agent_core.consensus_votes
  WHERE decision_id = p_decision_id;

  -- Find winning vote (most supported by weighted confidence)
  SELECT
    cv.vote,
    SUM(cv.confidence) as total_weight
  INTO v_winning_vote, v_max_weight
  FROM agent_core.consensus_votes cv
  WHERE cv.decision_id = p_decision_id
  GROUP BY cv.vote
  ORDER BY SUM(cv.confidence) DESC
  LIMIT 1;

  -- Determine consensus level
  IF v_avg_confidence >= 0.9 THEN
    v_consensus_level := 'strong';
  ELSIF v_avg_confidence >= 0.7 THEN
    v_consensus_level := 'moderate';
  ELSE
    v_consensus_level := 'weak';
  END IF;

  RETURN QUERY
  SELECT
    v_total_votes,
    v_avg_confidence,
    v_consensus_level,
    v_winning_vote;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION agent_core.calculate_consensus(UUID) IS 'Calculates consensus statistics for a decision';

-- =============================================================================
-- 9. GRANT PERMISSIONS
-- =============================================================================

-- Grant access to application role (assuming upr_app role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'upr_app') THEN
    GRANT USAGE ON SCHEMA agent_core TO upr_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agent_core TO upr_app;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA agent_core TO upr_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA agent_core TO upr_app;
  END IF;
END $$;

-- =============================================================================
-- 10. MIGRATION COMPLETE
-- =============================================================================

SELECT
  'Sprint 42 multi-agent system migration complete' as status,
  NOW() as completed_at;
