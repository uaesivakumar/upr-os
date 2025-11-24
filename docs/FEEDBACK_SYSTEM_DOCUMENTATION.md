# Feedback System Documentation
## Sprint 41: Feedback Loop & Learning System

**Version:** 1.0
**Last Updated:** 2025-11-20
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Database Schema](#database-schema)
5. [Integration Guide](#integration-guide)
6. [Quality Scoring](#quality-scoring)
7. [Pattern Analysis](#pattern-analysis)
8. [Model Improvement](#model-improvement)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Feedback System is a comprehensive solution for collecting, analyzing, and learning from user feedback on AI agent decisions. It enables continuous improvement of the SIVA framework through:

- **Real-time feedback collection** (thumbs up/down, ratings, corrections, comments)
- **Automated quality scoring** (0-100 scale with confidence adjustment)
- **Pattern identification** (poor performers, edge cases, correction patterns)
- **Training data generation** from user corrections and high-quality decisions
- **Model versioning** and improvement tracking
- **A/B testing** infrastructure for safe model rollouts

### Key Features

✅ **12 REST API Endpoints** for feedback and analysis
✅ **8 Database Tables** with materialized views for performance
✅ **Automatic Quality Scoring** with configurable algorithms
✅ **Pattern Recognition** for identifying improvement opportunities
✅ **Training Pipeline** for model retraining workflows
✅ **A/B Testing** infrastructure for controlled experiments
✅ **Foreign Key Integrity** with cascade deletes

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    FEEDBACK SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Feedback Collection Layer                               │
│     └─ /api/feedback/* (6 endpoints)                        │
│                                                              │
│  2. Analysis & Insights Layer                               │
│     └─ /api/feedback-analysis/* (6 endpoints)               │
│                                                              │
│  3. Data Storage Layer                                      │
│     └─ PostgreSQL (agent_core schema, 8 tables)             │
│                                                              │
│  4. Model Improvement Layer                                 │
│     └─ Training data collection & model versioning          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Feedback → Feedback Table → Quality Calculation → Quality Scores Table
                      ↓                                        ↓
                Corrections? ────────────────→ Training Samples Table
                                                              ↓
Pattern Analysis ← Feedback Summary (Materialized View) → Model Versions
       ↓
Improvement Plan → Retraining Workflow → A/B Testing → Production
```

---

## API Reference

### Feedback Collection Endpoints

#### 1. POST `/api/feedback/decision`
Submit feedback on an agent decision.

**Request Body:**
```json
{
  "decision_id": "uuid-string",
  "user_id": 123,
  "feedback_type": "thumbs_up | thumbs_down | rating | correction | comment",
  "rating": 1-5,  // Optional, required if feedback_type = 'rating'
  "comment": "Optional feedback text",
  "correction_data": {  // Optional, for corrections
    "corrected_field": "new_value"
  },
  "context": {  // Optional metadata
    "page": "dashboard",
    "filters": {...}
  }
}
```

**Response:**
```json
{
  "ok": true,
  "feedback": {
    "id": 123,
    "decision_id": "uuid-string",
    "feedback_type": "thumbs_up",
    "created_at": "2025-11-20T10:00:00Z"
  },
  "quality_score": 85.5,
  "message": "Feedback recorded successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/feedback/decision \
  -H "Content-Type: application/json" \
  -d '{
    "decision_id": "9b5de4e8-0e7f-4a94-ac7a-33ec7828d9d1",
    "feedback_type": "thumbs_up",
    "comment": "Great decision!"
  }'
```

---

#### 2. POST `/api/feedback/rating`
Submit a rating (1-5 stars).

**Request Body:**
```json
{
  "decision_id": "uuid-string",
  "rating": 4,
  "comment": "Optional feedback"
}
```

**Response:**
```json
{
  "ok": true,
  "feedback_id": 124,
  "quality_score": 78.2
}
```

---

#### 3. POST `/api/feedback/correction`
Submit a correction for incorrect agent output.

**Request Body:**
```json
{
  "decision_id": "uuid-string",
  "correction_data": {
    "field": "contact_tier",
    "original_value": "C",
    "corrected_value": "A"
  },
  "comment": "Should be tier A based on engagement"
}
```

**Response:**
```json
{
  "ok": true,
  "feedback_id": 125,
  "training_sample_created": true,
  "message": "Correction recorded and training sample created"
}
```

**Note:** Corrections automatically create training samples for model retraining.

---

#### 4. GET `/api/feedback/stats`
Get aggregate feedback statistics.

**Query Parameters:**
- `agent_type` - Filter by agent type (optional)
- `decision_type` - Filter by decision type (optional)
- `time_period` - "7d", "30d", "90d" (default: "30d")

**Response:**
```json
{
  "ok": true,
  "stats": {
    "total_feedback": 1523,
    "total_decisions": 892,
    "avg_quality_score": 76.8,
    "feedback_distribution": {
      "thumbs_up": 987,
      "thumbs_down": 234,
      "ratings": 189,
      "corrections": 45,
      "comments": 68
    },
    "quality_distribution": {
      "excellent": 234,  // >= 80
      "good": 445,       // 60-79
      "average": 178,    // 40-59
      "poor": 35         // < 40
    },
    "agent_trends": [
      {
        "agent_type": "contact_tier",
        "avg_quality": 82.3,
        "total_decisions": 234,
        "total_feedback": 456
      }
    ]
  }
}
```

---

#### 5. GET `/api/feedback/decision/:decision_id`
Get all feedback for a specific decision.

**Response:**
```json
{
  "ok": true,
  "decision_id": "uuid-string",
  "feedback": [
    {
      "id": 123,
      "feedback_type": "thumbs_up",
      "rating": 5,
      "comment": "Excellent decision",
      "created_at": "2025-11-20T10:00:00Z"
    }
  ],
  "quality_score": 85.5,
  "total_feedback": 3
}
```

---

#### 6. GET `/api/feedback/quality/:decision_id`
Get quality score and metrics for a decision.

**Response:**
```json
{
  "ok": true,
  "decision_id": "uuid-string",
  "quality_score": 85.5,
  "confidence_adjusted_score": 81.2,
  "feedback_count": 5,
  "positive_count": 4,
  "negative_count": 1,
  "positive_ratio": 80.0,
  "agent_confidence": 0.95,
  "calculated_at": "2025-11-20T10:00:00Z"
}
```

---

### Feedback Analysis Endpoints

#### 7. POST `/api/feedback-analysis/decision/:decision_id`
Analyze quality for a specific decision.

**Response:**
```json
{
  "ok": true,
  "analysis": {
    "decision_id": "uuid-string",
    "quality_score": 85.5,
    "confidence_adjusted_score": 81.2,
    "feedback_count": 5,
    "positive_count": 4,
    "negative_count": 1,
    "positive_ratio": 80.0,
    "agent_confidence": 0.95
  }
}
```

---

#### 8. GET `/api/feedback-analysis/patterns`
Identify patterns in feedback data.

**Query Parameters:**
- `timeWindow` - "7 days", "30 days", "90 days" (default: "30 days")
- `minFeedbackCount` - Minimum feedback required (default: 3)
- `qualityThreshold` - Quality threshold for poor performers (default: 50)

**Response:**
```json
{
  "ok": true,
  "patterns": {
    "analyzed_at": "2025-11-20T10:00:00Z",
    "time_window": "30 days",
    "poor_performers": [
      {
        "agent_type": "lead_scoring",
        "decision_type": "score_calculation",
        "avg_quality_score": 42.3,
        "decision_count": 45,
        "feedback_count": 89,
        "example_decisions": ["uuid1", "uuid2"]
      }
    ],
    "top_performers": [
      {
        "agent_type": "contact_tier",
        "avg_quality_score": 92.1,
        "decision_count": 234
      }
    ],
    "edge_cases": [
      {
        "agent_type": "enrichment",
        "disagreement_score": 0.85,
        "feedback_count": 12
      }
    ],
    "correction_patterns": [
      {
        "agent_type": "contact_tier",
        "correction_count": 23,
        "common_corrections": [...]
      }
    ]
  }
}
```

---

#### 9. GET `/api/feedback-analysis/improvement-plan`
Generate actionable improvement recommendations.

**Query Parameters:**
- `timeWindow` - "7 days", "30 days", "90 days" (default: "30 days")
- `minImpact` - Minimum decisions affected (default: 5)

**Response:**
```json
{
  "ok": true,
  "plan": {
    "generated_at": "2025-11-20T10:00:00Z",
    "total_recommendations": 8,
    "summary": {
      "critical_issues": 1,
      "high_priority": 3,
      "medium_priority": 4,
      "low_priority": 0
    },
    "recommendations": [
      {
        "priority": "high",
        "type": "poor_performance",
        "agent_type": "lead_scoring",
        "issue": "Low quality score (42.3) across 45 decisions",
        "recommendation": "Retrain model with corrected examples from feedback",
        "impact": "45 decisions affected",
        "estimated_improvement": "25-35%",
        "example_decision_ids": ["uuid1", "uuid2"]
      }
    ]
  }
}
```

---

#### 10. GET `/api/feedback-analysis/trends`
Get time-series feedback trends.

**Query Parameters:**
- `days` - Number of days (default: 30)
- `groupBy` - "hour", "day", "week" (default: "day")
- `agentType` - Filter by agent type (optional)

**Response:**
```json
{
  "ok": true,
  "trends": {
    "period_days": 30,
    "group_by": "day",
    "agent_type": "all",
    "data_points": 30,
    "trends": [
      {
        "period": "2025-11-20",
        "feedback_count": 45,
        "avg_quality": 78.2,
        "thumbs_up": 32,
        "thumbs_down": 8,
        "corrections": 2,
        "sentiment_score": 0.71
      }
    ]
  }
}
```

---

#### 11. POST `/api/feedback-analysis/store-pattern`
Store an identified pattern.

**Request Body:**
```json
{
  "type": "failure_mode | success_factor | edge_case",
  "agent_type": "contact_tier",
  "description": "Pattern description",
  "frequency": 15,
  "severity": "low | medium | high | critical",
  "example_decision_ids": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "ok": true,
  "pattern": {
    "id": 12,
    "pattern_type": "failure_mode",
    "severity": "high",
    "identified_at": "2025-11-20T10:00:00Z"
  }
}
```

---

#### 12. GET `/api/feedback-analysis/batch-analyze`
Batch analyze all recent decisions with feedback.

**Query Parameters:**
- `days` - Number of days to analyze (default: 7)
- `limit` - Max decisions to analyze (default: 100)

**Response:**
```json
{
  "ok": true,
  "batch_analysis": {
    "analyzed_count": 87,
    "total_decisions": 87,
    "avg_quality_score": 76.8,
    "updated_at": "2025-11-20T10:00:00Z"
  }
}
```

---

## Database Schema

### Tables Overview

#### 1. `agent_core.feedback`
Main feedback collection table.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| decision_id | UUID | Foreign key to agent_decisions |
| user_id | INTEGER | User who provided feedback |
| feedback_type | VARCHAR(50) | Type: thumbs_up, thumbs_down, rating, correction, comment |
| rating | INTEGER | Rating 1-5 (if applicable) |
| comment | TEXT | Optional text feedback |
| correction_data | JSONB | Corrected values (for corrections) |
| context | JSONB | Page, filters, user state |
| created_at | TIMESTAMP | When feedback was created |
| updated_at | TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_feedback_decision_id` on decision_id
- `idx_feedback_user_id` on user_id
- `idx_feedback_type` on feedback_type
- `idx_feedback_created_at` on created_at

---

#### 2. `agent_core.decision_quality_scores`
Quality metrics per decision.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| decision_id | UUID | Unique, foreign key to agent_decisions |
| quality_score | DECIMAL(5,2) | Calculated quality 0-100 |
| confidence_adjusted_score | DECIMAL(5,2) | Quality * agent confidence |
| feedback_count | INTEGER | Total feedback received |
| positive_count | INTEGER | Positive feedback count |
| negative_count | INTEGER | Negative feedback count |
| positive_ratio | DECIMAL(5,2) | Positive percentage |
| calculated_at | TIMESTAMP | When score was calculated |
| updated_at | TIMESTAMP | Last update |

---

#### 3. `agent_core.feedback_summary`
Materialized view for aggregations (performance optimization).

**Refresh:** Call `agent_core.refresh_feedback_summary()` to update.

---

#### 4. `agent_core.experiments`
A/B testing experiments.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Experiment name |
| description | TEXT | Experiment details |
| control_model | VARCHAR(100) | Control model version |
| variant_model | VARCHAR(100) | Variant model version |
| traffic_split | DECIMAL(3,2) | Traffic split (0.0-1.0) |
| start_date | TIMESTAMP | Start date |
| end_date | TIMESTAMP | End date |
| status | VARCHAR(50) | draft, active, completed, stopped |
| winner | VARCHAR(50) | control, variant, inconclusive |
| config | JSONB | Configuration |

---

#### 5. `agent_core.experiment_assignments`
User variant assignments for experiments.

---

#### 6. `agent_core.experiment_metrics`
Experiment results and metrics.

---

#### 7. `agent_core.model_versions`
Track model versions for retraining.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| model_name | VARCHAR(100) | Model name |
| version | VARCHAR(50) | Version string |
| model_type | VARCHAR(50) | Type: lead_scoring, contact_tier, etc. |
| training_data_size | INTEGER | Training samples used |
| training_config | JSONB | Training configuration |
| performance_metrics | JSONB | Accuracy, F1, etc. |
| status | VARCHAR(50) | training, testing, active, archived |
| is_production | BOOLEAN | Is this production model? |
| trained_at | TIMESTAMP | Training date |
| promoted_at | TIMESTAMP | Production promotion date |
| created_by | VARCHAR(100) | Creator |
| notes | TEXT | Notes |

---

#### 8. `agent_core.training_samples`
Training data from feedback.

| Column | Type | Description |
|--------|------|-------------|
| sample_id | UUID | Primary key |
| tool_name | VARCHAR(100) | Agent type |
| sample_type | VARCHAR(50) | Source type |
| input_features | JSONB | Input data |
| expected_output | JSONB | Expected output |
| actual_output | JSONB | Actual output |
| quality_score | DECIMAL(3,2) | Sample quality |
| is_validated | BOOLEAN | Is validated? |
| validated_by | VARCHAR(100) | Validator |
| validated_at | TIMESTAMP | Validation date |
| source_decision_id | UUID | Source decision |
| notes | TEXT | Notes |
| metadata | JSONB | Additional metadata |
| created_at | TIMESTAMP | Creation date |

---

#### 9. `agent_core.feedback_patterns`
Identified patterns from analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| pattern_type | VARCHAR(100) | failure_mode, success_factor, edge_case |
| agent_type | VARCHAR(100) | Agent type |
| description | TEXT | Pattern description |
| frequency | INTEGER | Occurrence count |
| severity | VARCHAR(50) | low, medium, high, critical |
| example_decisions | UUID[] | Example decision IDs |
| identified_at | TIMESTAMP | When identified |
| resolved_at | TIMESTAMP | Resolution date |
| resolution_notes | TEXT | Resolution notes |

---

### Database Functions

#### `agent_core.calculate_quality_score(decision_id UUID)`
Calculate quality score for a decision.

**Returns:** DECIMAL(5,2) (0-100 scale)

**Algorithm:**
```sql
quality_score = (
  (positive_feedback / total_feedback * 100 * 0.6) +  -- 60% weight
  (avg_rating / 5 * 100 * 0.4)                        -- 40% weight
)
```

**Usage:**
```sql
SELECT agent_core.calculate_quality_score('9b5de4e8-0e7f-4a94-ac7a-33ec7828d9d1');
```

---

#### `agent_core.refresh_feedback_summary()`
Refresh the materialized view.

**Usage:**
```sql
SELECT agent_core.refresh_feedback_summary();
```

**Note:** Run periodically (e.g., every hour) or after bulk feedback insertions.

---

## Integration Guide

### Frontend Integration

#### Step 1: Capture User Feedback

```javascript
// React example
const submitFeedback = async (decisionId, feedbackType) => {
  const response = await fetch('/api/feedback/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision_id: decisionId,
      feedback_type: feedbackType,
      context: {
        page: window.location.pathname,
        filters: getCurrentFilters()
      }
    })
  });

  const result = await response.json();

  if (result.ok) {
    console.log('Quality score:', result.quality_score);
  }
};

// Thumbs up/down buttons
<button onClick={() => submitFeedback(decision.id, 'thumbs_up')}>👍</button>
<button onClick={() => submitFeedback(decision.id, 'thumbs_down')}>👎</button>
```

---

#### Step 2: Display Quality Indicators

```javascript
// Fetch quality score
const getQualityIndicator = async (decisionId) => {
  const response = await fetch(`/api/feedback/quality/${decisionId}`);
  const data = await response.json();

  const score = data.quality_score;

  if (score >= 80) return { color: 'green', text: 'High Quality' };
  if (score >= 60) return { color: 'yellow', text: 'Good' };
  if (score >= 40) return { color: 'orange', text: 'Average' };
  return { color: 'red', text: 'Needs Review' };
};
```

---

#### Step 3: Collect Corrections

```javascript
const submitCorrection = async (decisionId, originalValue, correctedValue) => {
  await fetch('/api/feedback/correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision_id: decisionId,
      correction_data: {
        field: 'contact_tier',
        original_value: originalValue,
        corrected_value: correctedValue
      },
      comment: 'User correction from dashboard'
    })
  });
};
```

---

### Backend Integration

#### Step 1: Log Agent Decisions

Ensure all agent decisions are logged to `agent_core.agent_decisions`:

```javascript
const logDecision = async (toolName, primitiveType, inputData, outputData, confidence) => {
  const result = await pool.query(`
    INSERT INTO agent_core.agent_decisions (
      decision_id, tool_name, primitive_type, input_data,
      output_data, confidence_score, decided_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
    )
    RETURNING decision_id
  `, [toolName, primitiveType, JSON.stringify(inputData),
      JSON.stringify(outputData), confidence]);

  return result.rows[0].decision_id;
};
```

---

#### Step 2: Display Decision ID in UI

Include decision_id in API responses so users can provide feedback:

```javascript
// API response example
{
  "contact": {
    "name": "John Doe",
    "tier": "A",
    "decision_metadata": {
      "decision_id": "9b5de4e8-0e7f-4a94-ac7a-33ec7828d9d1",
      "confidence": 0.95,
      "agent": "contact_tier"
    }
  }
}
```

---

### Scheduled Tasks

#### Daily Quality Analysis

```javascript
// Run daily batch analysis
const dailyAnalysis = async () => {
  const response = await fetch('/api/feedback-analysis/batch-analyze?days=1');
  const result = await response.json();

  console.log(`Analyzed ${result.batch_analysis.analyzed_count} decisions`);
  console.log(`Average quality: ${result.batch_analysis.avg_quality_score}`);
};

// Schedule with cron: 0 2 * * * (2 AM daily)
```

---

#### Weekly Pattern Identification

```javascript
// Identify patterns weekly
const weeklyPatterns = async () => {
  const response = await fetch('/api/feedback-analysis/patterns?timeWindow=7 days');
  const result = await response.json();

  // Alert on poor performers
  if (result.patterns.poor_performers.length > 0) {
    sendAlert('Poor performing agents detected', result.patterns.poor_performers);
  }
};

// Schedule with cron: 0 3 * * 1 (3 AM Mondays)
```

---

#### Monthly Improvement Planning

```javascript
// Generate monthly improvement plan
const monthlyPlan = async () => {
  const response = await fetch('/api/feedback-analysis/improvement-plan?timeWindow=30 days');
  const result = await response.json();

  // Create tasks for critical issues
  result.plan.recommendations
    .filter(r => r.priority === 'critical')
    .forEach(recommendation => {
      createImprovementTask(recommendation);
    });
};

// Schedule with cron: 0 4 1 * * (4 AM 1st of month)
```

---

## Quality Scoring

### Algorithm Details

The quality score combines two metrics:

1. **Positive Ratio (60% weight)**
   - Percentage of positive feedback (thumbs up, ratings ≥ 4)
   - Range: 0-100

2. **Average Rating (40% weight)**
   - Average of all ratings (1-5 scale), normalized to 0-100
   - Null ratings treated as neutral (3/5)

**Formula:**
```
quality_score = (positive_ratio * 0.6) + (avg_rating_normalized * 0.4)

where:
  positive_ratio = (positive_feedback_count / total_feedback) * 100
  avg_rating_normalized = (avg_rating / 5) * 100
```

**Example Calculation:**
```
Feedback:
- 3 thumbs up
- 1 thumbs down
- 1 rating: 4
- 1 rating: 5

Positive count: 5 (3 thumbs up + 2 ratings ≥ 4)
Negative count: 1 (1 thumbs down)
Total feedback: 6
Avg rating: (4 + 5) / 2 = 4.5

Positive ratio = 5/6 * 100 = 83.33
Avg rating normalized = 4.5/5 * 100 = 90.00

Quality score = (83.33 * 0.6) + (90.00 * 0.4)
              = 50.00 + 36.00
              = 86.00
```

### Confidence-Adjusted Score

The confidence-adjusted score accounts for agent confidence:

```
confidence_adjusted_score = quality_score * agent_confidence
```

**Example:**
- Quality score: 86.00
- Agent confidence: 0.95
- Adjusted score: 86.00 * 0.95 = 81.70

This penalizes high-quality scores from low-confidence decisions.

---

## Pattern Analysis

### Poor Performers

**Criteria:**
- Average quality score < 50 (configurable)
- Minimum 3 feedback instances (configurable)
- Within time window (default: 30 days)

**Action:**
- Retrain model with corrections
- Review decision logic
- Add edge case handling

---

### Top Performers

**Criteria:**
- Average quality score ≥ 80
- Minimum 5 decisions
- Consistent positive feedback

**Action:**
- Document success patterns
- Replicate in other agents
- Use as training examples

---

### Edge Cases

**Criteria:**
- High disagreement (e.g., 50/50 thumbs up/down)
- Multiple corrections with different values
- Low confidence with mixed feedback

**Action:**
- Manual review required
- Add to edge case test suite
- Consider rule refinements

---

### Correction Patterns

**Criteria:**
- 3+ corrections for same agent type
- Common corrected fields
- Recurring issues

**Action:**
- Immediate retraining priority
- Update validation rules
- Document known issues

---

## Model Improvement

### Training Data Collection

The system automatically collects training data from two sources:

#### 1. User Corrections
- **Quality:** 100 (highest)
- **Source:** `user_correction`
- **Auto-validated:** Yes
- **Usage:** Immediate retraining priority

#### 2. High-Quality Decisions
- **Quality:** Based on quality_score (≥ 70 default)
- **Source:** `high_quality_decision`
- **Auto-validated:** No
- **Usage:** Positive training examples

**Collection Example:**
```javascript
const trainingData = await modelPipeline.collectTrainingData({
  modelType: 'contact_tier',
  minFeedbackCount: 3,
  qualityThreshold: 70,
  timeWindow: '30 days',
  includeCorrections: true,
  includeHighQuality: true
});

// Save to database
await modelPipeline.saveTrainingSamples(trainingData.samples);
```

---

### Model Versioning

Track model versions for safe rollouts:

```javascript
// Create new version
const version = await modelPipeline.createModelVersion({
  model_name: 'ContactTierModel',
  version: '2.1.0',
  model_type: 'contact_tier',
  training_data_size: 1500,
  training_config: {
    epochs: 100,
    batch_size: 32,
    learning_rate: 0.001
  },
  performance_metrics: {
    accuracy: 0.96,
    f1_score: 0.94,
    precision: 0.95,
    recall: 0.93
  },
  notes: 'Trained with 1500 samples including 200 user corrections'
});

// Update after testing
await modelPipeline.updateModelVersion(version.id, {
  status: 'testing',
  performance_metrics: { /* updated metrics */ }
});

// Promote to production
await modelPipeline.promoteToProduction(version.id);
```

---

### Training Dataset Export

Export training data for model training:

```javascript
const dataset = await modelPipeline.exportTrainingDataset({
  modelType: 'contact_tier',
  minQualityScore: 70,
  isValidated: true,  // Only validated samples
  limit: 5000
});

// dataset.samples contains input_features and expected_output
```

---

## Best Practices

### 1. Feedback Collection

✅ **Do:**
- Show feedback buttons on all AI-generated content
- Include context (page, filters) with feedback
- Make corrections easy (inline editing)
- Thank users for feedback
- Display quality indicators

❌ **Don't:**
- Require login for simple thumbs up/down
- Ask for feedback multiple times for same decision
- Hide feedback buttons
- Ignore negative feedback

---

### 2. Quality Scoring

✅ **Do:**
- Wait for 3+ feedback instances before showing scores
- Use confidence-adjusted scores for decision making
- Refresh materialized views regularly
- Monitor score distributions

❌ **Don't:**
- Show scores with < 3 feedback instances
- Ignore confidence levels
- Treat all feedback equally (weight by recency/user)
- Display raw scores without context

---

### 3. Pattern Analysis

✅ **Do:**
- Run pattern analysis weekly
- Act on critical issues immediately
- Document identified patterns
- Track pattern resolution

❌ **Don't:**
- Wait until monthly review
- Ignore recurring patterns
- Mix pattern types in analysis
- Skip root cause analysis

---

### 4. Model Improvement

✅ **Do:**
- Retrain models when 100+ corrections available
- A/B test new models before production
- Version all models
- Track performance metrics
- Validate training samples

❌ **Don't:**
- Deploy untested models to production
- Skip version tracking
- Ignore user corrections
- Retrain with unvalidated data
- Mix data from different time periods

---

### 5. Performance

✅ **Do:**
- Use materialized views for aggregations
- Refresh views during off-peak hours
- Index frequently queried columns
- Batch process where possible

❌ **Don't:**
- Query feedback table directly for stats
- Refresh views during peak hours
- Skip index optimization
- Process feedback synchronously in API

---

## Troubleshooting

### Issue: Quality scores not calculating

**Symptoms:**
- `quality_score` is NULL in decision_quality_scores
- API returns NULL for quality

**Diagnosis:**
```sql
-- Check if feedback exists
SELECT COUNT(*) FROM agent_core.feedback
WHERE decision_id = 'your-decision-id';

-- Check function
SELECT agent_core.calculate_quality_score('your-decision-id');
```

**Solutions:**
1. Verify feedback exists for the decision
2. Ensure feedback_type is valid
3. Check for NULL ratings (should default to 3)
4. Re-run quality analysis:
   ```bash
   POST /api/feedback-analysis/decision/:decision_id
   ```

---

### Issue: Materialized view out of date

**Symptoms:**
- Aggregate stats don't match recent feedback
- Trends analysis shows old data

**Solution:**
```sql
SELECT agent_core.refresh_feedback_summary();
```

**Prevention:**
- Schedule hourly refresh: `0 * * * *`
- Refresh after bulk imports

---

### Issue: Training samples not created

**Symptoms:**
- Corrections submitted but no training samples
- `training_samples` table empty

**Diagnosis:**
```sql
-- Check corrections
SELECT * FROM agent_core.feedback
WHERE feedback_type = 'correction'
AND created_at >= NOW() - INTERVAL '7 days';

-- Check training samples
SELECT * FROM agent_core.training_samples
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Solutions:**
1. Verify correction_data is valid JSON
2. Check source_decision_id foreign key exists
3. Re-collect training data:
   ```javascript
   const data = await modelPipeline.collectTrainingData({...});
   await modelPipeline.saveTrainingSamples(data.samples);
   ```

---

### Issue: Pattern analysis returns no results

**Symptoms:**
- `/patterns` endpoint returns empty arrays
- No poor performers despite low scores

**Diagnosis:**
```sql
-- Check quality scores
SELECT AVG(quality_score), COUNT(*)
FROM agent_core.decision_quality_scores
WHERE calculated_at >= NOW() - INTERVAL '30 days';

-- Check feedback counts
SELECT d.tool_name, COUNT(f.id) as feedback_count
FROM agent_core.agent_decisions d
LEFT JOIN agent_core.feedback f ON d.decision_id = f.decision_id
WHERE d.decided_at >= NOW() - INTERVAL '30 days'
GROUP BY d.tool_name;
```

**Solutions:**
1. Lower `minFeedbackCount` threshold
2. Increase `timeWindow` (e.g., 90 days)
3. Adjust `qualityThreshold`
4. Verify decisions have feedback

---

### Issue: Slow API performance

**Symptoms:**
- Feedback submission > 1s
- Stats endpoint timeout

**Diagnosis:**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%agent_core.feedback%'
ORDER BY mean_exec_time DESC;

-- Check missing indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'agent_core';
```

**Solutions:**
1. Refresh materialized views
2. Add missing indexes
3. Use `/batch-analyze` for bulk operations
4. Enable connection pooling
5. Consider partitioning large tables

---

### Issue: Foreign key constraint violations

**Symptoms:**
- Error: "violates foreign key constraint"
- Cannot insert feedback

**Diagnosis:**
```sql
-- Verify decision exists
SELECT decision_id FROM agent_core.agent_decisions
WHERE decision_id = 'your-decision-id';
```

**Solutions:**
1. Ensure decision is logged before collecting feedback
2. Check decision_id format (must be valid UUID)
3. Verify agent_decisions table has the decision

---

### Issue: Cascade deletes not working

**Symptoms:**
- Orphaned feedback after decision deletion
- Foreign key errors

**Diagnosis:**
```sql
-- Check foreign key constraints
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f'
AND connamespace = 'agent_core'::regnamespace;
```

**Solution:**
- Foreign keys should have `ON DELETE CASCADE`
- Re-create constraints if missing

---

## Support & Contact

For questions or issues:
- **Documentation:** `/docs/FEEDBACK_LOOP_ARCHITECTURE.md`
- **Architecture:** `/docs/FEEDBACK_LOOP_ARCHITECTURE.md`
- **Progress Tracking:** `/docs/SPRINT_41_PROGRESS.md`
- **Database Migration:** `/db/migrations/2025_11_20_sprint41_feedback_loop.sql`

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Sprint:** 41 - Feedback Loop & Learning System
**Status:** ✅ Production Ready
