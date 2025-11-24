# Sprint 43: Golden Dataset Architecture

## Overview

A comprehensive system for curating, labeling, versioning, and managing high-quality training data to improve agent decision-making and model performance.

## Architecture Goals

1. **Data Quality**: Ensure only high-quality, validated examples are included
2. **Versioning**: Track dataset changes over time with Git-like versioning
3. **Traceability**: Link training examples back to production decisions
4. **Scalability**: Support growing dataset sizes and multiple data types
5. **Accessibility**: Easy export in multiple formats for different ML frameworks

## Dataset Structure

### 1. Core Schema

```sql
-- Golden dataset metadata
CREATE TABLE training.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  parent_version_id UUID REFERENCES training.datasets(id),
  is_active BOOLEAN DEFAULT true,
  quality_score DECIMAL(5,2),
  example_count INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB
);

-- Training examples
CREATE TABLE training.examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id),
  example_type VARCHAR(50) NOT NULL, -- 'contact_tier', 'lead_score', 'company_quality', etc.
  input_data JSONB NOT NULL,
  expected_output JSONB NOT NULL,
  source_decision_id UUID, -- Link to production decision
  quality_score DECIMAL(5,2),
  labels JSONB, -- Additional labels (confidence, difficulty, edge_case, etc.)
  validation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'validated', 'rejected'
  validated_by VARCHAR(255),
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Quality metrics per example
CREATE TABLE training.example_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID REFERENCES training.examples(id),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  computed_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Dataset versioning (Git-like)
CREATE TABLE training.dataset_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id),
  commit_hash VARCHAR(64) UNIQUE NOT NULL,
  parent_commit_hash VARCHAR(64),
  message TEXT NOT NULL,
  author VARCHAR(255) NOT NULL,
  committed_at TIMESTAMP DEFAULT NOW(),
  examples_added INTEGER DEFAULT 0,
  examples_removed INTEGER DEFAULT 0,
  examples_modified INTEGER DEFAULT 0,
  metadata JSONB
);

-- Example changes per commit
CREATE TABLE training.example_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id UUID REFERENCES training.dataset_commits(id),
  example_id UUID REFERENCES training.examples(id),
  change_type VARCHAR(20) NOT NULL, -- 'added', 'removed', 'modified'
  before_data JSONB,
  after_data JSONB,
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Labeling sessions (for admin tool)
CREATE TABLE training.labeling_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labeler_id VARCHAR(255) NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  examples_labeled INTEGER DEFAULT 0,
  session_type VARCHAR(50), -- 'initial_labeling', 'validation', 'correction'
  metadata JSONB
);

-- Label history
CREATE TABLE training.label_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID REFERENCES training.examples(id),
  session_id UUID REFERENCES training.labeling_sessions(id),
  labeler_id VARCHAR(255) NOT NULL,
  label_type VARCHAR(50),
  label_value JSONB NOT NULL,
  previous_value JSONB,
  labeled_at TIMESTAMP DEFAULT NOW(),
  confidence DECIMAL(5,2),
  notes TEXT
);

-- Analytics and insights
CREATE TABLE training.dataset_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES training.datasets(id),
  metric_name VARCHAR(100) NOT NULL,
  metric_value JSONB NOT NULL,
  computed_at TIMESTAMP DEFAULT NOW(),
  time_period VARCHAR(50), -- 'daily', 'weekly', 'all_time'
  metadata JSONB
);
```

### 2. Example Types

#### Contact Tier Examples
```json
{
  "input_data": {
    "title": "Chief Technology Officer",
    "seniority": "executive",
    "department": "engineering",
    "company_size": "midsize",
    "industry": "technology"
  },
  "expected_output": {
    "tier": "A",
    "confidence": 0.95,
    "reasoning": "Executive-level technical decision maker"
  },
  "labels": {
    "difficulty": "easy",
    "edge_case": false,
    "clear_indicators": ["title", "seniority"]
  }
}
```

#### Lead Score Examples
```json
{
  "input_data": {
    "fit_score": 85,
    "engagement_score": 72,
    "intent_signals": ["website_visit", "demo_request"],
    "company_quality": "high",
    "contact_tier": "A"
  },
  "expected_output": {
    "lead_score": 88,
    "priority": "hot",
    "reasoning": "High fit with strong engagement"
  },
  "labels": {
    "conversion_outcome": "closed_won",
    "time_to_conversion": "14_days"
  }
}
```

#### Company Quality Examples
```json
{
  "input_data": {
    "company_name": "TechCorp UAE",
    "domain": "techcorp.ae",
    "industry": "Technology",
    "employee_count": 150,
    "license_type": "Free Zone",
    "revenue_estimate": "high"
  },
  "expected_output": {
    "quality_rating": "A",
    "icp_match": 0.92,
    "reasoning": "Strong ICP fit: tech sector, mid-size, UAE presence"
  },
  "labels": {
    "verified": true,
    "outcome": "became_customer"
  }
}
```

### 3. Quality Scoring System

Quality scores (0-100) based on:

1. **Completeness** (30 points)
   - All required fields present
   - No missing critical data

2. **Correctness** (40 points)
   - Labels verified by human experts
   - Matches expected outcomes
   - Consistent with similar examples

3. **Clarity** (15 points)
   - Clear decision boundaries
   - Unambiguous labels
   - Well-documented edge cases

4. **Representativeness** (15 points)
   - Diverse examples covering different scenarios
   - Balanced class distribution
   - Edge cases included

**Thresholds:**
- Gold (90-100): Highest quality, suitable for validation sets
- Silver (75-89): High quality, suitable for training
- Bronze (60-74): Acceptable quality, needs review
- Below 60: Rejected, needs improvement

### 4. Versioning System (Git-like)

**Concepts:**
- **Commit**: Snapshot of dataset at a point in time
- **Branch**: Separate line of dataset development (not implemented in v1)
- **Tag**: Named version (e.g., "v1.0", "production-2025-01")
- **Diff**: Changes between commits

**Operations:**
- `commit`: Save current state with message
- `checkout`: Load specific version
- `diff`: Compare two versions
- `log`: View commit history
- `tag`: Create named version

**Commit Hash**: SHA-256 hash of:
- Parent commit hash
- Timestamp
- Examples added/removed/modified
- Author
- Message

### 5. Export Formats

Support multiple formats for different ML frameworks:

1. **JSONL** (JSON Lines)
   ```jsonl
   {"input": {...}, "output": {...}, "metadata": {...}}
   {"input": {...}, "output": {...}, "metadata": {...}}
   ```

2. **CSV** (Flattened)
   ```csv
   example_id,type,input_json,output_json,quality_score,labels
   ```

3. **Parquet** (Efficient columnar)
   - Optimized for big data processing
   - Supports nested structures

4. **TFRecord** (TensorFlow)
   - Native TensorFlow format
   - Efficient training data loading

5. **HuggingFace Dataset**
   - Compatible with Transformers library
   - Easy integration with popular models

### 6. Analytics & Metrics

**Dataset-level metrics:**
- Total examples count
- Examples by type/label
- Quality score distribution
- Class balance metrics
- Coverage analysis
- Growth over time

**Example-level metrics:**
- Quality score
- Validation status
- Label agreement (inter-rater reliability)
- Difficulty score
- Model performance on example

**Labeler metrics:**
- Examples labeled per session
- Average labeling time
- Label quality (agreement with gold standard)
- Productivity trends

## API Design

### Training Data Pipeline

```javascript
// Extract examples from production decisions
const pipeline = new TrainingDataPipeline({
  sourceType: 'agent_decisions',
  filters: {
    outcomePositive: true,
    confidence: { min: 0.8 }
  },
  qualityThreshold: 75
});

const examples = await pipeline.extract();
```

### Dataset Management

```javascript
// Create new dataset version
const dataset = await DatasetManager.create({
  name: 'contact-tier-v2',
  description: 'Enhanced contact tier training data',
  parentVersion: 'contact-tier-v1'
});

// Add examples
await dataset.addExamples(examples);

// Validate and score
await dataset.validate();

// Commit changes
await dataset.commit({
  message: 'Added 500 new validated examples',
  author: 'admin'
});
```

### Export

```javascript
// Export in multiple formats
await dataset.export({
  format: 'jsonl',
  outputPath: '/exports/contact-tier-v2.jsonl',
  split: { train: 0.8, val: 0.1, test: 0.1 }
});
```

### Labeling Tool

```javascript
// Start labeling session
const session = await LabelingSession.start({
  labelerId: 'admin@example.com',
  sessionType: 'validation'
});

// Get next unlabeled example
const example = await session.getNextExample({
  exampleType: 'contact_tier',
  validationStatus: 'pending'
});

// Submit label
await session.submitLabel({
  exampleId: example.id,
  labelValue: { tier: 'A', confidence: 0.95 },
  notes: 'Clear executive-level contact'
});
```

## Implementation Phases

### Phase 1: Foundation (Tasks 1, 5)
- Design schema ✓
- Build training data pipeline
- Create dataset manager

**Checkpoint 1**: Validate schema and pipeline functionality

### Phase 2: Extraction & Quality (Tasks 3, 4, 8)
- Extract production examples
- Implement quality scoring
- Add validation workflows

**Checkpoint 2**: Validate extraction and quality metrics

### Phase 3: Versioning & Export (Tasks 2, 7)
- Build export tools (multiple formats)
- Implement Git-like versioning
- Create diff and history views

**Checkpoint 3**: Validate export and versioning

### Phase 4: Analytics & Labeling (Tasks 6, 10)
- Build analytics dashboard
- Create labeling admin tool
- Add metrics tracking

**Checkpoint 4**: Validate analytics and labeling UI

### Phase 5: Documentation (Task 9)
- Document API
- Create usage guide
- Add examples

### Phase 6: QC & Deployment
- Run full QC certification
- Git commit
- Notion sync

## Success Metrics

1. **Dataset Quality**: 80%+ examples rated Silver or Gold
2. **Coverage**: Examples for all major decision types
3. **Versioning**: Full commit history with rollback capability
4. **Export**: Support 3+ ML framework formats
5. **Labeling**: Admin tool with <5min per example labeling time
6. **Analytics**: Real-time quality metrics dashboard

## Future Enhancements

- Automated quality scoring using ML
- Active learning: Suggest most valuable examples to label
- Collaborative labeling with inter-rater reliability
- Dataset branching for experimental versions
- Integration with model training pipelines
- A/B testing different dataset versions
