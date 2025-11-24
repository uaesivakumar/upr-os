# Feedback Loop & Learning System Architecture
**Sprint 41 - SIVA Framework Enhancement**

## Overview

The Feedback Loop is a critical component for achieving 100% SIVA maturity. It enables continuous learning and improvement of AI agents by collecting user feedback, analyzing patterns, and automatically retraining models.

## Architecture Components

### 1. Feedback Collection Layer

**Purpose:** Capture user feedback on AI decisions in real-time

**Components:**
- **Feedback API Endpoints** (`/api/feedback/*`)
  - POST `/api/feedback/decision` - Submit feedback on agent decision
  - POST `/api/feedback/rating` - Rate an AI suggestion
  - POST `/api/feedback/correction` - Provide correct answer
  - GET `/api/feedback/stats` - Get feedback analytics

- **Feedback Types:**
  - **Explicit Feedback:** User thumbs up/down, ratings, corrections
  - **Implicit Feedback:** Click-through rates, time spent, conversion events
  - **Contextual Metadata:** Page context, user role, decision type

### 2. Feedback Storage Layer

**Purpose:** Store and organize feedback data for analysis

**Database Schema:**

```sql
-- Main feedback table
CREATE TABLE agent_core.feedback (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES agent_core.agent_decisions(id),
  user_id INTEGER,
  feedback_type VARCHAR(50) NOT NULL, -- 'thumbs_up', 'thumbs_down', 'correction', 'rating'
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  correction_data JSONB, -- Corrected values if user provided them
  context JSONB, -- Page, filters, user state when feedback given
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback aggregations (materialized view for performance)
CREATE MATERIALIZED VIEW agent_core.feedback_summary AS
SELECT
  decision_id,
  agent_type,
  COUNT(*) as total_feedback,
  COUNT(*) FILTER (WHERE feedback_type IN ('thumbs_up', 'rating') AND rating >= 4) as positive_count,
  COUNT(*) FILTER (WHERE feedback_type IN ('thumbs_down', 'rating') AND rating <= 2) as negative_count,
  AVG(rating) as avg_rating,
  COUNT(DISTINCT user_id) as unique_users
FROM agent_core.feedback f
JOIN agent_core.agent_decisions d ON f.decision_id = d.id
GROUP BY decision_id, agent_type;

-- Decision quality scores
CREATE TABLE agent_core.decision_quality_scores (
  decision_id INTEGER PRIMARY KEY REFERENCES agent_core.agent_decisions(id),
  quality_score DECIMAL(5,2), -- 0-100 score
  confidence_adjusted_score DECIMAL(5,2), -- Weighted by confidence
  feedback_count INTEGER,
  positive_ratio DECIMAL(5,2),
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Feedback Analysis Service

**Purpose:** Analyze feedback patterns to identify improvement opportunities

**Analysis Types:**

**A. Pattern Recognition**
- Identify decisions that consistently receive negative feedback
- Find common characteristics of highly-rated decisions
- Detect edge cases where AI performs poorly

**B. Quality Scoring**
```javascript
// Decision Quality Score Formula
quality_score = (
  (positive_feedback * 100) - (negative_feedback * 50) +
  (correction_accuracy * 75) +
  (confidence_alignment * 25)
) / total_weight

confidence_alignment = abs(agent_confidence - actual_success_rate)
```

**C. Improvement Recommendations**
- Feature importance analysis
- Threshold optimization suggestions
- New training data requirements

**Service Implementation:**
```javascript
// server/services/feedbackAnalysis.js
class FeedbackAnalysisService {
  async analyzeDecisionQuality(decisionId) {
    // Aggregate feedback
    // Calculate quality score
    // Store in decision_quality_scores table
  }

  async identifyPatterns(timeWindow = '7 days') {
    // Find common failure patterns
    // Identify high-performing decision types
  }

  async generateImprovementPlan() {
    // Analyze weak areas
    // Suggest training data needs
    // Recommend parameter adjustments
  }
}
```

### 4. Model Improvement Pipeline

**Purpose:** Automatically retrain models based on feedback

**Pipeline Stages:**

**Stage 1: Data Preparation**
- Collect decisions with feedback
- Label quality (good/bad/neutral)
- Create training examples

**Stage 2: Model Evaluation**
- Compare current model vs feedback
- Identify mispredictions
- Calculate improvement potential

**Stage 3: Retraining**
- Fine-tune on corrected examples
- A/B test new model vs current
- Gradual rollout if improvement confirmed

**Stage 4: Validation**
- Test on holdout set
- Compare quality scores
- Rollback if performance degrades

**Implementation:**
```javascript
// server/services/modelImprovement.js
class ModelImprovementPipeline {
  async collectTrainingData(minFeedbackCount = 100) {
    // Get decisions with sufficient feedback
    // Create labeled dataset
  }

  async trainNewModel(trainingData) {
    // Fine-tune model
    // Save as model_v{N+1}
  }

  async abTestModels(oldModelId, newModelId, duration = '7 days') {
    // Route 50% traffic to each model
    // Track quality metrics
    // Determine winner
  }

  async promoteModel(modelId) {
    // Make new model primary
    // Archive old model
    // Notify team
  }
}
```

### 5. A/B Testing Framework

**Purpose:** Safely test model improvements with real users

**Components:**

**Experiment Table:**
```sql
CREATE TABLE agent_core.experiments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  control_model VARCHAR(100), -- e.g., 'lead_scoring_v1'
  variant_model VARCHAR(100),  -- e.g., 'lead_scoring_v2'
  traffic_split DECIMAL(3,2) DEFAULT 0.50, -- 50/50 split
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status VARCHAR(50), -- 'active', 'completed', 'stopped'
  winner VARCHAR(50), -- 'control', 'variant', 'inconclusive'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_core.experiment_assignments (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES agent_core.experiments(id),
  user_id INTEGER,
  variant VARCHAR(50), -- 'control' or 'variant'
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(experiment_id, user_id)
);

CREATE TABLE agent_core.experiment_metrics (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES agent_core.experiments(id),
  variant VARCHAR(50),
  metric_name VARCHAR(100), -- 'avg_quality_score', 'positive_feedback_rate'
  metric_value DECIMAL(10,4),
  sample_size INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW()
);
```

**Experiment Service:**
```javascript
// server/services/abTesting.js
class ABTestingService {
  async createExperiment(config) {
    // Create experiment record
    // Set traffic allocation
  }

  async assignVariant(userId, experimentId) {
    // Consistent hashing for user assignment
    // Store in experiment_assignments
  }

  async recordMetric(experimentId, variant, metricName, value) {
    // Log experiment metrics
  }

  async analyzeExperiment(experimentId) {
    // Statistical significance testing
    // Determine winner
  }
}
```

### 6. Admin Dashboard

**Purpose:** Monitor feedback and model performance

**Features:**
- **Feedback Overview:** Total feedback, positive/negative ratios
- **Decision Quality Trends:** Quality scores over time
- **Top Issues:** Decisions with most negative feedback
- **Model Performance:** Current vs previous models
- **Active Experiments:** A/B test status and results

**API Endpoints:**
```javascript
GET /api/admin/feedback/overview
GET /api/admin/feedback/decisions?sort=quality_score&order=asc&limit=10
GET /api/admin/feedback/trends?period=30d
GET /api/admin/experiments
GET /api/admin/experiments/:id/results
```

## Data Flow

```
User Action → AI Decision → Display to User
                ↓
        User Provides Feedback
                ↓
        Feedback Collection API
                ↓
        Store in Database
                ↓
        Feedback Analysis Service
                ↓
    ┌───────────┴────────────┐
    ↓                        ↓
Quality Scoring         Pattern Analysis
    ↓                        ↓
Update Scores          Improvement Plan
                            ↓
                Model Improvement Pipeline
                            ↓
                    A/B Testing
                            ↓
                    Deploy if Better
```

## Integration Points

### Existing SIVA Components

**Agent Decisions Table:**
- Already stores all AI decisions
- Add quality_score_id foreign key
- Enable feedback loop connection

**Agent Hub:**
- Monitor feedback metrics per agent
- Track agent improvement over time

**SIVA Tools:**
- Each tool decision can receive feedback
- Tool-specific improvement pipelines

## Success Metrics

**Phase 1 (Sprint 41):**
- ✅ Feedback collection infrastructure operational
- ✅ 100+ feedback entries collected
- ✅ Quality scores calculated for all decisions
- ✅ Admin dashboard displaying metrics

**Phase 2 (Sprint 42-46):**
- Automated model retraining pipeline active
- 2+ successful A/B tests completed
- 10%+ improvement in decision quality scores
- 80%+ user satisfaction with AI decisions

## Security & Privacy

**Data Protection:**
- Feedback data encrypted at rest
- PII anonymization for analysis
- User consent for feedback collection
- Compliance with GDPR/CCPA

**Access Control:**
- Admin-only access to raw feedback
- Aggregated metrics for team
- Audit log for feedback access

## Scalability Considerations

**Performance:**
- Materialized views for aggregations
- Background jobs for analysis
- Caching for dashboard queries
- Partition large tables by date

**Storage:**
- Archive old feedback (>6 months) to cold storage
- Retain only aggregated metrics for historical analysis

## Next Steps

**Sprint 41 Implementation Order:**
1. ✅ Create database schema → CHECKPOINT 1
2. ✅ Implement feedback collection APIs → CHECKPOINT 2
3. ✅ Build analysis service → CHECKPOINT 3
4. ✅ Quality scoring system
5. ✅ Model improvement pipeline
6. ✅ Admin dashboard
7. ✅ A/B testing framework → CHECKPOINT 4
8. ✅ End-to-end testing
9. ✅ Documentation → FINAL QUALITY CHECK

---

**Status:** Architecture Designed ✅
**Next:** Implement database schema
**Owner:** SIVA Team
**Sprint:** 41 (Feedback Loop & Learning System)
