# Sprint 33: Opportunity Lifecycle State Machine Design

## Overview
Design and implement a comprehensive lifecycle state machine to track opportunities from discovery through closure, with automated transitions, journey tracking, and re-engagement logic.

## Business Context
The Opportunity Lifecycle Engine tracks each prospect through their journey in our UAE banking outreach system. It automates state transitions based on actions, manages re-engagement strategies, and provides visibility into the sales pipeline.

## 7 Lifecycle States

### 1. **DISCOVERED** (Entry State)
**Description**: Opportunity identified but not yet qualified
**Entry Triggers**:
- New company added to database
- Company identified through research
- Import/bulk upload

**Automated Actions**:
- Run initial company research
- Calculate preliminary quality score
- Schedule qualification check (24h)

**Exit Conditions**:
- Quality score calculated → QUALIFIED or DISQUALIFIED
- Manual disqualification → DISQUALIFIED

---

### 2. **QUALIFIED**
**Description**: Opportunity meets quality criteria and ready for outreach
**Entry Triggers**:
- Quality score ≥ 70 from research
- Manual qualification by user
- Re-qualification after enrichment

**Automated Actions**:
- Identify decision makers (contacts)
- Generate initial outreach strategy
- Calculate contact tier
- Schedule outreach start (auto-transition in 2h)

**Exit Conditions**:
- Outreach initiated → OUTREACH
- Quality degraded → DISQUALIFIED
- Manual skip → DISQUALIFIED

---

### 3. **OUTREACH**
**Description**: Active outreach in progress
**Entry Triggers**:
- Auto-transition from QUALIFIED (2h delay)
- Manual outreach start
- Re-engagement triggered

**Automated Actions**:
- Generate personalized messages
- Track outreach attempts (email, LinkedIn, phone)
- Monitor response rates
- Schedule follow-ups based on doctrine

**Exit Conditions**:
- Response received → ENGAGED
- Max attempts reached (no response) → DORMANT
- Negative response → DISQUALIFIED
- Manual pause → PAUSED

---

### 4. **ENGAGED**
**Description**: Prospect has responded and showing interest
**Entry Triggers**:
- Reply to outreach message
- Meeting scheduled
- Positive signal detected

**Automated Actions**:
- Track engagement quality
- Update engagement score
- Suggest next steps
- Schedule check-in (7 days)

**Exit Conditions**:
- Deal progressing → NEGOTIATING
- No activity for 30 days → DORMANT
- Lost interest → DISQUALIFIED
- Manual transition

---

### 5. **NEGOTIATING**
**Description**: Active deal negotiation/discussion
**Entry Triggers**:
- Proposal sent
- Contract discussion started
- Terms being discussed

**Automated Actions**:
- Track negotiation stage
- Monitor decision timeline
- Alert on stalled deals (14 days)
- Calculate close probability

**Exit Conditions**:
- Deal closed → WON
- Deal lost → LOST
- Stalled → DORMANT
- Back to engagement → ENGAGED

---

### 6. **DORMANT**
**Description**: Inactive opportunity with re-engagement potential
**Entry Triggers**:
- No response after max outreach attempts
- No activity for 30+ days in ENGAGED
- Deal stalled for 14+ days in NEGOTIATING

**Automated Actions**:
- Calculate re-engagement score
- Schedule re-engagement check (60 days)
- Monitor trigger events (company growth, funding, etc.)
- Generate re-engagement strategy

**Exit Conditions**:
- Re-engagement triggered → OUTREACH
- Quality degraded → DISQUALIFIED
- Manual re-activation → QUALIFIED

---

### 7. **CLOSED**
**Description**: Terminal state - opportunity reached conclusion
**Sub-states**:
- **WON**: Deal successfully closed
- **LOST**: Deal lost to competitor or no decision
- **DISQUALIFIED**: Not a fit for our services

**Entry Triggers**:
- Deal won → WON
- Deal lost → LOST
- Quality check failed → DISQUALIFIED
- Manual closure

**Automated Actions**:
- Record closure reason
- Calculate lifetime metrics
- Archive opportunity data
- Update analytics

**Exit Conditions**:
- None (terminal state)
- Re-open possible with manual override → QUALIFIED

---

## State Transition Matrix

| From State | To State | Trigger Type | Trigger Condition |
|------------|----------|--------------|-------------------|
| DISCOVERED | QUALIFIED | Auto | quality_score >= 70 |
| DISCOVERED | CLOSED.DISQUALIFIED | Auto | quality_score < 40 |
| QUALIFIED | OUTREACH | Auto | 2 hours after qualification |
| QUALIFIED | CLOSED.DISQUALIFIED | Manual | User disqualifies |
| OUTREACH | ENGAGED | Auto | Response received |
| OUTREACH | DORMANT | Auto | Max attempts reached (no response) |
| OUTREACH | CLOSED.DISQUALIFIED | Auto | Negative response |
| OUTREACH | PAUSED | Manual | User pauses |
| ENGAGED | NEGOTIATING | Manual | Proposal sent |
| ENGAGED | DORMANT | Auto | 30 days no activity |
| ENGAGED | CLOSED.DISQUALIFIED | Manual | Lost interest |
| NEGOTIATING | CLOSED.WON | Manual | Deal closed successfully |
| NEGOTIATING | CLOSED.LOST | Manual | Deal lost |
| NEGOTIATING | DORMANT | Auto | 14 days no activity |
| NEGOTIATING | ENGAGED | Manual | Back to discussion |
| DORMANT | OUTREACH | Auto | Re-engagement triggered (60 days) |
| DORMANT | QUALIFIED | Manual | Manual re-activation |
| DORMANT | CLOSED.DISQUALIFIED | Auto | Quality degraded |
| PAUSED | OUTREACH | Manual | User resumes |
| CLOSED.* | QUALIFIED | Manual | Re-open (rare) |

## Transition Triggers

### Automatic Triggers
1. **Time-based**:
   - QUALIFIED → OUTREACH (2 hours)
   - ENGAGED → DORMANT (30 days inactivity)
   - NEGOTIATING → DORMANT (14 days inactivity)
   - DORMANT → OUTREACH (60 days re-engagement)

2. **Event-based**:
   - Response received → ENGAGED
   - Max outreach attempts → DORMANT
   - Negative response → DISQUALIFIED
   - Quality score changes → State re-evaluation

3. **Condition-based**:
   - Quality score >= 70 → QUALIFIED
   - Quality score < 40 → DISQUALIFIED
   - Engagement score > 80 → Priority flag

### Manual Triggers
- User-initiated state changes
- Override automatic transitions
- Re-open closed opportunities
- Pause/resume outreach

## State Machine Properties

### State Metadata
Each state tracks:
- `state_id`: Unique identifier
- `state_name`: Human-readable name
- `opportunity_id`: Related opportunity
- `entered_at`: Timestamp of entry
- `exited_at`: Timestamp of exit (null if current)
- `duration`: Time spent in state
- `trigger_type`: auto/manual/event
- `trigger_reason`: Why transition occurred
- `previous_state`: State before transition
- `metadata`: JSON with state-specific data

### Journey Tracking
- Complete history of all state transitions
- Time spent in each state
- Reasons for transitions
- Path analysis (common journeys)
- Bottleneck identification

## Auto-Transition Logic

### Scheduler Design
```javascript
// Cron job runs every hour
async function checkAutoTransitions() {
  // Check time-based transitions
  await checkQualifiedToOutreach(); // 2h wait
  await checkEngagedToDormant();    // 30 days
  await checkNegotiatingToDormant(); // 14 days
  await checkDormantReengagement();  // 60 days

  // Check condition-based transitions
  await checkQualityScoreChanges();
  await checkResponseEvents();
}
```

### Transition Rules Engine
```javascript
const TRANSITION_RULES = {
  QUALIFIED_TO_OUTREACH: {
    condition: (opp) => hoursSince(opp.state_entered_at) >= 2,
    autoExecute: true
  },
  ENGAGED_TO_DORMANT: {
    condition: (opp) => daysSince(opp.last_activity) >= 30,
    autoExecute: true
  },
  // ... more rules
};
```

## Intent Mapping

### Outreach Actions → State Transitions
Map user actions to state transitions:

```javascript
const INTENT_MAPPING = {
  'send_outreach_message': {
    validStates: ['QUALIFIED', 'DORMANT'],
    targetState: 'OUTREACH'
  },
  'log_meeting': {
    validStates: ['OUTREACH', 'ENGAGED'],
    targetState: 'ENGAGED'
  },
  'send_proposal': {
    validStates: ['ENGAGED'],
    targetState: 'NEGOTIATING'
  },
  'mark_as_won': {
    validStates: ['NEGOTIATING'],
    targetState: 'CLOSED.WON'
  },
  'mark_as_lost': {
    validStates: ['NEGOTIATING'],
    targetState: 'CLOSED.LOST'
  },
  'disqualify': {
    validStates: ['DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED'],
    targetState: 'CLOSED.DISQUALIFIED'
  }
};
```

## Database Schema

### opportunity_lifecycle Table
```sql
CREATE TABLE opportunity_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),
  state VARCHAR(50) NOT NULL, -- Current state
  sub_state VARCHAR(50), -- For CLOSED (WON/LOST/DISQUALIFIED)
  entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMP,
  duration_seconds INTEGER,
  trigger_type VARCHAR(20) NOT NULL, -- 'auto', 'manual', 'event'
  trigger_reason TEXT,
  triggered_by UUID, -- User ID if manual
  previous_state VARCHAR(50),
  next_state VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for current state queries
CREATE INDEX idx_lifecycle_current
ON opportunity_lifecycle(opportunity_id, exited_at)
WHERE exited_at IS NULL;

-- Index for auto-transition checks
CREATE INDEX idx_lifecycle_auto_check
ON opportunity_lifecycle(state, entered_at)
WHERE exited_at IS NULL;

-- View for current states
CREATE VIEW opportunity_current_state AS
SELECT
  opportunity_id,
  state,
  sub_state,
  entered_at,
  EXTRACT(EPOCH FROM (NOW() - entered_at))::INTEGER as duration_seconds,
  trigger_type,
  trigger_reason,
  previous_state,
  metadata
FROM opportunity_lifecycle
WHERE exited_at IS NULL;
```

## API Design

### POST /api/opportunities/:id/transition
Transition an opportunity to a new state

**Request**:
```json
{
  "target_state": "ENGAGED",
  "trigger_type": "manual",
  "reason": "Customer replied to outreach email",
  "metadata": {
    "response_channel": "email",
    "response_sentiment": "positive"
  }
}
```

**Response**:
```json
{
  "success": true,
  "opportunity_id": "uuid",
  "transition": {
    "from_state": "OUTREACH",
    "to_state": "ENGAGED",
    "transitioned_at": "2025-11-18T14:30:00Z",
    "duration_in_previous_state": 172800
  }
}
```

### GET /api/opportunities/:id/lifecycle
Get complete lifecycle history

**Response**:
```json
{
  "opportunity_id": "uuid",
  "current_state": "ENGAGED",
  "current_sub_state": null,
  "time_in_current_state": 86400,
  "total_lifecycle_duration": 432000,
  "history": [
    {
      "state": "DISCOVERED",
      "entered_at": "2025-11-13T10:00:00Z",
      "exited_at": "2025-11-13T14:30:00Z",
      "duration": 16200,
      "trigger_type": "auto",
      "trigger_reason": "Quality score: 85"
    },
    // ... more history
  ]
}
```

## Implementation Phases

### Phase 1: Core State Machine (Tasks 1-4)
1. ✅ Design state machine (7 states)
2. ✅ Create database schema
3. ⏳ Implement Lifecycle State Engine
4. ⏳ State Persistence layer

### Phase 2: Transition Logic (Tasks 5-8)
5. ⏳ State Transition Triggers
6. ⏳ Auto-Transition Logic
7. ⏳ State Transition API
8. ⏳ Outreach Intent Mapper

### Phase 3: Visualization & Testing (Tasks 9-11)
9. ⏳ State Visualization (Flow Diagram)
10. ⏳ State Machine Core Smoke Test
11. ⏳ Phase 8 Integration Complete

## Success Metrics

- ✅ All 7 states implemented and tested
- ✅ Auto-transitions working correctly
- ✅ Manual transitions validated
- ✅ Journey tracking complete
- ✅ Re-engagement logic functional
- ✅ API endpoints working
- ✅ 100% test coverage on state machine
- ✅ Flow diagram generated

## Next Steps

1. Create database migration for opportunity_lifecycle table
2. Implement LifecycleStateEngine service
3. Implement StatePersistence service
4. Create transition trigger system
5. Build auto-transition scheduler
6. Create API endpoints
7. Implement intent mapper
8. Build visualization
9. Write comprehensive tests

---

**Status**: 🚀 Ready for Implementation
**Target Completion**: Sprint 33
**Related**: Phase 8: Opportunity Lifecycle Engine
