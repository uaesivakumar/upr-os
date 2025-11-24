# Sprint 42: Multi-Agent System Architecture

**Sprint Goal:** Implement autonomous multi-agent system with specialized agents (Discovery, Validation, Critic)

**Date Started:** 2025-11-20
**Status:** In Progress

---

## Architecture Overview

### Core Concept
The SIVA multi-agent system implements three specialized autonomous agents that collaborate to improve decision quality through discovery, validation, and critical analysis.

### Agent Types

#### 1. **Discovery Agent**
- **Purpose:** Pattern finding and hypothesis generation
- **Capabilities:**
  - Analyze historical data for patterns
  - Generate improvement hypotheses
  - Identify anomalies and edge cases
  - Suggest new features or rules
- **Input:** Historical decisions, feedback data, user corrections
- **Output:** Hypotheses, patterns, recommendations

#### 2. **Validation Agent**
- **Purpose:** Fact-checking and data verification
- **Capabilities:**
  - Verify data accuracy and consistency
  - Cross-reference multiple sources
  - Detect contradictions or conflicts
  - Validate hypotheses from Discovery Agent
- **Input:** Data to verify, hypotheses to validate
- **Output:** Validation results, confidence scores, issues found

#### 3. **Critic Agent**
- **Purpose:** Quality assurance and critical thinking
- **Capabilities:**
  - Evaluate decision quality
  - Challenge assumptions and biases
  - Identify weaknesses in logic
  - Provide constructive criticism
- **Input:** Decisions, hypotheses, validation results
- **Output:** Quality scores, critiques, improvement suggestions

---

## System Components

### 1. Agent Communication Protocol
**File:** `server/agents/AgentProtocol.js`

```javascript
{
  type: 'REQUEST' | 'RESPONSE' | 'NOTIFICATION',
  from: 'agent_id',
  to: 'agent_id' | 'broadcast',
  timestamp: Date,
  messageId: 'uuid',
  correlationId: 'uuid', // for tracking conversations
  payload: {
    action: 'ANALYZE' | 'VALIDATE' | 'CRITIQUE' | 'CONSENSUS',
    data: {},
    context: {}
  }
}
```

### 2. Agent Coordination Service
**File:** `server/services/agentCoordinator.js`

**Responsibilities:**
- Route messages between agents
- Manage agent lifecycles
- Orchestrate multi-agent workflows
- Handle consensus mechanisms
- Track agent states

### 3. Base Agent Class
**File:** `server/agents/BaseAgent.js`

**Core Methods:**
- `initialize()` - Setup agent
- `process(input)` - Main processing logic
- `sendMessage(to, payload)` - Send to other agents
- `receiveMessage(message)` - Handle incoming messages
- `log(decision)` - Log agent decisions

### 4. Agent Decision Logging
**Database Table:** `agent_core.agent_decisions` (existing)

**Additional Fields Needed:**
```sql
ALTER TABLE agent_core.agent_decisions
ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS parent_decision_id UUID REFERENCES agent_core.agent_decisions(id),
ADD COLUMN IF NOT EXISTS consensus_score DECIMAL(5,2);
```

### 5. Consensus Mechanism

**Algorithm:** Weighted voting with confidence scores

```
Final Decision = Σ (Agent_i_Decision × Agent_i_Confidence × Agent_i_Weight)
Consensus Score = Agreement% among agents
```

**Consensus Levels:**
- **Strong (90%+):** All agents agree
- **Moderate (70-89%):** Majority agreement
- **Weak (<70%):** Significant disagreement → escalate to human

---

## Workflows

### Workflow 1: Discovery → Validation → Critic

```
1. Discovery Agent: Analyze data → Generate hypothesis
2. Validation Agent: Verify hypothesis → Provide confidence score
3. Critic Agent: Evaluate quality → Approve/Reject/Improve
4. Consensus: All agents vote → Final decision
5. Logging: Record full chain of reasoning
```

### Workflow 2: Collaborative Decision Making

```
Input: Complex decision request
↓
1. Broadcast to all agents
2. Each agent analyzes independently
3. Agents share findings
4. Consensus mechanism aggregates
5. If consensus low: iterative refinement
6. Output final decision + reasoning chain
```

---

## Database Schema Additions

### New Tables

#### `agent_core.agent_messages`
```sql
CREATE TABLE IF NOT EXISTS agent_core.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE,
  correlation_id UUID,
  from_agent VARCHAR(100) NOT NULL,
  to_agent VARCHAR(100) NOT NULL,
  message_type VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_messages_correlation ON agent_core.agent_messages(correlation_id);
CREATE INDEX idx_agent_messages_to_agent ON agent_core.agent_messages(to_agent, processed_at);
```

#### `agent_core.agent_performance`
```sql
CREATE TABLE IF NOT EXISTS agent_core.agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  period VARCHAR(20) -- 'hourly', 'daily', 'weekly'
);

CREATE INDEX idx_agent_performance_agent ON agent_core.agent_performance(agent_id, measured_at);
```

#### `agent_core.consensus_votes`
```sql
CREATE TABLE IF NOT EXISTS agent_core.consensus_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_core.agent_decisions(id),
  agent_id VARCHAR(100) NOT NULL,
  vote JSONB NOT NULL, -- decision data
  confidence DECIMAL(5,2) NOT NULL,
  reasoning TEXT,
  voted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consensus_votes_decision ON agent_core.consensus_votes(decision_id);
```

---

## API Endpoints

### Agent Coordination
- `POST /api/agents/coordinate` - Start multi-agent workflow
- `GET /api/agents/:agentId/status` - Get agent status
- `POST /api/agents/consensus` - Request consensus decision

### Agent Monitoring
- `GET /api/agents/performance` - Agent performance metrics
- `GET /api/agents/decisions/:decisionId/chain` - Full decision chain
- `GET /api/agents/messages/:correlationId` - Message thread

### Agent Management
- `POST /api/agents/:agentId/reset` - Reset agent state
- `GET /api/agents/health` - All agents health check

---

## Performance Metrics

### Per-Agent Metrics
- Decisions made
- Average confidence score
- Accuracy rate (vs feedback)
- Response time
- Error rate

### System Metrics
- Consensus achievement rate
- Average consensus score
- Inter-agent communication volume
- Workflow completion time

---

## Success Criteria

1. ✅ All 3 specialized agents operational
2. ✅ Agents can communicate via protocol
3. ✅ Consensus mechanism works correctly
4. ✅ Decision logging captures full reasoning chain
5. ✅ Performance tracking shows agent effectiveness
6. ✅ Monitoring dashboard displays agent activity
7. ✅ End-to-end workflow completes successfully
8. ✅ Tests pass with >90% success rate

---

## Implementation Phases

### Phase 1: Infrastructure (Tasks 1-4)
- Agent architecture design ← Current
- Communication protocol
- Coordination service
- **CHECKPOINT 1:** Test infrastructure

### Phase 2: Specialized Agents (Tasks 5-7)
- Discovery Agent
- Validation Agent
- Critic Agent
- **CHECKPOINT 2:** Test agents

### Phase 3: Integration (Tasks 8-12)
- Consensus mechanism
- Decision logging
- Performance tracking
- Monitoring dashboard
- **CHECKPOINT 3:** End-to-end test

### Phase 4: Quality Assurance
- Final QC check
- Git commits
- Notion sync

---

## Technology Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL + agent_core schema
- **Communication:** Event-driven messaging
- **Logging:** Structured JSON logs
- **Monitoring:** Real-time dashboard

---

## Next Steps

1. Create Base Agent class
2. Implement communication protocol
3. Build coordination service
4. Add database migrations
5. Implement specialized agents
6. Add consensus mechanism
7. Create monitoring dashboard
8. Test and validate

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Sprint:** 42
**Status:** Architecture Complete ✅
