# Sprint 34: Lifecycle Analytics & Automation - Design Document

## Sprint Goal
Build comprehensive analytics, reporting, scoring, and automation capabilities on top of the Sprint 33 Opportunity Lifecycle Engine.

## Overview
Sprint 34 extends the lifecycle state machine with:
- **Reporting**: Generate insights on lifecycle performance
- **Dashboard**: Visual monitoring interface
- **Scoring**: Quantify opportunity quality and engagement
- **Re-Engagement**: Automated dormant opportunity reactivation
- **Analytics**: Advanced data analysis and predictions
- **Automated Actions**: State-triggered email and task automation
- **Journey Tracking**: Multi-touch attribution and conversion paths

---

## Task 1: Lifecycle Reports

### Purpose
Generate comprehensive reports on lifecycle data for business intelligence.

### Report Types

#### 1. State Distribution Report
- Current count of opportunities in each state
- Percentage breakdown
- Trend over time (daily/weekly/monthly)
- Comparison to historical averages

#### 2. Conversion Funnel Report
- DISCOVERED → QUALIFIED → OUTREACH → ENGAGED → NEGOTIATING → CLOSED
- Drop-off rates at each stage
- Conversion rates between stages
- Bottleneck identification

#### 3. Time-in-State Report
- Average time spent in each state
- Median, p50, p90, p95 percentiles
- Identify slow-moving opportunities
- Flag stalled opportunities (>30d in one state)

#### 4. Transition Velocity Report
- Speed of transitions
- Fast vs slow movers
- State-specific velocity metrics
- Predictive time-to-close

#### 5. Outcome Analysis Report
- Win rate (CLOSED.WON / Total CLOSED)
- Loss reasons breakdown
- Disqualification reasons
- Revenue impact (if available)

### Implementation
**File**: `server/services/lifecycleReportGenerator.js`

**Methods**:
```javascript
- generateStateDistributionReport(options)
- generateConversionFunnelReport(options)
- generateTimeInStateReport(options)
- generateVelocityReport(options)
- generateOutcomeReport(options)
- generateAllReports(options)
- exportReportToCSV(report)
- exportReportToJSON(report)
```

**Options**:
- `startDate`: Filter from date
- `endDate`: Filter to date
- `industry`: Filter by industry
- `size`: Filter by company size
- `format`: 'json' | 'csv' | 'html'

---

## Task 2: Lifecycle Dashboard

### Purpose
Provide real-time visual monitoring of lifecycle metrics.

### Dashboard Components

#### 1. Overview Metrics (Cards)
- Total active opportunities
- Current conversion rate
- Average time to close
- Win rate (last 30d)

#### 2. State Distribution (Pie/Donut Chart)
- Visual breakdown of current states
- Interactive: click to drill down

#### 3. Conversion Funnel (Funnel Chart)
- Visual funnel with drop-off rates
- Highlight bottlenecks in red

#### 4. Time-in-State (Bar Chart)
- Average days per state
- Comparison to benchmarks

#### 5. Recent Transitions (Timeline)
- Last 20 state changes
- Real-time updates

#### 6. Trending Metrics (Line Chart)
- 30-day trend of key metrics
- Daily opportunity flow

#### 7. Alerts Panel
- Stalled opportunities (>30d)
- High-value deals at risk
- Re-engagement candidates

### Implementation
**File**: `server/services/lifecycleDashboard.js`

**Methods**:
```javascript
- getDashboardData()
- getOverviewMetrics()
- getStateDistribution()
- getConversionFunnel()
- getRecentTransitions()
- getTrendingMetrics(days)
- getAlerts()
```

**API Endpoint**: `GET /api/lifecycle/dashboard`

---

## Task 3: Lifecycle Scoring

### Purpose
Quantify opportunity quality, engagement level, and likelihood to convert.

### Scoring Dimensions

#### 1. Engagement Score (0-100)
Measures how engaged the opportunity is:
- **Activity frequency**: Emails, meetings, responses (+10 each)
- **Response time**: Fast responses (+15), Slow (-5)
- **Meeting attendance**: Attended (+20), No-show (-10)
- **Content engagement**: Downloads, clicks (+5 each)

#### 2. Velocity Score (0-100)
Measures speed of progression:
- **Fast transitions**: < avg time (+20)
- **Slow transitions**: > avg time (-10)
- **Forward momentum**: Consecutive forward moves (+15)
- **Backward moves**: Regression to earlier states (-20)

#### 3. Quality Score (0-100)
Measures opportunity quality (from Sprint 22):
- Uses existing quality evaluation
- Company size, industry fit
- Budget indicators
- Decision-maker access

#### 4. Composite Lifecycle Score (0-100)
Weighted combination:
- Engagement: 40%
- Velocity: 30%
- Quality: 30%

### Predictive Elements
- **Time-to-close estimate**: Based on velocity and current state
- **Win probability**: ML model based on scores and historical data
- **Churn risk**: Probability of moving to DORMANT or CLOSED.LOST

### Implementation
**File**: `server/services/lifecycleScoring.js`

**Methods**:
```javascript
- calculateEngagementScore(opportunityId)
- calculateVelocityScore(opportunityId)
- getQualityScore(opportunityId)
- calculateCompositeScore(opportunityId)
- predictTimeToClose(opportunityId)
- predictWinProbability(opportunityId)
- identifyChurnRisk(opportunityId)
- scoreAllOpportunities()
```

**Database**: Add `lifecycle_scores` table
```sql
CREATE TABLE lifecycle_scores (
  opportunity_id UUID PRIMARY KEY,
  engagement_score INTEGER,
  velocity_score INTEGER,
  quality_score INTEGER,
  composite_score INTEGER,
  win_probability DECIMAL(5,2),
  estimated_close_date DATE,
  churn_risk VARCHAR(20), -- 'low', 'medium', 'high'
  calculated_at TIMESTAMP,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);
```

---

## Task 4: Re-Engagement Logic

### Purpose
Automatically detect and re-engage dormant opportunities.

### Re-Engagement Triggers

#### 1. Time-Based Re-Engagement
- **60 days dormant**: Send gentle check-in
- **90 days dormant**: Send value-add content
- **120 days dormant**: Final touch before archiving

#### 2. Event-Based Re-Engagement
- **New product launch**: Relevant to their industry
- **Company news**: Funding, expansion, leadership change
- **Market changes**: Regulatory, competitive shifts

#### 3. Behavior-Based Re-Engagement
- **Website revisit**: Opportunity visits website
- **Email engagement**: Opens/clicks on email
- **Social engagement**: Interacts on LinkedIn

### Re-Engagement Actions

#### 1. Outreach Templates
- Gentle check-in template
- Value-add content template
- "Still interested?" template
- New offer template

#### 2. Automatic State Transitions
- DORMANT → OUTREACH (if re-engagement accepted)
- DORMANT → CLOSED.LOST (if no response after 120d)

#### 3. Success Tracking
- Re-engagement attempt count
- Response rate
- Conversion rate (DORMANT → active states)

### Implementation
**File**: `server/services/lifecycleReEngagement.js`

**Methods**:
```javascript
- identifyReEngagementCandidates()
- scheduleReEngagementOutreach(opportunityId, template)
- executeReEngagement(opportunityId)
- trackReEngagementResponse(opportunityId, response)
- getReEngagementStats()
```

**Database**: Add `re_engagement_attempts` table
```sql
CREATE TABLE re_engagement_attempts (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  attempted_at TIMESTAMP NOT NULL,
  template_used VARCHAR(100),
  response_received BOOLEAN DEFAULT FALSE,
  response_at TIMESTAMP,
  outcome VARCHAR(50), -- 'responded', 'no_response', 'opted_out'
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);
```

---

## Task 5: Lifecycle Analytics

### Purpose
Advanced analytics for strategic decision-making.

### Analytics Capabilities

#### 1. Cohort Analysis
- Group opportunities by discovery date
- Track cohort progression through states
- Compare cohort performance
- Identify trends over time

#### 2. Path Analysis
- Most common transition paths
- Successful vs unsuccessful paths
- Identify patterns in wins
- Anti-patterns in losses

#### 3. Bottleneck Detection
- States with longest duration
- States with highest drop-off
- Recommended optimizations

#### 4. Performance Benchmarks
- Industry benchmarks
- Size-based benchmarks
- Historical performance
- Goal vs actual

#### 5. Attribution Analysis
- Channel effectiveness
- Outreach method performance
- Content impact
- Touchpoint contribution

#### 6. Predictive Analytics
- Forecast pipeline progression
- Predict monthly closures
- Revenue forecasting
- Resource planning

### Implementation
**File**: `server/services/lifecycleAnalytics.js`

**Methods**:
```javascript
- analyzeCohorts(groupBy)
- analyzePaths(minOccurrences)
- detectBottlenecks()
- getBenchmarks(filters)
- analyzeAttribution(opportunityId)
- forecastPipeline(months)
- getRecommendations()
```

**Database**: Add materialized view for analytics
```sql
CREATE MATERIALIZED VIEW lifecycle_analytics_cache AS
SELECT
  DATE_TRUNC('day', entered_at) as cohort_date,
  state,
  COUNT(*) as opportunity_count,
  AVG(EXTRACT(EPOCH FROM (exited_at - entered_at))/86400) as avg_days_in_state
FROM opportunity_lifecycle
WHERE exited_at IS NOT NULL
GROUP BY cohort_date, state;
```

---

## Task 6: Automated Actions (State → Email → Task)

### Purpose
Automatically trigger emails and create tasks when opportunities transition states.

### Action Types

#### 1. Email Actions
- **QUALIFIED → OUTREACH**: Send introduction email
- **OUTREACH → ENGAGED**: Send meeting confirmation
- **ENGAGED → NEGOTIATING**: Send proposal
- **30d in ENGAGED**: Send follow-up email
- **CLOSED.WON**: Send thank you + onboarding
- **CLOSED.LOST**: Send "stay in touch" email

#### 2. Task Actions
- **DISCOVERED**: "Review company profile"
- **QUALIFIED**: "Schedule discovery call"
- **OUTREACH**: "Prepare outreach message"
- **ENGAGED**: "Send proposal"
- **NEGOTIATING**: "Follow up on contract"
- **DORMANT**: "Plan re-engagement strategy"

#### 3. Notification Actions
- **High-value deal stalled**: Alert sales manager
- **Win**: Celebrate with team
- **Loss**: Request feedback from rep

### Action Configuration

**Database**: `lifecycle_action_templates` table
```sql
CREATE TABLE lifecycle_action_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'email', 'task', 'notification'
  trigger_state VARCHAR(50),
  trigger_event VARCHAR(50), -- 'entered', 'exited', 'time_elapsed'
  time_delay_hours INTEGER DEFAULT 0,
  template_content JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Implementation
**File**: `server/services/lifecycleAutomatedActions.js`

**Methods**:
```javascript
- registerActionTemplate(template)
- getActionTemplatesForState(state, event)
- executeActions(opportunityId, state, event)
- sendEmail(opportunityId, template)
- createTask(opportunityId, template)
- sendNotification(recipientId, template)
- scheduleDelayedAction(action, delayHours)
```

**Integration**: Hook into lifecycle state engine events
```javascript
engine.on('entered:QUALIFIED', async ({ opportunityId }) => {
  await automatedActions.executeActions(opportunityId, 'QUALIFIED', 'entered');
});
```

---

## Task 7: Journey Tracking

### Purpose
Enhanced tracking of the complete opportunity journey with multi-touch attribution.

### Tracking Dimensions

#### 1. Touchpoint Tracking
- **Type**: Email, meeting, call, demo, proposal, etc.
- **Timestamp**: When it occurred
- **Outcome**: Response, no response, positive, negative
- **Content**: What was discussed/sent
- **Channel**: Email, phone, LinkedIn, etc.

#### 2. Multi-Touch Attribution
- **First touch**: Initial discovery source
- **Last touch**: Final interaction before conversion
- **Linear**: Equal credit to all touches
- **Time decay**: More credit to recent touches
- **Position-based**: 40% first, 40% last, 20% middle

#### 3. Engagement Timeline
- Visual timeline of all interactions
- State transitions overlaid
- Score changes over time
- Key moments highlighted

#### 4. Channel Effectiveness
- Which channels drive engagement
- Which channels close deals
- Response rates by channel
- Cost per interaction

### Implementation
**File**: `server/services/lifecycleJourneyTracking.js`

**Database**: `opportunity_touchpoints` table
```sql
CREATE TABLE opportunity_touchpoints (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  touchpoint_type VARCHAR(50) NOT NULL,
  channel VARCHAR(50),
  occurred_at TIMESTAMP NOT NULL,
  outcome VARCHAR(50),
  content_summary TEXT,
  metadata JSONB DEFAULT '{}',
  attribution_weight DECIMAL(5,4),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);
```

**Methods**:
```javascript
- recordTouchpoint(opportunityId, touchpoint)
- getJourneyTimeline(opportunityId)
- calculateAttribution(opportunityId, model)
- analyzeChannelEffectiveness(filters)
- getEngagementScore(opportunityId)
- exportJourney(opportunityId, format)
```

---

## Testing Strategy

### Checkpoint 1: Reports, Dashboard & Scoring
**File**: `scripts/testing/checkpoint1_sprint34.js`
- Test all report generation
- Verify dashboard data accuracy
- Validate scoring calculations
- Check database schema

### Checkpoint 2: Re-Engagement, Analytics & Actions
**File**: `scripts/testing/checkpoint2_sprint34.js`
- Test re-engagement detection
- Verify analytics computations
- Test automated actions execution
- Validate journey tracking

### Task 8: End-to-End Journey Testing
**File**: `scripts/testing/e2eJourneyTest.js`
- Complete journey from DISCOVERED to CLOSED.WON
- Verify all actions triggered correctly
- Check all touchpoints recorded
- Validate attribution calculations
- Verify scores updated correctly

### Task 9: Lifecycle State Machine Smoke Test
**File**: `scripts/testing/smokeTestSprint34.js`
- Quick validation of all Sprint 34 features
- Integration with Sprint 33 engine
- Performance benchmarks
- Error handling validation

### Final QA Certification
**File**: `scripts/testing/sprint34QACertification.js`
- Comprehensive testing of all features
- Data integrity checks
- Performance validation
- Production readiness certification

---

## Database Migrations

**File**: `db/migrations/2025_11_18_lifecycle_analytics.sql`

**New Tables**:
1. `lifecycle_scores` - Scoring data
2. `re_engagement_attempts` - Re-engagement tracking
3. `lifecycle_action_templates` - Automated action config
4. `opportunity_touchpoints` - Journey tracking

**New Views**:
1. `lifecycle_analytics_cache` - Materialized view for performance
2. `opportunity_journey_summary` - Complete journey overview

**New Functions**:
1. `calculate_engagement_score(uuid)` - PL/pgSQL scoring
2. `get_attribution_weights(uuid, varchar)` - Attribution calculation

---

## API Endpoints

### Reports
- `GET /api/lifecycle/reports/state-distribution`
- `GET /api/lifecycle/reports/conversion-funnel`
- `GET /api/lifecycle/reports/time-in-state`
- `GET /api/lifecycle/reports/velocity`
- `GET /api/lifecycle/reports/outcomes`

### Dashboard
- `GET /api/lifecycle/dashboard`
- `GET /api/lifecycle/dashboard/alerts`

### Scoring
- `GET /api/lifecycle/scores/:opportunityId`
- `POST /api/lifecycle/scores/calculate/:opportunityId`
- `GET /api/lifecycle/scores/high-risk`

### Re-Engagement
- `GET /api/lifecycle/re-engagement/candidates`
- `POST /api/lifecycle/re-engagement/execute/:opportunityId`
- `GET /api/lifecycle/re-engagement/stats`

### Analytics
- `GET /api/lifecycle/analytics/cohorts`
- `GET /api/lifecycle/analytics/paths`
- `GET /api/lifecycle/analytics/bottlenecks`
- `GET /api/lifecycle/analytics/forecast`

### Automated Actions
- `GET /api/lifecycle/actions/templates`
- `POST /api/lifecycle/actions/templates`
- `PUT /api/lifecycle/actions/templates/:id`

### Journey Tracking
- `GET /api/lifecycle/journey/:opportunityId`
- `POST /api/lifecycle/journey/:opportunityId/touchpoint`
- `GET /api/lifecycle/journey/:opportunityId/attribution`

---

## Performance Targets

- **Report generation**: < 2s for standard reports
- **Dashboard load**: < 1s for overview
- **Scoring calculation**: < 500ms per opportunity
- **Batch scoring**: 100 opportunities/second
- **Re-engagement detection**: < 5s for all opportunities
- **Analytics queries**: < 3s for complex analysis
- **Action execution**: < 200ms per action
- **Journey retrieval**: < 1s for complete timeline

---

## Business Value

### Automation
- 90% reduction in manual reporting effort
- Automatic re-engagement saves 50+ hours/month
- Triggered actions ensure no opportunities slip through cracks

### Visibility
- Real-time dashboard for sales leadership
- Complete journey visibility for reps
- Predictive insights for forecasting

### Optimization
- Data-driven process improvements
- Bottleneck identification and resolution
- Channel effectiveness optimization

### Revenue Impact
- 15-20% improvement in win rate through re-engagement
- 25% reduction in time-to-close through automated actions
- 10% increase in pipeline velocity through scoring prioritization

---

## Dependencies

- Sprint 33 Opportunity Lifecycle Engine (MUST be deployed)
- Sprint 31 Outreach Generation Service (for email templates)
- PostgreSQL 12+ (for materialized views)
- Node.js event system (for action triggers)

---

## Rollout Plan

1. **Phase 1**: Deploy database migrations
2. **Phase 2**: Deploy reporting and dashboard (read-only)
3. **Phase 3**: Deploy scoring system
4. **Phase 4**: Deploy re-engagement (with manual approval)
5. **Phase 5**: Deploy automated actions (gradual rollout)
6. **Phase 6**: Full analytics and journey tracking

---

**Design Status**: ✅ Complete and ready for implementation
**Estimated Complexity**: High (7 interconnected features)
**Estimated LOC**: ~2,500 production + ~1,500 test code
