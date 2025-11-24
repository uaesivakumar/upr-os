# Sprint 36: Lead Scoring Analytics & Optimization - Design Document

## Sprint Goal
Enhance the Lead Scoring Engine with analytics, optimization tools, alerts, routing, explanations, and predictive ML capabilities.

## Overview
Sprint 36 implements Phase 13: Lead Scoring Analytics & Optimization building on Sprint 35's foundation:
- **Score Optimization Tools**: Threshold tuning, A/B testing, parameter optimization
- **Lead Scoring Dashboard**: Real-time analytics, score distribution, trends
- **Score Alerts**: Automated notifications for score changes, anomalies
- **Score-Based Routing**: Automatic lead assignment based on scores
- **Score Explanations**: "Why this score" transparency for sales teams
- **Predictive Scoring**: ML model for conversion probability
- **Conversion Correlation**: Testing score accuracy vs actual conversions

---

## Task 1: Score Optimization Tools

### Purpose
Provide tools to optimize scoring parameters, test different configurations, and improve accuracy.

### Components

#### 1.1 Threshold Optimizer
**File**: `server/services/scoreOptimizationService.js`

```javascript
class ScoreOptimizationService {
  // Find optimal grade thresholds based on conversion data
  async optimizeGradeThresholds(options = {}) {
    const { minSampleSize = 100, conversionWindow = 90 } = options;

    // Analyze historical conversion rates by score ranges
    // Return optimal thresholds for A+, A, B+, B, C, D
  }

  // Test different weight combinations for priority formula
  async optimizePriorityWeights() {
    // Test variations of:
    // Priority = (Score×W1) + (Urgency×W2) + (Recency×W3) + (Stage×W4) + (Response×W5)
    // Find weights that maximize conversion correlation
  }

  // A/B test different scoring formulas
  async runABTest(configA, configB, options = {}) {
    const { sampleSize = 500, duration = 30 } = options;

    // Split opportunities randomly
    // Apply different configs
    // Track conversion rates
    // Return winner with statistical significance
  }
}
```

#### 1.2 Parameter Tuning
```javascript
// Fit scoring weights optimization
async optimizeFitWeights() {
  // Current: Industry(30), Size(25), Location(20), Tech(15), Budget(10)
  // Test variations and measure conversion correlation
}

// Decay rate optimization
async optimizeDecayRate() {
  // Current: Decay Rate = min(0.75, Days Inactive × 0.0083)
  // Find optimal decay multiplier
}
```

---

## Task 2: Lead Scoring Dashboard

### Purpose
Provide real-time visibility into scoring metrics, trends, and performance.

### Dashboard Components

#### 2.1 Score Distribution Widget
**File**: `server/services/scoreDashboardService.js`

```javascript
async getScoreDistribution(options = {}) {
  const { timeRange = 30 } = options;

  return {
    distribution: [
      { grade: 'A+', count: 45, percentage: 15, avgScore: 8500 },
      { grade: 'A', count: 67, percentage: 22, avgScore: 7000 },
      // ... more grades
    ],
    totalLeads: 300,
    avgScore: 5500,
    trend: '+5.2%' // vs previous period
  };
}
```

#### 2.2 Score Trends
```javascript
async getScoreTrends(options = {}) {
  const { days = 30, granularity = 'day' } = options;

  return {
    timeSeries: [
      { date: '2025-11-01', avgScore: 5200, count: 285 },
      { date: '2025-11-02', avgScore: 5350, count: 292 },
      // ... more data points
    ],
    topMovers: [
      { oppId: 'uuid', change: +1500, reason: 'High engagement' },
      // ... more movers
    ]
  };
}
```

#### 2.3 Conversion Metrics
```javascript
async getConversionMetrics(options = {}) {
  return {
    byGrade: [
      { grade: 'A+', conversionRate: 0.45, avgDaysToClose: 15 },
      { grade: 'A', conversionRate: 0.32, avgDaysToClose: 22 },
      // ... more grades
    ],
    scoreVsConversion: {
      correlation: 0.78, // Pearson correlation
      r2: 0.61 // Coefficient of determination
    }
  };
}
```

#### 2.4 Dashboard API Endpoints
**File**: `server/routes/scoringAnalytics.js`

- GET `/api/scoring/dashboard` - Full dashboard data
- GET `/api/scoring/distribution` - Score distribution
- GET `/api/scoring/trends` - Score trends over time
- GET `/api/scoring/conversion-metrics` - Conversion analysis
- GET `/api/scoring/top-movers` - Biggest score changes
- GET `/api/scoring/health` - System health metrics

---

## Task 3: Score Alerts

### Purpose
Automated notifications for significant score changes, anomalies, and opportunities.

### Alert Types

#### 3.1 Score Change Alerts
**File**: `server/services/scoreAlertService.js`

```javascript
class ScoreAlertService {
  // Major score increase (>20%)
  async checkScoreIncrease(opportunityId, oldScore, newScore) {
    if ((newScore - oldScore) / oldScore >= 0.20) {
      return this.createAlert({
        type: 'SCORE_INCREASE',
        severity: 'MEDIUM',
        opportunityId,
        message: `Score increased ${((newScore - oldScore) / oldScore * 100).toFixed(1)}%`,
        action: 'Review and prioritize follow-up'
      });
    }
  }

  // Major score decrease (>20%)
  async checkScoreDecrease(opportunityId, oldScore, newScore) {
    if ((oldScore - newScore) / oldScore >= 0.20) {
      return this.createAlert({
        type: 'SCORE_DECREASE',
        severity: 'HIGH',
        opportunityId,
        message: `Score dropped ${((oldScore - newScore) / oldScore * 100).toFixed(1)}%`,
        action: 'Investigate and re-engage'
      });
    }
  }

  // Grade change
  async checkGradeChange(opportunityId, oldGrade, newGrade) {
    const gradeOrder = ['D', 'C', 'B', 'B+', 'A', 'A+'];
    const oldIndex = gradeOrder.indexOf(oldGrade);
    const newIndex = gradeOrder.indexOf(newGrade);

    if (newIndex > oldIndex + 1) {
      return this.createAlert({
        type: 'GRADE_UPGRADE',
        severity: 'MEDIUM',
        message: `Grade upgraded from ${oldGrade} to ${newGrade}`
      });
    }
  }
}
```

#### 3.2 Anomaly Detection
```javascript
async detectAnomalies() {
  // Detect unusual patterns:
  // - Sudden spike in D-grade leads
  // - Decay affecting too many leads
  // - Conversion rate misalignment
  // - Score calculation errors
}
```

#### 3.3 Alert Rules Engine
```javascript
async evaluateAlertRules() {
  const rules = [
    {
      id: 'hot-lead-alert',
      condition: 'grade === "A+" && daysInState > 3',
      severity: 'HIGH',
      message: 'Hot lead not contacted recently'
    },
    {
      id: 'decay-alert',
      condition: 'decayRate > 0.5',
      severity: 'MEDIUM',
      message: 'Lead experiencing high decay'
    },
    // ... more rules
  ];

  // Evaluate all rules and trigger alerts
}
```

#### 3.4 Alert Channels
- Email notifications
- Webhook integrations
- In-app notifications
- Slack/Teams integration

---

## Task 4: Score-Based Routing

### Purpose
Automatically assign leads to appropriate sales reps based on scores, capacity, and expertise.

### Routing Engine
**File**: `server/services/scoreRoutingService.js`

```javascript
class ScoreRoutingService {
  // Route lead based on score and rules
  async routeLead(opportunityId) {
    const score = await this.getLeadScore(opportunityId);
    const rules = await this.getRoutingRules();

    // Apply routing logic
    const assignment = await this.findBestRep(score, rules);

    return {
      opportunityId,
      assignedTo: assignment.repId,
      reason: assignment.reason,
      priority: assignment.priority
    };
  }

  // Find best sales rep for lead
  async findBestRep(score, rules) {
    // Factors:
    // 1. Score tier (A+ leads to senior reps)
    // 2. Rep capacity (leads assigned)
    // 3. Rep performance (conversion rate)
    // 4. Rep specialization (industry match)
    // 5. Geographic alignment
    // 6. Current workload
  }
}
```

#### Routing Rules

**High-Value Leads (A+, A):**
```javascript
{
  scoreRange: [6000, 10000],
  assignTo: 'SENIOR_REPS',
  maxPerRep: 10,
  responseTime: '< 2 hours',
  priorityLevel: 'URGENT'
}
```

**Mid-Value Leads (B+, B):**
```javascript
{
  scoreRange: [2000, 5999],
  assignTo: 'MID_LEVEL_REPS',
  maxPerRep: 25,
  responseTime: '< 24 hours',
  priorityLevel: 'STANDARD'
}
```

**Low-Value Leads (C, D):**
```javascript
{
  scoreRange: [0, 1999],
  assignTo: 'JUNIOR_REPS',
  maxPerRep: 50,
  responseTime: '< 72 hours',
  priorityLevel: 'LOW'
}
```

#### Routing API
- POST `/api/routing/assign/:id` - Assign lead
- POST `/api/routing/batch-assign` - Batch assignment
- GET `/api/routing/recommendations/:id` - Get assignment suggestions
- PUT `/api/routing/rules` - Update routing rules
- GET `/api/routing/stats` - Routing statistics

---

## Task 5: Score Segmentation (A+ to D)

**Status**: ✅ Already implemented in Sprint 35

The grade segmentation system is fully functional:
- A+ (8000-10000): Hot leads
- A (6000-7999): Strong leads
- B+ (4000-5999): Good leads
- B (2000-3999): Decent leads
- C (1000-1999): Marginal leads
- D (0-999): Poor leads

---

## Task 6: Score Explanations ("Why this score")

### Purpose
Provide transparency into score calculations for sales teams to understand and trust the system.

### Explanation Engine
**File**: `server/services/scoreExplanationService.js`

```javascript
class ScoreExplanationService {
  async explainScore(opportunityId) {
    const score = await this.getLeadScore(opportunityId);

    return {
      opportunityId,
      leadScore: score.lead_score,
      grade: score.grade,
      breakdown: {
        qScore: {
          value: score.q_score,
          weight: '1x multiplier',
          explanation: 'Quality assessment based on company profile',
          factors: [
            { factor: 'Industry Match', contribution: 30, status: 'positive' },
            { factor: 'Company Size', contribution: 25, status: 'positive' },
            { factor: 'Location Fit', contribution: 20, status: 'positive' }
          ]
        },
        engagementScore: {
          value: score.engagement_score,
          weight: '1x multiplier',
          explanation: 'Based on activity and responsiveness',
          factors: [
            { factor: 'Recent Touchpoints', contribution: 30, status: 'positive' },
            { factor: 'Response Rate', contribution: 25, status: 'positive' },
            { factor: 'Meeting Attendance', contribution: 20, status: 'neutral' }
          ]
        },
        fitScore: {
          value: score.fit_score,
          weight: '1x multiplier',
          explanation: 'Company-opportunity fit analysis',
          factors: [
            { factor: 'Industry Fit', contribution: 30, status: 'positive' },
            { factor: 'Size Fit', contribution: 25, status: 'positive' },
            { factor: 'Location Fit', contribution: 20, status: 'positive' },
            { factor: 'Tech Stack', contribution: 15, status: 'positive' },
            { factor: 'Budget Indicators', contribution: 10, status: 'neutral' }
          ]
        }
      },
      recommendations: [
        'High engagement - schedule demo call soon',
        'Perfect industry fit - emphasize relevant case studies',
        'Strong budget indicators - consider upsell opportunities'
      ],
      risks: [
        'No activity in 7 days - risk of decay'
      ]
    };
  }
}
```

#### Explanation Types

1. **Factor Breakdown**: Show contribution of each component
2. **Comparison**: How this lead compares to similar leads
3. **Historical Context**: How score changed over time
4. **Action Items**: What can improve the score

---

## Task 7: Predictive Scoring (ML Model)

### Purpose
Use machine learning to predict conversion probability and enhance scoring accuracy.

### ML Architecture

#### 7.1 Feature Engineering
**File**: `server/ml/scoringFeatures.js`

```javascript
async extractFeatures(opportunityId) {
  return {
    // Profile features
    industry: encodeIndustry(metadata.industry),
    size: normalizeSize(metadata.size),
    location: encodeLocation(metadata.location),

    // Engagement features
    touchpointCount: count(touchpoints),
    recentTouchpoints: count(touchpoints, last_7_days),
    responseRate: calculateResponseRate(touchpoints),
    avgResponseTime: calculateAvgResponseTime(touchpoints),

    // Temporal features
    daysInPipeline: calculateDaysInPipeline(opportunityId),
    daysInCurrentState: calculateDaysInState(opportunityId),
    stateProgressions: countStateChanges(opportunityId),

    // Derived features
    engagementTrend: calculateEngagementTrend(opportunityId),
    scoreVelocity: calculateScoreVelocity(opportunityId),

    // Existing scores
    qScore: score.q_score,
    engagementScore: score.engagement_score,
    fitScore: score.fit_score,
    leadScore: score.lead_score
  };
}
```

#### 7.2 ML Model Service
**File**: `server/ml/predictiveScoringModel.js`

```javascript
class PredictiveScoringModel {
  // Train model on historical conversion data
  async train(options = {}) {
    const { minSamples = 500, testSplit = 0.2 } = options;

    // 1. Load historical data (features + conversion outcomes)
    // 2. Split into train/test sets
    // 3. Train model (e.g., Gradient Boosting, Random Forest)
    // 4. Evaluate performance (AUC-ROC, precision, recall)
    // 5. Save model
  }

  // Predict conversion probability
  async predict(opportunityId) {
    const features = await this.extractFeatures(opportunityId);
    const probability = await this.model.predict(features);

    return {
      opportunityId,
      conversionProbability: probability, // 0-1
      confidence: this.calculateConfidence(features),
      predictedScore: Math.round(probability * 10000),
      model: 'gradient_boost_v1',
      predictedAt: new Date()
    };
  }

  // Combine rule-based and ML scores
  async getHybridScore(opportunityId) {
    const ruleBasedScore = await calculator.calculateLeadScore(opportunityId);
    const mlScore = await this.predict(opportunityId);

    // Weighted average: 70% rule-based, 30% ML
    const hybridScore = Math.round(
      ruleBasedScore.leadScore * 0.7 + mlScore.predictedScore * 0.3
    );

    return {
      hybridScore,
      ruleBasedScore: ruleBasedScore.leadScore,
      mlScore: mlScore.predictedScore,
      conversionProbability: mlScore.conversionProbability
    };
  }
}
```

#### 7.3 Model Performance Tracking
```javascript
async trackModelPerformance() {
  return {
    accuracy: 0.82,
    precision: 0.79,
    recall: 0.84,
    f1Score: 0.81,
    aucRoc: 0.88,
    calibration: 0.92, // How well probabilities match actual outcomes
    lastTrained: '2025-11-15',
    sampleSize: 2500
  };
}
```

**Note**: For MVP, we'll use a simple logistic regression or decision tree. For production, consider more sophisticated models (XGBoost, LightGBM, or neural networks).

---

## Task 8: Conversion Correlation Testing

### Purpose
Validate that lead scores correlate with actual conversion outcomes.

### Testing Framework
**File**: `scripts/testing/conversionCorrelationTest.js`

```javascript
async function testConversionCorrelation() {
  // 1. Load historical opportunities with known outcomes
  const opportunities = await loadHistoricalData({
    minAge: 90, // Opportunities at least 90 days old
    withOutcomes: true // Must have conversion outcome
  });

  // 2. Calculate scores for historical opportunities
  const scores = await batchCalculateScores(opportunities);

  // 3. Analyze correlation
  const correlation = calculatePearsonCorrelation(
    scores.map(s => s.leadScore),
    opportunities.map(o => o.converted ? 1 : 0)
  );

  // 4. Test by grade
  const gradePerformance = {};
  for (const grade of ['A+', 'A', 'B+', 'B', 'C', 'D']) {
    const gradeOpps = opportunities.filter(o => o.grade === grade);
    const conversionRate = gradeOpps.filter(o => o.converted).length / gradeOpps.length;
    gradePerformance[grade] = {
      count: gradeOpps.length,
      conversionRate,
      avgDaysToClose: calculateAvgDaysToClose(gradeOpps.filter(o => o.converted))
    };
  }

  // 5. Statistical significance tests
  const chiSquare = performChiSquareTest(scores, outcomes);
  const tTest = performTTest(convertedScores, notConvertedScores);

  return {
    correlation,
    gradePerformance,
    statisticalSignificance: {
      chiSquare,
      tTest,
      pValue: chiSquare.pValue,
      significant: chiSquare.pValue < 0.05
    },
    recommendations: generateRecommendations(correlation, gradePerformance)
  };
}
```

### Validation Metrics

1. **Pearson Correlation**: Score vs conversion (target: > 0.6)
2. **Grade Conversion Rates**:
   - A+: Should have highest conversion rate
   - Monotonic decrease from A+ to D
3. **Days to Close**: Higher scores should close faster
4. **Statistical Significance**: p-value < 0.05

---

## Task 9: Lead Scoring Smoke Test

### Purpose
Comprehensive end-to-end test of all Sprint 36 features.

**File**: `scripts/testing/smokeTestSprint36.js`

Test scenarios:
1. Score optimization tools
2. Dashboard metrics retrieval
3. Alert generation and delivery
4. Score-based routing
5. Score explanations
6. Predictive ML scoring
7. Conversion correlation
8. Full analytics workflow

---

## Database Schema Extensions

### New Tables

```sql
-- Alert rules
CREATE TABLE score_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message_template TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alert log
CREATE TABLE score_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  rule_id UUID REFERENCES score_alert_rules(id),
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20),
  message TEXT,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Routing assignments
CREATE TABLE lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  assigned_to UUID NOT NULL, -- user/rep ID
  assigned_at TIMESTAMP DEFAULT NOW(),
  assignment_reason TEXT,
  priority_level VARCHAR(20),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  metadata JSONB DEFAULT '{}'
);

-- ML predictions
CREATE TABLE ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  model_version VARCHAR(50),
  conversion_probability DECIMAL(5,4),
  predicted_score INTEGER,
  features JSONB,
  confidence DECIMAL(5,4),
  predicted_at TIMESTAMP DEFAULT NOW()
);

-- Conversion outcomes (for training)
CREATE TABLE conversion_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  converted BOOLEAN NOT NULL,
  conversion_date TIMESTAMP,
  days_to_close INTEGER,
  deal_value DECIMAL(12,2),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints Summary

### Analytics & Dashboard (8 endpoints)
- GET `/api/scoring/dashboard`
- GET `/api/scoring/distribution`
- GET `/api/scoring/trends`
- GET `/api/scoring/conversion-metrics`
- GET `/api/scoring/top-movers`
- GET `/api/scoring/health`
- GET `/api/scoring/optimization-suggestions`
- GET `/api/scoring/ab-tests`

### Alerts (6 endpoints)
- GET `/api/alerts` - List alerts
- POST `/api/alerts/rules` - Create alert rule
- GET `/api/alerts/rules` - List rules
- PUT `/api/alerts/rules/:id` - Update rule
- POST `/api/alerts/:id/acknowledge` - Acknowledge alert
- DELETE `/api/alerts/rules/:id` - Delete rule

### Routing (5 endpoints)
- POST `/api/routing/assign/:id`
- POST `/api/routing/batch-assign`
- GET `/api/routing/recommendations/:id`
- PUT `/api/routing/rules`
- GET `/api/routing/stats`

### Explanations (2 endpoints)
- GET `/api/scoring/explain/:id`
- GET `/api/scoring/compare/:id1/:id2`

### ML/Predictive (4 endpoints)
- POST `/api/ml/predict/:id`
- POST `/api/ml/train`
- GET `/api/ml/model-info`
- GET `/api/ml/performance`

---

## Testing Strategy

### Checkpoint 1: Optimization & Dashboard (Tasks 1-2)
- Test score optimization algorithms
- Test threshold tuning
- Test A/B test framework
- Test dashboard data retrieval
- Test trend calculations

### Checkpoint 2: Alerts & Routing (Tasks 3-4)
- Test alert rule evaluation
- Test alert generation
- Test anomaly detection
- Test routing assignment
- Test capacity management

### Checkpoint 3: Explanations & ML (Tasks 6-7)
- Test score breakdown generation
- Test explanation clarity
- Test ML feature extraction
- Test ML predictions
- Test hybrid scoring

### Final Testing (Tasks 8-9)
- Conversion correlation analysis
- Statistical validation
- End-to-end smoke test
- Performance benchmarks

---

## Performance Targets

- Dashboard load: < 500ms
- Alert evaluation: < 100ms per opportunity
- Routing assignment: < 200ms
- Score explanation: < 300ms
- ML prediction: < 500ms
- Batch operations: < 20s for 100 opportunities

---

## Business Value

### Improved Decision Making
- 30% reduction in time spent prioritizing leads (dashboard)
- Real-time visibility into scoring performance
- Data-driven optimization

### Increased Efficiency
- 40% faster lead assignment (automated routing)
- Proactive alerts prevent opportunities from going cold
- Clear explanations increase sales team trust

### Higher Conversion Rates
- 15% improvement from optimized thresholds
- 20% improvement from ML-enhanced predictions
- Better alignment of resources to high-value leads

---

## Integration Points

- **Sprint 35**: Lead Scoring Engine (foundation)
- **Sprint 22**: Q-Score calculations
- **Sprint 34**: Engagement data
- **Future**: CRM integration, marketing automation

---

**Design Status**: ✅ Complete and ready for implementation
**Estimated Complexity**: Very High (9 interconnected tasks, ML component)
**Estimated LOC**: ~4,500 production + ~2,000 test code
