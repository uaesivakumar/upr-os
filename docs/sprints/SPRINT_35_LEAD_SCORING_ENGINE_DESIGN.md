# Sprint 35: Lead Scoring Engine - Design Document

## Sprint Goal
Build a comprehensive lead scoring system that combines quality, engagement, and fit scores to prioritize leads and enable intelligent lead queue management.

## Overview
Sprint 35 implements Phase 12: Lead Scoring Engine with:
- **Lead Score Calculator**: Q-Score × Engagement × Fit (0-10000 scale)
- **Fit Scoring**: Company-opportunity fit analysis (0-100)
- **Engagement Scoring**: Activity and responsiveness tracking (0-100)
- **Score Monitoring**: Real-time score tracking and updates
- **Score Decay**: Time-based score degradation for inactive leads
- **Priority Ranking**: A+ to D segmentation and "most actionable" logic
- **Lead Prioritization API**: RESTful API for prioritized lead retrieval
- **Lead Queue UI**: Interface for sales reps to work prioritized leads

---

## Score Formula Design

### Master Score Formula
```
Lead Score = Q-Score × Engagement × Fit
```

**Score Range**: 0 - 10,000
- Q-Score: 0-100 (from Sprint 22's quality evaluation)
- Engagement: 0-100 (activity-based scoring)
- Fit: 0-100 (company-opportunity fit)
- Result: 0-10,000 (normalized to fit × engagement × quality)

### Score Segmentation
| Grade | Score Range | Priority | Description |
|-------|-------------|----------|-------------|
| A+ | 8000-10000 | Highest | Hot leads, immediate action |
| A | 6000-7999 | High | Strong leads, prioritize |
| B+ | 4000-5999 | Medium-High | Good leads, regular follow-up |
| B | 2000-3999 | Medium | Decent leads, standard process |
| C | 1000-1999 | Low | Marginal leads, nurture |
| D | 0-999 | Lowest | Poor leads, minimal effort |

---

## Task 1-4: Lead Score Calculator & Formula

### Lead Score Calculator Service
**File**: `server/services/leadScoreCalculator.js`

#### Core Methods
```javascript
calculateLeadScore(opportunityId)
  → { leadScore, qScore, engagement, fit, grade, segment }

calculateQScore(opportunityId)
  → 0-100 (from existing quality evaluation)

calculateEngagementScore(opportunityId)
  → 0-100 (from Sprint 34's engagement scoring)

calculateFitScore(opportunityId)
  → 0-100 (new fit scoring)

determineGrade(score)
  → 'A+', 'A', 'B+', 'B', 'C', 'D'

batchCalculateScores(opportunityIds[])
  → [{ opportunityId, leadScore, grade, ... }]
```

#### Database Schema
```sql
CREATE TABLE lead_scores (
  opportunity_id UUID PRIMARY KEY,
  q_score INTEGER CHECK (q_score BETWEEN 0 AND 100),
  engagement_score INTEGER CHECK (engagement_score BETWEEN 0 AND 100),
  fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100),
  lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 10000),
  grade VARCHAR(2) CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C', 'D')),
  segment VARCHAR(20),
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP,
  decay_applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_scores_score ON lead_scores(lead_score DESC);
CREATE INDEX idx_lead_scores_grade ON lead_scores(grade);
CREATE INDEX idx_lead_scores_calculated_at ON lead_scores(calculated_at);
```

---

## Task 8: Fit Scoring (0-100)

### Fit Dimensions
1. **Industry Fit** (30 points)
   - Perfect match: +30
   - Adjacent industry: +20
   - Different but relevant: +10
   - Unrelated: 0

2. **Size Fit** (25 points)
   - Ideal size range (50-500): +25
   - Good size range (10-50 or 500-1000): +15
   - Acceptable (1-10 or 1000+): +5
   - Too small (<1) or too large: 0

3. **Location Fit** (20 points)
   - Target market (UAE, KSA): +20
   - Secondary market (GCC): +10
   - Other MENA: +5
   - Outside MENA: 0

4. **Technology Stack Fit** (15 points)
   - Modern stack: +15
   - Mixed stack: +10
   - Legacy stack: +5
   - Unknown: 0

5. **Budget Indicators** (10 points)
   - Strong indicators (funding, growth): +10
   - Some indicators: +5
   - No indicators: 0

**File**: `server/services/fitScoringService.js`

```javascript
calculateFitScore(opportunityId)
  → { fitScore, breakdown: { industry, size, location, tech, budget } }

assessIndustryFit(industry)
  → 0-30

assessSizeFit(employeeCount)
  → 0-25

assessLocationFit(country, region)
  → 0-20

assessTechStackFit(technologies)
  → 0-15

assessBudgetIndicators(metadata)
  → 0-10
```

---

## Task 9: Engagement Scoring (0-100)

### Engagement Dimensions
Uses Sprint 34's `LifecycleScoring.calculateEngagementScore()` with enhancements:

1. **Activity Frequency** (30 points)
   - Touchpoints in last 7 days: +5 each (max 30)
   - Email opens/clicks: +3 each
   - Website visits: +5 each

2. **Response Rate** (25 points)
   - Fast responses (<24h): +25
   - Moderate responses (24-72h): +15
   - Slow responses (>72h): +5
   - No responses: 0

3. **Meeting Engagement** (25 points)
   - Meetings attended: +10 each (max 25)
   - Meetings scheduled: +5 each
   - No-shows: -10 each

4. **Content Engagement** (10 points)
   - Document downloads: +5 each
   - Video views: +3 each
   - Case study views: +5 each

5. **Lifecycle Progression** (10 points)
   - Forward movement: +10
   - Stalled: 0
   - Backward movement: -5

**Integration**: Leverage `LifecycleScoring` from Sprint 34, add activity tracking.

---

## Task 5-6: Score Monitoring & Decay Logic

### Score Monitoring Service
**File**: `server/services/scoreMonitoringService.js`

#### Monitoring Features
```javascript
monitorScoreChanges(opportunityId)
  → Track score changes over time

getScoreHistory(opportunityId)
  → Array of score snapshots

detectSignificantChanges(threshold = 20)
  → Opportunities with score changes > threshold

generateScoreAlerts()
  → Alerts for score spikes/drops

getScoreTrends(days = 30)
  → Trending data for dashboards
```

#### Score History Table
```sql
CREATE TABLE lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  q_score INTEGER,
  engagement_score INTEGER,
  fit_score INTEGER,
  lead_score INTEGER,
  grade VARCHAR(2),
  change_reason VARCHAR(100),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_history_opp ON lead_score_history(opportunity_id);
CREATE INDEX idx_score_history_recorded ON lead_score_history(recorded_at DESC);
```

### Score Decay Logic
**File**: `server/services/scoreDecayService.js`

#### Decay Rules
1. **Time-Based Decay**
   - No activity for 7 days: -5% engagement
   - No activity for 14 days: -10% engagement
   - No activity for 30 days: -25% engagement
   - No activity for 60 days: -50% engagement
   - No activity for 90 days: -75% engagement

2. **Engagement Decay Formula**
   ```
   Decayed Engagement = Original Engagement × (1 - Decay Rate)
   Decay Rate = min(0.75, Days Inactive × 0.0083)
   ```

3. **Recalculation Triggers**
   - Daily batch job for all leads
   - On-demand when lead viewed
   - After any new activity

```javascript
applyDecay(opportunityId)
  → { originalScore, decayedScore, decayRate, daysInactive }

batchApplyDecay(options = { dryRun: false })
  → Process all leads for decay

calculateDecayRate(daysInactive)
  → Decay rate based on inactivity
```

---

## Task 7: Priority Ranking Algorithm

### "Most Actionable" Logic
**File**: `server/services/priorityRankingService.js`

#### Ranking Factors
1. **Lead Score** (50% weight)
   - Primary sorting factor
   - Higher scores = higher priority

2. **Time in Current State** (20% weight)
   - Longer in state = higher urgency
   - Prevents leads from getting stale

3. **Last Contact Recency** (15% weight)
   - Longer since last contact = higher priority for re-engagement
   - Recent contact = lower immediate priority

4. **Lifecycle Stage** (10% weight)
   - NEGOTIATING: +100 boost
   - ENGAGED: +50 boost
   - OUTREACH: +25 boost
   - QUALIFIED: +10 boost
   - DISCOVERED: 0
   - DORMANT: -50 penalty

5. **Response Rate** (5% weight)
   - High response rate: +20 boost
   - Low response rate: -10 penalty

#### Priority Score Formula
```
Priority Score = (Lead Score × 0.5) +
                 (State Urgency × 0.2) +
                 (Recency Factor × 0.15) +
                 (Stage Boost × 0.1) +
                 (Response Boost × 0.05)
```

```javascript
calculatePriorityScore(opportunityId)
  → { priorityScore, breakdown, rank }

rankLeads(filters = {})
  → Sorted array of leads by priority

getMostActionable(limit = 50, filters = {})
  → Top N most actionable leads

getLeadQueue(userId, limit = 20)
  → Personalized lead queue for sales rep
```

---

## Task 2: Lead Prioritization API

### API Endpoints
**File**: `server/routes/leadPrioritization.js`

#### GET /api/leads/prioritized
Get prioritized lead queue

**Query Parameters:**
- `limit`: Number of leads (default: 20, max: 100)
- `grade`: Filter by grade (A+, A, B+, B, C, D)
- `minScore`: Minimum lead score
- `state`: Filter by lifecycle state
- `userId`: For personalized queue

**Response:**
```json
{
  "leads": [
    {
      "opportunityId": "uuid",
      "companyName": "string",
      "leadScore": 8500,
      "grade": "A+",
      "priorityScore": 9200,
      "qScore": 85,
      "engagementScore": 90,
      "fitScore": 95,
      "currentState": "ENGAGED",
      "daysInState": 5,
      "lastContactAt": "2025-11-15",
      "mostActionableReason": "High score + engaged state",
      "recommendedAction": "Schedule demo call"
    }
  ],
  "meta": {
    "total": 150,
    "returned": 20,
    "filters": {},
    "generatedAt": "2025-11-18T..."
  }
}
```

#### POST /api/leads/:id/recalculate-score
Recalculate score for a specific lead

#### GET /api/leads/:id/score-history
Get score history for a lead

#### GET /api/leads/score-distribution
Get distribution of scores across all leads

#### POST /api/leads/batch-recalculate
Batch recalculate scores (admin only)

---

## Task 12: Lead Queue UI

### UI Components
**Suggested Structure** (if frontend exists):

1. **Lead Queue Dashboard**
   - Table view of prioritized leads
   - Columns: Company, Score, Grade, State, Days in State, Last Contact, Actions
   - Sorting and filtering
   - Real-time updates

2. **Score Visualization**
   - Score breakdown (Q-Score, Engagement, Fit)
   - Visual indicators (badges, colors)
   - Grade badges (A+, A, B+, etc.)

3. **Quick Actions**
   - "Contact Now" button
   - "Schedule Follow-up" button
   - "Update Status" button
   - "View Full Profile" link

4. **Filters Panel**
   - Grade filter (A+, A, B+, B, C, D)
   - State filter (DISCOVERED, QUALIFIED, etc.)
   - Score range slider
   - Date range filter

**For Backend-Only Implementation:**
Create API-first approach with comprehensive endpoints for future UI integration.

---

## Database Migration

**File**: `db/migrations/2025_11_18_lead_scoring_engine.sql`

**Tables:**
1. `lead_scores` - Current scores
2. `lead_score_history` - Score snapshots
3. `lead_priority_queue` - Cached priority rankings

**Views:**
1. `lead_queue_view` - Denormalized view for quick queue retrieval
2. `score_distribution_view` - Analytics on score distribution

**Functions:**
1. `calculate_priority_score(uuid)` - PL/pgSQL priority calculation
2. `apply_score_decay(uuid)` - PL/pgSQL decay application
3. `update_lead_scores_updated_at()` - Trigger function

---

## Testing Strategy

### Checkpoint 1: Scoring Components (Tasks 1-4, 8-9)
- Test fit scoring dimensions
- Test engagement scoring integration
- Test lead score calculation
- Test grade determination
- Test batch scoring

### Checkpoint 2: Monitoring, Decay & Ranking (Tasks 5-7)
- Test score monitoring
- Test score history tracking
- Test decay logic and rates
- Test priority ranking algorithm
- Test "most actionable" selection

### Checkpoint 3: API & Integration (Tasks 2, 10-11)
- Test all API endpoints
- Test query parameters and filters
- Test pagination
- Test performance with large datasets

### Smoke Test (Task 11)
- End-to-end: Calculate scores → Apply decay → Prioritize → Retrieve queue
- Test complete workflow for multiple leads
- Verify score accuracy and consistency

---

## Performance Targets

- Score calculation: < 200ms per lead
- Batch scoring (100 leads): < 10s
- API response (/prioritized): < 500ms
- Score decay (batch, 1000 leads): < 30s
- Priority ranking: < 1s for 500 leads

---

## Business Value

### Sales Efficiency
- 40% reduction in time spent deciding which leads to contact
- Focus on highest-value opportunities
- Automated prioritization eliminates manual sorting

### Revenue Impact
- 25% increase in conversion rate by focusing on A+ and A leads
- Faster response to hot leads
- Better resource allocation

### Data-Driven Insights
- Clear visibility into lead quality
- Score trends identify improving/declining opportunities
- Historical data enables process optimization

---

## Integration Points

- **Sprint 22**: Q-Score (quality evaluation)
- **Sprint 33**: Lifecycle state data
- **Sprint 34**: Engagement scoring, journey tracking
- **Future**: CRM integration, email automation, task management

---

**Design Status**: ✅ Complete and ready for implementation
**Estimated Complexity**: High (12 interconnected tasks)
**Estimated LOC**: ~3,000 production + ~1,500 test code
