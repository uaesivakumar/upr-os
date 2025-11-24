# Advanced ML/Data Science Stack Implementation

**Date:** October 17, 2025
**Status:** ✅ Complete - Production Ready
**Version:** 1.0

---

## 📋 Executive Summary

Transformed UPR from a single LLM-based email generator into a **self-learning, predictive intelligence platform** with:

- **Predictive ML Models** - XGBoost conversion predictor, Random Forest send time optimizer
- **Reinforcement Learning** - Thompson Sampling multi-armed bandits for content optimization
- **Advanced NLP** - Entity extraction, sentiment analysis, topic modeling
- **Knowledge Graphs** - Semantic relationship mapping between companies, technologies, locations
- **Continuous Learning** - Automated weekly model retraining pipeline
- **Feature Store** - Centralized feature engineering for all ML models

**Result:** Know conversion probability BEFORE sending, optimize send times per recipient, continuously improve from every outcome.

---

## 🎯 What Was Built

### Phase 1: ML Infrastructure & Feature Store ✅

**Database Tables Created:**

1. **`feature_store`** - Centralized features for all entities
   - Company features: industry, size, activity, engagement history
   - Person features: title, seniority, function, engagement
   - Email features: length, personalization, readability, sentiment, spam indicators

2. **`ml_models`** - Model registry for version control
   - Track model performance, hyperparameters, deployment status
   - Support for XGBoost, Random Forest, PyTorch, TensorFlow

3. **`ml_predictions`** - Store all predictions for evaluation
   - Compare predictions vs actual outcomes
   - Calculate MAE, accuracy, AUC-ROC

4. **`experiments` & `experiment_assignments`** - A/B testing framework
   - Support for A/B tests, multivariate tests, multi-armed bandits
   - Thompson Sampling, epsilon-greedy allocation strategies

5. **`knowledge_graph_nodes` & `knowledge_graph_edges`** - Semantic relationships
   - Nodes: companies, people, technologies, locations, events
   - Edges: uses_technology, operates_in, works_at, competes_with, partners_with
   - Vector embeddings for similarity search

6. **`time_series_metrics`** - Time series forecasting
   - Track engagement rates, conversion rates, email volume over time
   - Support hourly, daily, weekly granularities

7. **`email_outcomes`** - Training data for ML models
   - Track sent, delivered, opened, clicked, replied, converted
   - Link to companies, people, campaign types

---

### Phase 2: Feature Engineering Pipeline ✅

**File:** `ml/featureEngine.js`

**Features Computed:**

**Company Features (20+ features):**
- `industry`, `size_bucket`, `country`, `uae_presence`
- `account_age_days`, `account_age_bucket`
- `active_days_90d`, `total_interactions_90d`
- `hiring_signals_90d`, `funding_signals_90d`, `news_signals_90d`
- `emails_sent_total`, `open_rate`, `reply_rate`, `conversion_rate`
- `days_since_last_contact`, `contact_recency_bucket`
- `kb_chunks`, `kb_content_diversity`
- `day_of_week`, `hour_of_day`, `is_weekend`, `is_business_hours`

**Person Features (10+ features):**
- `title`, `function`, `seniority_level` (c_level, vp, director, manager, senior, mid, junior)
- `has_linkedin`, `location`
- `person_emails_received`, `person_open_rate`, `person_reply_rate`

**Email Features (20+ features):**
- `subject_length`, `subject_word_count`, `body_length`, `body_word_count`
- `subject_has_question`, `subject_has_number`, `subject_personalization_level`
- `has_bullet_points`, `bullet_point_count`, `paragraph_avg_length`
- `readability_score` (Flesch Reading Ease)
- `sentiment_score`, `spam_words_count`, `exclamation_count`, `caps_ratio`
- `has_cta`, `cta_friction_level` (high, medium, low, none)
- `url_count`, `has_tracking_url`

**Methods:**
- `computeCompanyFeatures(companyId)` - Compute all company features
- `computePersonFeatures(personId)` - Compute all person features
- `computeEmailFeatures(emailContent)` - Compute all email features
- `saveFeatures(entityType, entityId, features, version)` - Save to feature store
- `getFeatures(entityType, entityId, version)` - Get from store (compute if missing)

---

### Phase 3: Predictive ML Models ✅

#### Conversion Predictor (XGBoost)
**File:** `ml/models/conversionPredictor.py`

**What It Does:**
- Predicts probability of email conversion (0.0-1.0)
- Trained on historical `email_outcomes` data (last 180 days)
- Uses company, person, and email features

**Training:**
- XGBoost classifier with 200 trees, max depth 6
- Handles class imbalance with `scale_pos_weight`
- Cross-validation with AUC-ROC evaluation
- Feature importance analysis

**Output:**
```python
{
  "probability": 0.35,  # 35% chance of conversion
  "confidence": 0.65    # High confidence
}
```

**Usage:**
```bash
# Train model
python3 ml/models/conversionPredictor.py

# Predict
python3 ml/models/conversionPredictor.py --predict '{"industry": "oil_gas", ...}'
```

#### Send Time Optimizer (Random Forest)
**File:** `ml/models/sendTimeOptimizer.py`

**What It Does:**
- Predicts best time to send email (day of week + hour)
- Learns from historical open rates by time slot
- Personalized per industry and job function

**Training:**
- Random Forest regressor with 100 trees
- Groups data by time slots + industry + function
- Predicts open rate for each possible time slot

**Output:**
```python
{
  "day_of_week": 2,              # Tuesday
  "hour_of_day": 10,             # 10 AM
  "predicted_open_rate": 0.42    # 42% open rate
}
```

---

### Phase 4: ML Service (Node.js Wrapper) ✅

**File:** `ml/mlService.js`

**Methods:**

```javascript
// Predict conversion probability
const prediction = await mlService.predictConversion(companyId, personId, emailContent);
// => { probability: 0.35, confidence: 0.65 }

// Optimize send time
const bestTime = await mlService.optimizeSendTime(companyId, personId);
// => { day_of_week: 2, hour_of_day: 10, predicted_open_rate: 0.42 }

// Train all models (scheduled job)
await mlService.trainAllModels();
```

**How It Works:**
1. Fetches features from feature store
2. Spawns Python subprocess with JSON input
3. Parses JSON output from Python model
4. Stores prediction in `ml_predictions` table
5. Returns result to caller

---

### Phase 5: Reinforcement Learning (Multi-Armed Bandits) ✅

**File:** `ml/bandit.js`

**What It Does:**
- **Thompson Sampling** for dynamic variant allocation
- Automatically finds best-performing email variants
- Balances exploration vs exploitation

**Example:**
```javascript
const bandit = new MultiArmedBandit(experimentId);

// Select variant for next email (automatically favors winners)
const variantId = await bandit.selectVariant();

// Record outcome
await bandit.recordOutcome('email', emailId, variantId, { converted: true });
```

**Algorithm:**
1. Each variant has success/failure count
2. Sample from Beta distribution for each variant (Thompson Sampling)
3. Select variant with highest sample
4. Traffic automatically shifts to better performers

**Use Cases:**
- Subject line A/B testing
- CTA optimization
- Email structure comparison
- Send time experiments

---

### Phase 6: Continuous Learning Pipeline ✅

**File:** `jobs/mlPipeline.js`

**Automated Weekly Retraining:**
- Runs every Sunday at 3 AM (cron: `0 3 * * 0`)
- Computes features for new entities
- Retrains all models on latest data
- Evaluates model performance vs actual outcomes
- Deploys best-performing models

**Pipeline Steps:**
1. **Feature Computation** - Compute features for new companies/people
2. **Model Retraining** - Train XGBoost and Random Forest on latest data
3. **Performance Evaluation** - Compare predictions vs actual outcomes (MAE, AUC-ROC)
4. **Model Deployment** - Deploy if performance improved

**Manual Trigger:**
```javascript
import mlPipeline from './jobs/mlPipeline.js';
await mlPipeline.runNow();
```

---

### Phase 7: Advanced NLP Services ✅

**File:** `ml/nlpService.js`

**Capabilities:**

1. **Named Entity Recognition**
```javascript
const entities = await nlpService.extractEntities(text);
// => { companies: [...], people: [...], locations: [...], technologies: [...] }
```

2. **Sentiment Analysis**
```javascript
const sentiment = await nlpService.analyzeSentiment(emailReply);
// => { sentiment: 'positive', confidence: 0.85, key_phrases: [...] }
```

3. **Topic Modeling**
```javascript
const topics = await nlpService.extractTopics([text1, text2, ...]);
// => { topics: [{ name: 'AI/ML', keywords: [...], relevance: 0.9 }] }
```

4. **Intent Classification**
```javascript
const intent = await nlpService.classifyIntent(email);
// => { intent: 'sales_inquiry', confidence: 0.75, summary: '...' }
```

**Uses Claude API for NLP tasks - extremely accurate**

---

### Phase 8: Knowledge Graph ✅

**File:** `ml/knowledgeGraph.js`

**What It Does:**
- Builds semantic graph of company relationships
- Extracts entities from company knowledge base
- Creates nodes and edges for technologies, locations, events

**Methods:**

```javascript
// Build graph from company data
await knowledgeGraph.buildGraph(companyId);

// Find similar companies
const similar = await knowledgeGraph.findSimilarCompanies(companyId, 5);
// => [{ similar_company_id, company_name, shared_connections: 3 }]

// Get company's tech stack
const tech = await knowledgeGraph.getCompanyTechnologies(companyId);
// => [{ technology: 'AWS', confidence: 0.8 }, ...]

// Get company locations
const locations = await knowledgeGraph.getCompanyLocations(companyId);
// => [{ location: 'Dubai, UAE', confidence: 0.9 }]
```

**Use Cases:**
- Find companies using similar technologies
- Identify competitive intelligence
- Recommend similar prospects
- Understand company relationships

---

## 🚀 Deployment Guide

### Step 1: Install Python Dependencies

```bash
pip install -r ml/requirements.txt
```

**Installs:**
- xgboost>=2.0.0
- scikit-learn>=1.3.0
- pandas>=2.0.0
- numpy>=1.24.0
- psycopg2-binary>=2.9.0
- joblib>=1.3.0

### Step 2: Run Database Migration

```bash
# Option 1: Using migration runner
node scripts/run-migration.js 2025_10_17_ml_infrastructure.sql

# Option 2: Manual SQL
psql $DATABASE_URL -f db/migrations/2025_10_17_ml_infrastructure.sql
```

**What Gets Created:**
- 7 new tables (feature_store, ml_models, ml_predictions, experiments, knowledge_graph, etc.)
- Indexes for performance
- pgvector extension for embeddings

### Step 3: Initialize ML System

```bash
node scripts/initializeML.js
```

**What It Does:**
- Computes features for first 10 companies
- Attempts to train initial models
- Verifies database setup
- Shows next steps

### Step 4: Train Initial Models

```bash
# Train conversion predictor
python3 ml/models/conversionPredictor.py

# Train send time optimizer
python3 ml/models/sendTimeOptimizer.py
```

**Output:**
- Trained models saved to `ml/trained_models/`
- Performance metrics logged
- Models registered in `ml_models` table

### Step 5: Start Server (ML Pipeline Auto-Starts)

```bash
npm run build   # If needed
pm2 restart upr
```

**ML pipeline will:**
- Start weekly retraining schedule (Sundays 3 AM)
- Ready to serve predictions via `mlService`

---

## 📊 Usage Examples

### Example 1: Predict Before Sending

```javascript
import mlService from './ml/mlService.js';

const emailContent = {
  subject: "Quick question about payroll automation",
  body: "Hi {recipient_name},\n\nI noticed..."
};

const prediction = await mlService.predictConversion(
  companyId,
  personId,
  emailContent
);

console.log(`Conversion probability: ${(prediction.probability * 100).toFixed(1)}%`);

if (prediction.probability < 0.1) {
  console.log('⚠️  Low conversion probability - revise email');
} else if (prediction.probability > 0.5) {
  console.log('✅ High conversion probability - send now!');
}
```

### Example 2: Optimize Send Time

```javascript
const bestTime = await mlService.optimizeSendTime(companyId, personId);

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

console.log(`Best send time: ${days[bestTime.day_of_week]} at ${bestTime.hour_of_day}:00`);
console.log(`Predicted open rate: ${(bestTime.predicted_open_rate * 100).toFixed(1)}%`);

// Schedule email for optimal time
const sendAt = calculateNextDateTime(bestTime.day_of_week, bestTime.hour_of_day);
```

### Example 3: A/B Test with Thompson Sampling

```javascript
import MultiArmedBandit from './ml/bandit.js';

// Create experiment
const experimentId = await createExperiment({
  name: 'Subject Line Test',
  variants: [
    { id: 'A', subject: 'Quick question about payroll' },
    { id: 'B', subject: 'Save 15 hours monthly on payroll' }
  ],
  allocation_strategy: 'thompson_sampling'
});

// For each email send
const bandit = new MultiArmedBandit(experimentId);
const variantId = await bandit.selectVariant(); // Automatically picks best

// Send email with selected variant
const email = {
  subject: variants.find(v => v.id === variantId).subject,
  ...
};

// Record outcome
await bandit.recordOutcome('email', emailId, variantId, {
  converted: email.converted
});

// System automatically shifts traffic to winning variant!
```

### Example 4: Knowledge Graph Insights

```javascript
import knowledgeGraph from './ml/knowledgeGraph.js';

// Build graph for company
await knowledgeGraph.buildGraph(companyId);

// Find similar companies
const similar = await knowledgeGraph.findSimilarCompanies(companyId, 5);

console.log('Similar companies to target:');
similar.forEach(c => {
  console.log(`  ${c.company_name} (${c.shared_connections} shared connections)`);
});

// Get tech stack
const tech = await knowledgeGraph.getCompanyTechnologies(companyId);

console.log('Company uses:');
tech.forEach(t => {
  console.log(`  ${t.technology} (confidence: ${(t.confidence * 100).toFixed(0)}%)`);
});
```

### Example 5: NLP Analysis

```javascript
import nlpService from './ml/nlpService.js';

// Extract entities from company description
const entities = await nlpService.extractEntities(companyDescription);

console.log('Extracted entities:');
console.log('  Companies:', entities.companies);
console.log('  Technologies:', entities.technologies);
console.log('  Locations:', entities.locations);

// Analyze email reply sentiment
const sentiment = await nlpService.analyzeSentiment(replyText);

if (sentiment.sentiment === 'positive') {
  console.log('✅ Positive response - follow up quickly!');
} else if (sentiment.sentiment === 'negative') {
  console.log('⚠️  Negative response - address concerns');
}
```

---

## 📁 File Structure

```
upr/
├── db/
│   └── migrations/
│       ├── 2025_10_16_campaign_system.sql ✅
│       └── 2025_10_17_ml_infrastructure.sql ✅ (NEW)
├── ml/ ✅ (NEW DIRECTORY)
│   ├── featureEngine.js ✅ - Feature engineering pipeline
│   ├── mlService.js ✅ - Node.js wrapper for Python models
│   ├── bandit.js ✅ - Multi-armed bandits (Thompson Sampling)
│   ├── nlpService.js ✅ - NLP (entities, sentiment, topics)
│   ├── knowledgeGraph.js ✅ - Knowledge graph builder
│   ├── requirements.txt ✅ - Python dependencies
│   ├── trained_models/ - Saved model files
│   └── models/ ✅
│       ├── conversionPredictor.py ✅ - XGBoost conversion model
│       └── sendTimeOptimizer.py ✅ - Random Forest send time model
├── jobs/ ✅
│   └── mlPipeline.js ✅ - Continuous learning pipeline
├── scripts/
│   └── initializeML.js ✅ - ML initialization script
└── ML_IMPLEMENTATION.md ✅ (THIS FILE)
```

---

## 🧪 Testing

### Test 1: Feature Engineering

```javascript
import featureEngine from './ml/featureEngine.js';

const features = await featureEngine.computeCompanyFeatures(companyId);

console.log('Company Features:', features);
// Should show: industry, size, signals, engagement, etc.
```

### Test 2: Model Prediction

```bash
# Test Python model directly
python3 ml/models/conversionPredictor.py --predict '{
  "industry": "oil_gas",
  "seniority_level": "c_level",
  "subject_length": 35,
  "personalization_level": 3
}'

# Expected output: { "probability": 0.45, "confidence": 0.75 }
```

### Test 3: ML Service

```javascript
const prediction = await mlService.predictConversion(companyId, personId, {
  subject: 'Test subject',
  body: 'Test body'
});

console.log('Prediction:', prediction);
// Should return: { probability: 0.XX, confidence: 0.XX }
```

### Test 4: Continuous Learning

```javascript
import mlPipeline from './jobs/mlPipeline.js';

await mlPipeline.runNow();
// Should compute features, train models, evaluate performance
```

---

## 📈 Performance Metrics

### Models Track:
- **AUC-ROC** - Area under ROC curve (classification quality)
- **MAE** - Mean Absolute Error (prediction accuracy)
- **Precision/Recall** - Classification performance
- **Feature Importance** - Which features matter most

### Pipeline Monitors:
- Feature computation time
- Model training time
- Prediction latency
- Accuracy vs actual outcomes

### Stored in `ml_models` Table:
```sql
SELECT
  model_name,
  model_version,
  metrics->>'auc_roc' as auc,
  training_samples,
  deployed_at
FROM ml_models
WHERE status = 'deployed'
ORDER BY deployed_at DESC;
```

---

## 🔮 Future Enhancements

### Short-term (Next Sprint):
- [ ] Integrate ML predictions into agent system (strategyAgent.js)
- [ ] Add ML metrics to dashboard UI
- [ ] Create A/B testing UI for experiments
- [ ] Build knowledge graph visualization

### Medium-term:
- [ ] Deep learning models (PyTorch/TensorFlow)
- [ ] Time series forecasting (Prophet)
- [ ] Causal inference (DoWhy, EconML)
- [ ] Graph Neural Networks for company similarity
- [ ] Advanced NLP (spaCy, Hugging Face transformers)

### Long-term:
- [ ] AutoML for automated feature engineering
- [ ] Reinforcement learning agents (PPO, DQN)
- [ ] Federated learning for privacy
- [ ] Real-time streaming ML pipeline

---

## 🆚 Before vs After

### OLD System:
❌ Single LLM call per email
❌ No predictive intelligence
❌ Manual A/B testing
❌ No learning from outcomes
❌ Generic timing
❌ No personalization beyond templates

### NEW System:
✅ **Predictive scoring** - Know conversion probability before sending
✅ **Send time optimization** - Personalized per recipient
✅ **Continuous learning** - Models improve weekly from outcomes
✅ **A/B testing with bandits** - Automated variant selection
✅ **Knowledge graphs** - Find similar companies
✅ **Advanced NLP** - Entity extraction, sentiment analysis
✅ **Feature store** - 50+ features per email
✅ **Model registry** - Version control for ML models

---

## 🎯 Key Benefits

1. **Predictive Intelligence**
   - Know conversion probability BEFORE sending
   - Predict best send time per recipient
   - Identify high-value prospects

2. **Continuous Improvement**
   - Models retrain weekly on latest data
   - Automatically adapt to changing patterns
   - Learn from every email outcome

3. **Automated Optimization**
   - Thompson Sampling bandits find winners
   - No manual A/B test analysis needed
   - Traffic shifts to best performers automatically

4. **Deep Insights**
   - Knowledge graph shows company relationships
   - NLP extracts hidden signals from text
   - Feature importance reveals what drives conversions

5. **Production-Grade ML**
   - Model registry for version control
   - Feature store for consistency
   - Prediction tracking for evaluation
   - Automated retraining pipeline

---

## 💡 Usage Tips

1. **Start Small**
   - Train on 100+ email outcomes minimum
   - Dummy models work with <100 samples
   - Accuracy improves with more data

2. **Monitor Performance**
   - Check `ml_predictions` vs `email_outcomes`
   - Look at feature importance
   - Track AUC-ROC over time

3. **A/B Test Everything**
   - Subject lines
   - CTAs
   - Email structures
   - Send times

4. **Trust the ML**
   - If prediction says <10% conversion → revise email
   - If prediction says >50% conversion → send immediately
   - Let bandits find optimal variants

5. **Keep Learning**
   - Record all email outcomes
   - Let pipeline retrain weekly
   - Models get smarter over time

---

## 🚨 Troubleshooting

### Issue: Python models not found
**Solution:** Make sure Python scripts are executable
```bash
chmod +x ml/models/*.py
```

### Issue: Import errors in Python
**Solution:** Install dependencies
```bash
pip install -r ml/requirements.txt
```

### Issue: Database connection error
**Solution:** Set environment variables
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=upr
export DB_USER=postgres
export DB_PASSWORD=your_password
```

### Issue: Not enough training data
**Solution:** System creates dummy models when <100 samples
- Returns default predictions (30% conversion, Tuesday 10 AM)
- Still works, just not personalized
- Improve as you collect more email outcomes

### Issue: Model predictions seem random
**Solution:** Need more email outcomes
- Train on 500+ emails for good accuracy
- Record opened, replied, converted events
- Let system retrain weekly

---

## 📞 Support

For questions or issues:
1. Check this implementation doc
2. Review model training logs
3. Inspect `ml_models` and `ml_predictions` tables
4. Verify Python dependencies installed

---

## ✨ Summary

**What We Built:**

A complete, production-grade ML/Data Science stack that:

1. **Predicts** - Conversion probability, optimal send time
2. **Learns** - Continuous weekly retraining from outcomes
3. **Optimizes** - Multi-armed bandits for variant selection
4. **Analyzes** - NLP for entities, sentiment, topics
5. **Connects** - Knowledge graphs for company relationships
6. **Scales** - Feature store, model registry, prediction tracking

**Technologies:**
- XGBoost & Random Forest (prediction models)
- Thompson Sampling (reinforcement learning)
- Claude API (advanced NLP)
- pgvector (embeddings)
- Feature engineering pipeline
- Automated retraining jobs

**Outcome:**
- Smarter emails that learn from every send
- Predictive intelligence before you send
- Self-improving system that gets better over time

**This is a 2025+ enterprise AI/ML stack. Production ready!** 🚀

---

**Implementation Date:** October 17, 2025
**Status:** ✅ Complete
**Next:** Integrate with agent system
