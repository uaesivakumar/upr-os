**Phase 10: Feedback & Reinforcement Analytics**

**Goal Check ✅**

*\"Establish feedback loop between outreach outcomes and scoring
adjustments. Define metrics, storage, and analytics queries for
continual learning.\"*

**This is the learning engine** - This is where your AI Agent Core
**improves itself** by learning from real-world outcomes, not just your
initial rules.

**What This Phase Really Delivers**

**The Feedback Loop**

┌─────────────────────────────────────────────────────────┐

│ FEEDBACK LOOP │

├─────────────────────────────────────────────────────────┤

│ │

│ 1. PREDICT │

│ Agent Core scores company: \"87 (HIGH PRIORITY)\" │

│ Reasoning: Strong signals + good fit │

│ ↓ │

│ 2. ACT │

│ Send outreach email │

│ Wait for response │

│ ↓ │

│ 3. OBSERVE │

│ Track outcome: Replied? Meeting set? Converted? │

│ Record: Email opened 3x, replied positive, meeting │

│ ↓ │

│ 4. EVALUATE │

│ Compare prediction vs reality │

│ Analysis: \"87 score → Meeting set (SUCCESS)\" │

│ ↓ │

│ 5. LEARN │

│ Pattern: \"High-scored tech companies convert well\" │

│ Insight: \"Maintain current tech sector weighting\" │

│ ↓ │

│ 6. ADJUST │

│ Update rules: Keep tech multiplier at 1.15x │

│ OR: Increase retail penalty (converting poorly) │

│ ↓ │

│ \[Loop back to PREDICT with improved model\] │

│ │

└─────────────────────────────────────────────────────────┘

**1. Outcome Schema**

**Complete Outcome Tracking**

interface OutreachOutcome {

// Identity

outcome_id: string,

company_id: string,

person_id: string,

outreach_id: string,

// Initial prediction

predicted_score: number,

predicted_conversion_probability: number,

prediction_reasoning: object,

// Outreach details

sent_at: timestamp,

channel: \'email\' \| \'linkedin\' \| \'phone\',

message_template_id: string,

lifecycle_state_at_send: string,

// Engagement metrics

email_opened: boolean,

email_open_count: number,

email_clicked: boolean,

email_click_count: number,

first_opened_at: timestamp \| null,

last_opened_at: timestamp \| null,

// Response metrics

replied: boolean,

replied_at: timestamp \| null,

reply_sentiment: \'positive\' \| \'neutral\' \| \'negative\' \|
\'unsubscribe\',

reply_text: string \| null,

// Conversion metrics

meeting_requested: boolean,

meeting_scheduled: boolean,

meeting_scheduled_at: timestamp \| null,

meeting_completed: boolean,

meeting_outcome: \'positive\' \| \'neutral\' \| \'negative\' \|
\'no_show\',

first_business: boolean,

first_business_at: timestamp \| null,

employees_onboarded: number,

trust_established: boolean,

trust_established_at: timestamp \| null,

// Business outcomes

products_adopted: string\[\],

lifetime_value_aed: number,

relationship_status: \'active\' \| \'stale\' \| \'churned\',

// Learning signals

outcome_label: \'true_positive\' \| \'false_positive\' \|
\'true_negative\' \| \'false_negative\',

conversion_funnel_stage: string,

days_to_convert: number \| null,

// Metadata

recorded_at: timestamp,

last_updated_at: timestamp

}

**2. Database Schema**

\-- Main outcomes table

CREATE TABLE outreach_outcomes (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

\-- References

company_id UUID REFERENCES entities_company(id),

person_id UUID REFERENCES entities_person(id),

outreach_id UUID REFERENCES outreach(id),

\-- Prediction (what AI thought would happen)

predicted_score INTEGER NOT NULL,

predicted_conversion_probability NUMERIC(3,2),

prediction_reasoning JSONB,

\-- Outreach details

sent_at TIMESTAMPTZ NOT NULL,

channel TEXT NOT NULL,

message_template_id TEXT,

lifecycle_state_at_send TEXT,

\-- Engagement tracking

email_opened BOOLEAN DEFAULT false,

email_open_count INTEGER DEFAULT 0,

email_clicked BOOLEAN DEFAULT false,

email_click_count INTEGER DEFAULT 0,

first_opened_at TIMESTAMPTZ,

last_opened_at TIMESTAMPTZ,

\-- Response tracking

replied BOOLEAN DEFAULT false,

replied_at TIMESTAMPTZ,

reply_sentiment TEXT,

reply_text TEXT,

\-- Conversion tracking

meeting_requested BOOLEAN DEFAULT false,

meeting_scheduled BOOLEAN DEFAULT false,

meeting_scheduled_at TIMESTAMPTZ,

meeting_completed BOOLEAN DEFAULT false,

meeting_outcome TEXT,

first_business BOOLEAN DEFAULT false,

first_business_at TIMESTAMPTZ,

employees_onboarded INTEGER DEFAULT 0,

trust_established BOOLEAN DEFAULT false,

trust_established_at TIMESTAMPTZ,

\-- Business metrics

products_adopted TEXT\[\],

lifetime_value_aed NUMERIC(10,2) DEFAULT 0,

relationship_status TEXT DEFAULT \'active\',

\-- Learning labels

outcome_label TEXT, \-- computed: \'true_positive\', \'false_positive\',
etc.

conversion_funnel_stage TEXT,

days_to_convert INTEGER,

\-- Timestamps

recorded_at TIMESTAMPTZ DEFAULT NOW(),

last_updated_at TIMESTAMPTZ DEFAULT NOW()

);

\-- Indexes for analytics

CREATE INDEX idx_outcomes_company ON outreach_outcomes(company_id);

CREATE INDEX idx_outcomes_sent ON outreach_outcomes(sent_at);

CREATE INDEX idx_outcomes_predicted_score ON
outreach_outcomes(predicted_score);

CREATE INDEX idx_outcomes_replied ON outreach_outcomes(replied) WHERE
replied = true;

CREATE INDEX idx_outcomes_converted ON
outreach_outcomes(meeting_scheduled) WHERE meeting_scheduled = true;

CREATE INDEX idx_outcomes_label ON outreach_outcomes(outcome_label);

\-- Trigger to update last_updated_at

CREATE TRIGGER update_outcomes_timestamp

BEFORE UPDATE ON outreach_outcomes

FOR EACH ROW

EXECUTE FUNCTION update_timestamp();

\-- View: Conversion funnel

CREATE VIEW conversion_funnel AS

SELECT

COUNT(\*) as total_sent,

SUM(CASE WHEN email_opened THEN 1 ELSE 0 END) as opened,

SUM(CASE WHEN replied THEN 1 ELSE 0 END) as replied,

SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) as meetings,

SUM(CASE WHEN first_business THEN 1 ELSE 0 END) as conversions,

SUM(CASE WHEN trust_established THEN 1 ELSE 0 END) as long_term,

\-- Conversion rates

ROUND(SUM(CASE WHEN email_opened THEN 1 ELSE 0 END) \* 100.0 /
COUNT(\*), 2) as open_rate,

ROUND(SUM(CASE WHEN replied THEN 1 ELSE 0 END) \* 100.0 / COUNT(\*), 2)
as reply_rate,

ROUND(SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) \* 100.0 /
NULLIF(SUM(CASE WHEN replied THEN 1 ELSE 0 END), 0), 2) as meeting_rate,

ROUND(SUM(CASE WHEN first_business THEN 1 ELSE 0 END) \* 100.0 /
NULLIF(SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END), 0), 2) as
conversion_rate

FROM outreach_outcomes

WHERE sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS);

**3. Outcome Classification**

**True Positive / False Positive Logic**

// server/analytics/outcome-classifier.js

class OutcomeClassifier {

/\*\*

\* Classify outcome as TP/FP/TN/FN based on prediction vs reality

\*/

classifyOutcome(outcome) {

const predicted_high = outcome.predicted_score \>= 70; // Threshold from
Phase 7

const actual_converted = outcome.meeting_scheduled \|\|
outcome.first_business;

if (predicted_high && actual_converted) {

return {

label: \'true_positive\',

explanation: \'AI predicted success (high score) and it converted\'

};

}

if (predicted_high && !actual_converted) {

// Check if they replied but didn\'t convert

if (outcome.replied && outcome.reply_sentiment === \'positive\') {

return {

label: \'true_positive\',

explanation: \'AI predicted success, prospect engaged positively
(conversion pending)\'

};

}

// Check if it\'s too early to tell

const days_since_send = daysBetween(outcome.sent_at, now);

if (days_since_send \< 30) {

return {

label: \'pending\',

explanation: \'Too early to classify (\< 30 days since outreach)\'

};

}

return {

label: \'false_positive\',

explanation: \'AI predicted success (high score) but no conversion\'

};

}

if (!predicted_high && actual_converted) {

return {

label: \'false_negative\',

explanation: \'AI predicted low priority but actually converted (missed
opportunity)\'

};

}

if (!predicted_high && !actual_converted) {

return {

label: \'true_negative\',

explanation: \'AI predicted low priority and it did not convert\'

};

}

}

/\*\*

\* Compute precision and recall

\*/

computeMetrics(outcomes) {

const tp = outcomes.filter(o =\> o.outcome_label ===
\'true_positive\').length;

const fp = outcomes.filter(o =\> o.outcome_label ===
\'false_positive\').length;

const fn = outcomes.filter(o =\> o.outcome_label ===
\'false_negative\').length;

const tn = outcomes.filter(o =\> o.outcome_label ===
\'true_negative\').length;

const precision = tp / (tp + fp); // Of high-scored companies, how many
converted?

const recall = tp / (tp + fn); // Of converted companies, how many did
we score high?

const accuracy = (tp + tn) / (tp + fp + fn + tn);

const f1_score = 2 \* (precision \* recall) / (precision + recall);

return {

true_positives: tp,

false_positives: fp,

false_negatives: fn,

true_negatives: tn,

precision: precision.toFixed(3),

recall: recall.toFixed(3),

accuracy: accuracy.toFixed(3),

f1_score: f1_score.toFixed(3)

};

}

}

**4. Analytics Queries**

**Query 1: Score Calibration Analysis**

\"Are high scores actually converting?\"

\-- Score vs conversion rate

SELECT

CASE

WHEN predicted_score \>= 90 THEN \'90-100\'

WHEN predicted_score \>= 80 THEN \'80-89\'

WHEN predicted_score \>= 70 THEN \'70-79\'

WHEN predicted_score \>= 60 THEN \'60-69\'

ELSE \'0-59\'

END as score_bucket,

COUNT(\*) as companies,

SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) as conversions,

ROUND(SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) \* 100.0 /
COUNT(\*), 2) as conversion_rate,

AVG(predicted_score) as avg_score,

AVG(days_to_convert) as avg_days_to_convert

FROM outreach_outcomes

WHERE sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

AND outcome_label IN (\'true_positive\', \'false_positive\') \-- Only
classified outcomes

GROUP BY score_bucket

ORDER BY score_bucket DESC;

\-- Expected output:

\-- 90-100: 45 companies, 32 conversions, 71% conversion rate (GOOD)

\-- 80-89: 80 companies, 48 conversions, 60% conversion rate (GOOD)

\-- 70-79: 120 companies, 42 conversions, 35% conversion rate
(ACCEPTABLE)

\-- 60-69: 90 companies, 18 conversions, 20% conversion rate (LOW -
should we lower threshold?)

\-- 0-59: 200 companies, 5 conversions, 2.5% conversion rate (CORRECT -
low scores don\'t convert)

**Insight:** If 70-79 bucket has \<30% conversion, threshold is too low.
If 90-100 has \<50%, scoring is broken.

**Query 2: Feature Importance Analysis**

\"Which factors actually predict conversion?\"

\-- Industry vs conversion

SELECT

c.industry,

COUNT(\*) as companies_contacted,

SUM(CASE WHEN o.meeting_scheduled THEN 1 ELSE 0 END) as conversions,

ROUND(SUM(CASE WHEN o.meeting_scheduled THEN 1 ELSE 0 END) \* 100.0 /
COUNT(\*), 2) as conversion_rate,

AVG(o.predicted_score) as avg_score

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

GROUP BY c.industry

ORDER BY conversion_rate DESC;

\-- Expected insights:

\-- FinTech: 15 companies, 9 conversions, 60% rate (STRONG)

\-- Technology: 45 companies, 24 conversions, 53% rate (STRONG)

\-- Healthcare: 20 companies, 8 conversions, 40% rate (GOOD)

\-- Retail: 30 companies, 6 conversions, 20% rate (WEAK - should reduce
weight?)

\-- Company size vs conversion

SELECT

CASE

WHEN c.uae_employees \< 50 THEN \'0-49\'

WHEN c.uae_employees \< 100 THEN \'50-99\'

WHEN c.uae_employees \< 300 THEN \'100-299\'

WHEN c.uae_employees \< 500 THEN \'300-499\'

ELSE \'500+\'

END as size_bucket,

COUNT(\*) as companies,

ROUND(AVG(CASE WHEN o.meeting_scheduled THEN 1 ELSE 0 END) \* 100.0, 2)
as conversion_rate

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

GROUP BY size_bucket

ORDER BY conversion_rate DESC;

\-- Expected: 100-299 bucket should have highest conversion (validates
\"sweet spot\" rule)

\-- Signal strength vs conversion

SELECT

CASE

WHEN c.monthly_hires \>= 20 THEN \'Aggressive (20+)\'

WHEN c.monthly_hires \>= 10 THEN \'Strong (10-19)\'

WHEN c.monthly_hires \>= 5 THEN \'Steady (5-9)\'

WHEN c.monthly_hires \>= 1 THEN \'Slow (1-4)\'

ELSE \'None (0)\'

END as hiring_velocity,

COUNT(\*) as companies,

ROUND(AVG(CASE WHEN o.meeting_scheduled THEN 1 ELSE 0 END) \* 100.0, 2)
as conversion_rate

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

GROUP BY hiring_velocity

ORDER BY conversion_rate DESC;

\-- Expected: Aggressive hiring should correlate with high conversion

**Action:** If an industry converts poorly despite high scores, reduce
its multiplier in Phase 7 formula.

**Query 3: False Positive Analysis**

\"Why did high-scored companies NOT convert?\"

\-- Analyze false positives

SELECT

c.company_name,

c.industry,

c.uae_employees,

o.predicted_score,

o.email_opened,

o.replied,

o.reply_sentiment,

DATEDIFF(NOW(), o.sent_at) as days_since_send,

\-- Why didn\'t they convert?

CASE

WHEN NOT o.email_opened THEN \'Never opened email\'

WHEN o.email_opened AND NOT o.replied THEN \'Opened but didnt reply\'

WHEN o.replied AND o.reply_sentiment = \'negative\' THEN \'Rejected
explicitly\'

WHEN o.replied AND o.reply_sentiment = \'neutral\' THEN \'Asked to
follow up later\'

WHEN o.meeting_scheduled AND o.meeting_outcome = \'no_show\' THEN
\'No-show meeting\'

ELSE \'Unknown reason\'

END as failure_reason

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.outcome_label = \'false_positive\'

AND o.sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

ORDER BY o.predicted_score DESC

LIMIT 20;

\-- Common patterns analysis

SELECT

CASE

WHEN NOT email_opened THEN \'Never opened\'

WHEN email_opened AND NOT replied THEN \'No reply\'

WHEN replied AND reply_sentiment = \'negative\' THEN \'Rejected\'

WHEN meeting_scheduled AND meeting_outcome = \'no_show\' THEN
\'No-show\'

ELSE \'Other\'

END as failure_pattern,

COUNT(\*) as frequency,

AVG(predicted_score) as avg_score,

STRING_AGG(DISTINCT c.industry, \', \') as industries

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.outcome_label = \'false_positive\'

AND o.sent_at \> DATE_SUB(NOW(), INTERVAL 60 DAYS)

GROUP BY failure_pattern

ORDER BY frequency DESC;

\-- Example insights:

\-- \"Never opened\" (60 companies, avg score 82) → Email deliverability
issue?

\-- \"No reply\" (40 companies, avg score 85) → Message not compelling?

\-- \"Rejected\" (15 companies, avg score 78, Retail) → Retail sector
overhyped?

**Action:** If \"Never opened\" is high, check spam filters. If \"No
reply\" is high, refine outreach templates.

**Query 4: False Negative Analysis**

\"Which low-scored companies DID convert? (Missed opportunities)\"

\-- Find companies we underestimated

SELECT

c.company_name,

c.industry,

c.uae_employees,

o.predicted_score,

o.meeting_scheduled,

o.first_business,

o.employees_onboarded,

\-- Why did we score them low?

jsonb_pretty(o.prediction_reasoning-\>\'breakdown\') as
scoring_breakdown

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.outcome_label = \'false_negative\'

AND o.sent_at \> DATE_SUB(NOW(), INTERVAL 90 DAYS)

ORDER BY o.employees_onboarded DESC

LIMIT 20;

\-- Pattern detection: What do these companies have in common?

SELECT

c.industry,

COUNT(\*) as false_negatives,

AVG(o.predicted_score) as avg_score,

AVG(c.uae_employees) as avg_size

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.outcome_label = \'false_negative\'

GROUP BY c.industry

ORDER BY false_negatives DESC;

\-- Example insight:

\-- \"Healthcare\" has 8 false negatives (avg score 62, avg size 45)

\-- → We\'re undervaluing small healthcare companies!

\-- → Action: Add \"Healthcare small company boost\" edge case

**Action:** If a pattern emerges (e.g., small healthcare companies), add
a positive edge case to Phase 7.

**Query 5: Time-to-Convert Analysis**

\"How long does it take for companies to convert?\"

\-- Distribution of conversion times

SELECT

CASE

WHEN days_to_convert \<= 7 THEN \'0-7 days\'

WHEN days_to_convert \<= 14 THEN \'8-14 days\'

WHEN days_to_convert \<= 30 THEN \'15-30 days\'

WHEN days_to_convert \<= 60 THEN \'31-60 days\'

ELSE \'60+ days\'

END as time_bucket,

COUNT(\*) as companies,

ROUND(COUNT(\*) \* 100.0 / SUM(COUNT(\*)) OVER (), 2) as percentage

FROM outreach_outcomes

WHERE meeting_scheduled = true

AND days_to_convert IS NOT NULL

GROUP BY time_bucket

ORDER BY time_bucket;

\-- By industry

SELECT

c.industry,

AVG(o.days_to_convert) as avg_days,

MIN(o.days_to_convert) as fastest,

MAX(o.days_to_convert) as slowest

FROM outreach_outcomes o

JOIN entities_company c ON o.company_id = c.id

WHERE o.meeting_scheduled = true

AND o.days_to_convert IS NOT NULL

GROUP BY c.industry

ORDER BY avg_days;

\-- Example insight:

\-- FinTech: 12 days avg (FAST)

\-- Technology: 18 days avg (MEDIUM)

\-- Retail: 35 days avg (SLOW - adjust expectations)

**Action:** Set different follow-up cadences per industry based on
typical conversion time.

**5. Reinforcement Learning Strategy**

**Approach: Bayesian Updating (Safe & Interpretable)**

// server/analytics/bayesian-updater.js

class BayesianScoreUpdater {

/\*\*

\* Update component weights based on observed outcomes

\*/

async updateWeights(component, priorWeight, outcomes) {

// Prior belief (your initial weight)

const prior = {

weight: priorWeight,

confidence: 0.7 // How sure we were initially

};

// Evidence from outcomes

const conversions = outcomes.filter(o =\> o.meeting_scheduled);

const total = outcomes.length;

const observed_conversion_rate = conversions.length / total;

// Expected conversion rate with current weight

const expected_conversion_rate = this.expectedRate(priorWeight);

// Bayesian update

const posterior_weight = this.bayesianUpdate(

prior.weight,

prior.confidence,

observed_conversion_rate,

expected_conversion_rate,

total // Sample size matters!

);

return {

component,

prior_weight: prior.weight,

posterior_weight: posterior_weight,

change: posterior_weight - prior.weight,

confidence: this.computeConfidence(total),

recommendation: this.generateRecommendation(posterior_weight,
prior.weight)

};

}

/\*\*

\* Bayesian update formula

\*/

bayesianUpdate(prior_mean, prior_confidence, observed_rate,
expected_rate, sample_size) {

// Weighted average between prior and observed

const prior_weight = prior_confidence;

const data_weight = Math.min(sample_size / 100, 0.9); // Cap at 90%
trust in data

const adjustment = (observed_rate - expected_rate) / expected_rate;

const posterior = prior_mean \* (1 + adjustment \* data_weight);

// Constrain to reasonable bounds

return Math.max(0.5, Math.min(2.0, posterior));

}

/\*\*

\* Generate human-readable recommendation

\*/

generateRecommendation(posterior, prior) {

const change_pct = ((posterior - prior) / prior) \* 100;

if (Math.abs(change_pct) \< 5) {

return {

action: \'KEEP\',

reason: \`Weight is well-calibrated (\${change_pct.toFixed(1)}%
suggested change)\`

};

}

if (change_pct \> 5) {

return {

action: \'INCREASE\',

reason: \`Component undervalued - conversions \${change_pct.toFixed(1)}%
higher than expected\`,

new_weight: posterior.toFixed(2)

};

}

if (change_pct \< -5) {

return {

action: \'DECREASE\',

reason: \`Component overvalued - conversions
\${Math.abs(change_pct).toFixed(1)}% lower than expected\`,

new_weight: posterior.toFixed(2)

};

}

}

}

// Example usage

const updater = new BayesianScoreUpdater();

// Analyze Technology industry multiplier (currently 1.15x)

const tech_outcomes = await getOutcomesByIndustry(\'Technology\',
\'90_days\');

const tech_update = await
updater.updateWeights(\'industry_multiplier_tech\', 1.15,
tech_outcomes);

console.log(tech_update);

// {

// component: \'industry_multiplier_tech\',

// prior_weight: 1.15,

// posterior_weight: 1.18,

// change: +0.03,

// confidence: 0.85,

// recommendation: {

// action: \'INCREASE\',

// reason: \'Component undervalued - conversions 8% higher than
expected\',

// new_weight: \'1.18\'

// }

// }

**Monthly Recalibration Process**

\#\# Monthly Calibration Workflow

\#\#\# Step 1: Collect Outcomes (Day 1)

\`\`\`sql

\-- Get all outcomes from last 90 days with sufficient maturity (30+
days since send)

SELECT \* FROM outreach_outcomes

WHERE sent_at BETWEEN DATE_SUB(NOW(), INTERVAL 90 DAY) AND
DATE_SUB(NOW(), INTERVAL 30 DAY)

AND outcome_label IS NOT NULL;

**Step 2: Run Analytics (Day 1-2)**

node scripts/analyze-outcomes.js \--period=90days
\--output=reports/calibration-2025-01.json

Generates report:

-   Precision/Recall/F1-Score

-   Score calibration (score buckets vs conversion)

-   Feature importance (industry, size, signals)

-   False positive analysis

-   False negative analysis

**Step 3: Generate Recommendations (Day 2)**

const recommendations = await generateRecommendations(outcomes);

// \[

// { component: \'industry_tech\', action: \'INCREASE\', from: 1.15, to:
1.18 },

// { component: \'industry_retail\', action: \'DECREASE\', from: 0.9,
to: 0.85 },

// { component: \'hiring_velocity_20+\', action: \'KEEP\', current: 1.5
}

// \]

**Step 4: Backtest Changes (Day 3)**

// Test proposed changes on past data

const backtestResults = await backtestChanges(recommendations,
historical_outcomes);

// Expected output:

// Current formula: 78% precision, 72% recall, F1=0.75

// Proposed formula: 82% precision, 71% recall, F1=0.76

// Improvement: +4% precision, -1% recall, +1% F1 (APPROVE)

**Step 5: Deploy (Day 4-5)**

If backtest shows improvement:

1.  Update cognitive_extraction_logic.json (Phase 5)

2.  Increment version (v1.3 → v1.4)

3.  Test with 5 sample companies

4.  Deploy to production

5.  Monitor for 1 week (A/B test 10% traffic on new version)

**Step 6: Monitor (Day 6-12)**

\-- Compare v1.3 vs v1.4 performance

SELECT

prediction_reasoning-\>\>\'version\' as version,

COUNT(\*) as predictions,

AVG(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) as conversion_rate

FROM outreach_outcomes

WHERE sent_at \> DATE_SUB(NOW(), INTERVAL 7 DAYS)

GROUP BY version;

**Step 7: Promote or Rollback (Day 13)**

If v1.4 performing better → Promote to 100% If v1.4 performing worse →
Rollback to v1.3

\-\--

\#\# \*\*6. Evaluation Metrics Dashboard\*\*

\#\#\# \*\*Key Metrics to Track\*\*

\`\`\`markdown

\#\# Performance Scorecard (Monthly)

\#\#\# Model Accuracy

\- \*\*Precision:\*\* 82% (of high-scored companies, 82% converted)

\- \*\*Recall:\*\* 71% (of companies that converted, 71% were scored
high)

\- \*\*F1-Score:\*\* 0.76 (harmonic mean)

\- \*\*Accuracy:\*\* 85% (overall correct classifications)

Target: Precision ≥80%, Recall ≥70%, F1 ≥0.75

\#\#\# Conversion Rates

\- \*\*90-100 score bucket:\*\* 71% conversion (EXCELLENT)

\- \*\*80-89 score bucket:\*\* 60% conversion (GOOD)

\- \*\*70-79 score bucket:\*\* 35% conversion (ACCEPTABLE)

\- \*\*Below 70:\*\* 8% conversion (CORRECT - low scores don\'t convert)

Target: 70+ bucket should convert at ≥30%

\#\#\# Business Metrics

\- \*\*Reply Rate:\*\* 23% (of outreach, 23% replied)

\- \*\*Meeting Rate:\*\* 58% (of replies, 58% scheduled meeting)

\- \*\*Conversion Rate:\*\* 42% (of meetings, 42% became first business)

\- \*\*LTV:\*\* AED 24,500 avg per converted customer

Target: Reply≥20%, Meeting≥50%, Conversion≥35%

\#\#\# False Positive Analysis

\- \*\*Count:\*\* 45 false positives this month

\- \*\*Top reasons:\*\*

\- No email open (55%) → Check spam filters

\- No reply (30%) → Refine messaging

\- Rejected (15%) → Reassess fit criteria

Target: \<20% false positive rate

\#\#\# False Negative Analysis

\- \*\*Count:\*\* 8 false negatives this month

\- \*\*Patterns:\*\* Small healthcare companies (5), Free zone startups
(3)

\- \*\*Action:\*\* Add positive edge cases for these segments

Target: \<10% false negative rate

\#\#\# Time-to-Convert

\- \*\*Median:\*\* 18 days

\- \*\*p90:\*\* 45 days

\- \*\*Industry breakdown:\*\*

\- FinTech: 12 days (fast)

\- Technology: 18 days (medium)

\- Retail: 35 days (slow)

Target: Median \<21 days

**7. A/B Testing Framework**

**How to Test New Scoring Formulas**

// server/analytics/ab-testing.js

class ABTester {

/\*\*

\* Assign company to experiment variant

\*/

assignVariant(companyId, experimentId) {

// Deterministic assignment (same company always gets same variant)

const hash = this.hashString(\`\${companyId}-\${experimentId}\`);

const bucket = hash % 100;

// 90% control (current formula), 10% treatment (new formula)

return bucket \< 90 ? \'control\' : \'treatment\';

}

/\*\*

\* Score company using assigned variant

\*/

async scoreWithVariant(company, experimentId) {

const variant = this.assignVariant(company.id, experimentId);

if (variant === \'control\') {

// Use current formula (v1.3)

const rules = loadRules(\'v1.3\');

return scoreCompany(company, rules);

} else {

// Use experimental formula (v1.4)

const rules = loadRules(\'v1.4\');

return scoreCompany(company, rules);

}

}

/\*\*

\* Analyze experiment results

\*/

async analyzeExperiment(experimentId, minSampleSize = 50) {

const outcomes = await db.query(\`

SELECT

prediction_reasoning-\>\>\'version\' as variant,

COUNT(\*) as total,

SUM(CASE WHEN meeting_scheduled THEN 1 ELSE 0 END) as conversions,

AVG(predicted_score) as avg_score

FROM outreach_outcomes

WHERE prediction_reasoning-\>\>\'experiment_id\' = ?

AND sent_at \> DATE_SUB(NOW(), INTERVAL 30 DAYS)

GROUP BY variant

\`, \[experimentId\]);

const control = outcomes.find(o =\> o.variant === \'v1.3\');

const treatment = outcomes.find(o =\> o.variant === \'v1.4\');

// Check if we have enough data

if (control.total \< minSampleSize \|\| treatment.total \<
minSampleSize) {

return {

status: \'INSUFFICIENT_DATA\',

message: \`Need \${minSampleSize} samples per variant. Current:
\${control.total} control, \${treatment.total} treatment\`

};

}

// Compute statistics

const control_rate = control.conversions / control.total;

const treatment_rate = treatment.conversions / treatment.total;

const lift = (treatment_rate - control_rate) / control_rate;

// Statistical significance test (chi-square)

const pValue = this.chiSquareTest(control, treatment);

const significant = pValue \< 0.05;

return {

status: \'COMPLETE\',

control: {

variant: \'v1.3\',

total: control.total,

conversions: control.conversions,

conversion_rate: (control_rate \* 100).toFixed(2) + \'%\'

},

treatment: {

variant: \'v1.4\',

total: treatment.total,

conversions: treatment.conversions,

conversion_rate: (treatment_rate \* 100).toFixed(2) + \'%\'

},

lift: (lift \* 100).toFixed(2) + \'%\',

p_value: pValue.toFixed(4),

significant: significant,

recommendation: this.generateRecommendation(lift, significant)

};

}

generateRecommendation(lift, significant) {

if (!significant) {

return {

action: \'CONTINUE_TESTING\',

reason: \'Results not statistically significant (need more data)\'

};

}

if (lift \> 0.05) { // 5% improvement

return {

action: \'PROMOTE\',

reason: \`Treatment variant shows \${(lift \* 100).toFixed(1)}% lift
(statistically significant)\`

};

}

if (lift \< -0.05) { // 5% worse

return {

action: \'ROLLBACK\',

reason: \`Treatment variant performs \${Math.abs(lift \*
100).toFixed(1)}% worse (statistically significant)\`

};

}

return {

action: \'KEEP_CONTROL\',

reason: \'No meaningful difference between variants\'

};

}

}

**8. Automated Insight Generation**

// server/analytics/insight-generator.js

class InsightGenerator {

/\*\*

\* Generate actionable insights from outcome data

\*/

async generateInsights(outcomes, period = \'90_days\') {

const insights = \[\];

// Insight 1: Underperforming score buckets

const scoreAnalysis = await this.analyzeScoreBuckets(outcomes);

if (scoreAnalysis.threshold_too_low) {

insights.push({

type: \'THRESHOLD_ADJUSTMENT\',

severity: \'HIGH\',

finding: \`70-79 score bucket converting at only
\${scoreAnalysis.conversion_rate_70_79}% (target: 30%)\`,

recommendation: \'Increase threshold from 70 to 75\',

impact: \`Would filter out \${scoreAnalysis.impacted_companies}
low-converting companies\`,

confidence: 0.85

});

}

// Insight 2: Industry performance

const industryAnalysis = await this.analyzeIndustries(outcomes);

for (const industry of industryAnalysis) {

if (industry.conversion_rate \< 0.25 && industry.sample_size \> 10) {

insights.push({

type: \'INDUSTRY_WEIGHT_ADJUSTMENT\',

severity: \'MEDIUM\',

finding: \`\${industry.name} converting at only
\${(industry.conversion_rate \* 100).toFixed(0)}% (avg: 35%)\`,

recommendation: \`Reduce \${industry.name} multiplier from
\${industry.current_weight} to \${industry.suggested_weight}\`,

impact: \`Would reduce false positives by \~\${industry.false_positives}
per month\`,

confidence: 0.75

});

}

}

// Insight 3: Missed opportunities (false negatives)

const fnAnalysis = await this.analyzeFalseNegatives(outcomes);

if (fnAnalysis.pattern_detected) {

insights.push({

type: \'EDGE_CASE_ADDITION\',

severity: \'MEDIUM\',

finding: \`\${fnAnalysis.count} false negatives from
\${fnAnalysis.segment} segment\`,

recommendation: \`Add positive edge case:
\${fnAnalysis.proposed_rule}\`,

impact: \`Would capture \${fnAnalysis.count} additional opportunities
per \${period}\`,

confidence: 0.70

});

}

// Insight 4: Outreach template performance

const templateAnalysis = await this.analyzeTemplates(outcomes);

const bestTemplate = templateAnalysis.sort((a, b) =\> b.reply_rate -
a.reply_rate)\[0\];

const worstTemplate = templateAnalysis.sort((a, b) =\> a.reply_rate -
b.reply_rate)\[0\];

if (bestTemplate.reply_rate \> worstTemplate.reply_rate \* 1.5) {

insights.push({

type: \'TEMPLATE_OPTIMIZATION\',

severity: \'LOW\',

finding: \`Template \"\${bestTemplate.id}\" performing
\${((bestTemplate.reply_rate / worstTemplate.reply_rate - 1) \*
100).toFixed(0)}% better than \"\${worstTemplate.id}\"\`,

recommendation: \`Review \${worstTemplate.id} template - consider
adopting elements from \${bestTemplate.id}\`,

impact: \`Could increase reply rate from \${(worstTemplate.reply_rate \*
100).toFixed(0)}% to \${(bestTemplate.reply_rate \* 100).toFixed(0)}%\`,

confidence: 0.60

});

}

return insights.sort((a, b) =\> {

// Sort by severity then confidence

const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };

if (severityOrder\[a.severity\] !== severityOrder\[b.severity\]) {

return severityOrder\[b.severity\] - severityOrder\[a.severity\];

}

return b.confidence - a.confidence;

});

}

}

// Generate monthly insights report

const generator = new InsightGenerator();

const insights = await
generator.generateInsights(outcomes_last_90_days);

console.log(insights);

// \[

// {

// type: \'THRESHOLD_ADJUSTMENT\',

// severity: \'HIGH\',

// finding: \'70-79 score bucket converting at only 28%\',

// recommendation: \'Increase threshold from 70 to 75\',

// impact: \'Would filter out 40 low-converting companies\',

// confidence: 0.85

// },

// \...

// \]

**Enhanced Deliverable for Phase 10**

\# feedback_reinforcement_layer.md Structure

\#\# 1. Outcome Schema

\- Complete OutreachOutcome interface

\- All tracking fields (engagement, conversion, business)

\- Learning signals (TP/FP/TN/FN labels)

\#\# 2. Database Schema

\- outreach_outcomes table (full DDL)

\- Indexes for analytics

\- Views (conversion funnel, score performance)

\- Triggers (auto-update timestamps)

\#\# 3. Outcome Classification

\- TP/FP/TN/FN logic

\- Precision/Recall/F1-Score calculation

\- Confidence intervals

\#\# 4. Analytics Queries (10+ queries)

\- Score calibration analysis

\- Feature importance analysis

\- False positive/negative analysis

\- Time-to-convert analysis

\- Industry/size/signal performance

\#\# 5. Reinforcement Learning

\- Bayesian updating strategy

\- Weight adjustment formulas

\- Monthly recalibration process

\- Confidence computation

\#\# 6. Evaluation Metrics

\- Model accuracy (precision, recall, F1)

\- Conversion rates (by score bucket)

\- Business metrics (reply, meeting, conversion)

\- Time-to-convert (median, p90)

\#\# 7. A/B Testing Framework

\- Variant assignment logic

\- Experiment tracking

\- Statistical significance testing

\- Promotion/rollback criteria

\#\# 8. Automated Insights

\- Insight generation logic

\- Severity classification

\- Confidence scoring

\- Actionable recommendations

\#\# 9. Monitoring Dashboard

\- Monthly scorecard format

\- Alert thresholds

\- Trend charts (precision over time)

\#\# 10. Integration Points

\- Hooks for outcome tracking

\- Webhooks for external systems

\- API endpoints for analytics

**Critical Decisions for Phase 10**

**Decision 1: Learning Speed**

-   \[ \] Aggressive (update weekly, trust data quickly)

-   \[x\] **Moderate (update monthly, require 50+ samples)**

-   \[ \] Conservative (update quarterly, require 100+ samples)

**My vote: Moderate** (solo dev, monthly is manageable)

**Decision 2: Automation Level**

-   \[ \] Fully manual (review insights, make changes)

-   \[x\] **Semi-automated (system suggests, human approves)**

-   \[ \] Fully automated (system updates rules automatically)

**My vote: Semi-automated** (safe, builds trust in system)

**Decision 3: Outcome Maturity Window**

-   \[ \] 14 days (fast feedback, but noisy)

-   \[x\] **30 days (balanced)**

-   \[ \] 60 days (accurate but slow)

**My vote: 30 days** (most conversions happen within 30 days per Phase
8)

**Decision 4: Statistical Rigor**

-   \[ \] No stats (just eyeball trends)

-   \[x\] **Basic stats (chi-square test, confidence intervals)**

-   \[ \] Advanced stats (Bayesian A/B testing, multi-armed bandits)

**My vote: Basic stats** (sufficient for v1, can upgrade later)

**Realistic Timeline for Phase 10**

**Week 1: Schema & Tracking**

-   Build outreach_outcomes table

-   Implement outcome classification logic

-   Start tracking outcomes

**Week 2: Analytics Queries**

-   Write 10+ analytics queries

-   Build performance views

-   Create monthly scorecard

**Week 3: Learning Pipeline**

-   Implement Bayesian updater

-   Build insight generator

-   Test recalibration process

**Week 4: Dashboard & Monitoring**

-   Build analytics dashboard

-   Set up alerts

-   Deploy to production

**Total: 4 weeks**

**What Success Looks Like**

After Phase 10:

✅ **Closed feedback loop** (outcomes → insights → adjustments → better
outcomes) ✅ **Data-driven improvements** (monthly recalibration based on
real conversions) ✅ **Precision ≥80%** (high-scored companies actually
convert) ✅ **Recall ≥70%** (catching most convertible companies) ✅
**Automated insights** (system tells you what to fix) ✅ **A/B testing**
(safe experimentation with new formulas) ✅ **Continuous improvement**
(system gets smarter every month)
