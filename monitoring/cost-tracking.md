# Cost Tracking & Budget Alerts
**Sprint 18, Task 9: Production Monitoring**

## Budget Configuration

### Monthly Budget: $100
- **Alert Threshold 1:** 80% ($80)
- **Alert Threshold 2:** 100% ($100)
- **Forecast Alert:** Projected to exceed by 10%

---

## Cost Breakdown Targets

| Service | Monthly Target | Notes |
|---------|---------------|-------|
| Cloud Run | $30-40 | Container hosting |
| Database (Render) | $7-15 | PostgreSQL managed DB |
| Cloud Storage | $5-10 | RADAR data, logs |
| SerpAPI | $15-25 | Google search queries |
| Hunter.io | $10-15 | Email discovery |
| LinkedIn API | $0-10 | Signal detection (if enabled) |
| Cloud Scheduler | $1-2 | RADAR automation |
| Logging | $5-10 | Cloud Logging retention |
| **Total** | **$78-127** | **Target: $100** |

---

## Setup Instructions

### Step 1: Create Budget in GCP

```bash
# Get billing account ID
gcloud billing accounts list

# Create monthly budget
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="UPR Monthly Budget" \
  --budget-amount=100USD \
  --threshold-rule=percent=80,basis=CURRENT_SPEND \
  --threshold-rule=percent=100,basis=CURRENT_SPEND \
  --threshold-rule=percent=110,basis=FORECASTED_SPEND \
  --all-updates-rule-monitoring-notification-channels=NOTIFICATION_CHANNEL_ID

# Verify budget created
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID
```

**Notification Channels:**
1. Email: user@example.com
2. Pub/Sub topic (optional): budget-alerts

---

### Step 2: Create Cost Alert Email Notification

```bash
# Create notification channel for email
gcloud alpha monitoring channels create \
  --display-name="Budget Alerts Email" \
  --type=email \
  --channel-labels=email_address=user@example.com
```

---

### Step 3: Enable Cost Export to BigQuery (Optional)

For detailed cost analysis:

```bash
# Create BigQuery dataset
bq mk --dataset --location=US cost_tracking

# Enable billing export in GCP Console
# Billing → Billing Export → BigQuery Export
# Dataset: cost_tracking
# Table: gcp_billing_export
```

---

## Daily Cost Summary Email

### Setup Cloud Function for Daily Reports

**Function:** `scripts/monitoring/dailyCostSummary.js`

```javascript
// Cloud Function triggered daily at 9 AM
// Sends cost summary email

const { BigQuery } = require('@google-cloud/bigquery');
const nodemailer = require('nodemailer');

exports.dailyCostSummary = async (req, res) => {
  const bigquery = new BigQuery();

  // Query yesterday's costs
  const query = `
    SELECT
      service.description as service_name,
      SUM(cost) as daily_cost
    FROM \`project.cost_tracking.gcp_billing_export\`
    WHERE DATE(usage_start_time) = CURRENT_DATE() - 1
    GROUP BY service_name
    ORDER BY daily_cost DESC
  `;

  const [rows] = await bigquery.query(query);

  // Format email
  const emailBody = `
    UPR Daily Cost Summary
    Date: ${new Date().toISOString().split('T')[0]}

    Service Breakdown:
    ${rows.map(r => `- ${r.service_name}: $${r.daily_cost.toFixed(2)}`).join('\n')}

    Total: $${rows.reduce((sum, r) => sum + r.daily_cost, 0).toFixed(2)}
  `;

  // Send email
  await sendEmail('Daily Cost Summary', emailBody);

  res.status(200).send('Cost summary sent');
};
```

**Deploy:**
```bash
gcloud functions deploy dailyCostSummary \
  --runtime=nodejs18 \
  --trigger-http \
  --allow-unauthenticated

# Schedule daily at 9 AM
gcloud scheduler jobs create http daily-cost-report \
  --schedule="0 9 * * *" \
  --uri="https://REGION-PROJECT.cloudfunctions.net/dailyCostSummary" \
  --time-zone="Asia/Dubai"
```

---

## External API Cost Tracking

### Manual Tracking Sheet

| Provider | Plan | Monthly Limit | Cost | Usage Tracking |
|----------|------|---------------|------|----------------|
| SerpAPI | Pay-as-go | 5,000 queries | $0.005/query | Dashboard: serpapi.com/account |
| Hunter.io | Free + Pay | 500 free, then $49/mo | Variable | Dashboard: hunter.io/usage |
| LinkedIn API | RapidAPI | 1,000 requests | $30/mo | Dashboard: rapidapi.com |

### API Cost Monitoring Script

**File:** `scripts/monitoring/checkApiCosts.js`

```javascript
// Check external API usage and costs
import axios from 'axios';

async function checkApiCosts() {
  const costs = {};

  // SerpAPI
  const serpResponse = await axios.get('https://serpapi.com/account', {
    params: { api_key: process.env.SERP_API_KEY }
  });
  costs.serpapi = {
    searches_this_month: serpResponse.data.total_searches_this_month,
    estimated_cost: (serpResponse.data.total_searches_this_month * 0.005).toFixed(2)
  };

  // Hunter.io
  const hunterResponse = await axios.get('https://api.hunter.io/v2/account', {
    params: { api_key: process.env.HUNTER_API_KEY }
  });
  costs.hunter = {
    requests_this_month: hunterResponse.data.data.requests.used,
    limit: hunterResponse.data.data.requests.available,
    cost: hunterResponse.data.data.plan_name === 'free' ? 0 : 49
  };

  console.log('API Cost Summary:', costs);
  return costs;
}

export default checkApiCosts;
```

**Run weekly:**
```bash
node scripts/monitoring/checkApiCosts.js
```

---

## Cost Optimization Strategies

### 1. Cloud Run
- **Auto-scaling:** Min 0, Max 10 instances
- **CPU allocation:** Only during request processing
- **Memory:** 512MB (sufficient for most requests)
- **Concurrency:** 80 requests/instance

**Optimization:**
```bash
# Update service with optimal settings
gcloud run services update upr-web-service \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=80
```

### 2. Database
- **Connection pooling:** Max 20 connections
- **Query optimization:** Use indexes (Sprint 17 complete)
- **Read replicas:** Only if read load is high

### 3. External APIs
- **Caching:** Cache SerpAPI results for 24h
- **Rate limiting:** Enforce limits to avoid overage
- **Batch requests:** Group API calls when possible

### 4. Logging
- **Retention:** 30 days (default)
- **Filter logs:** Only log errors and warnings in production
- **Exclude health checks:** Don't log /health endpoint

**Update logging:**
```javascript
// server.js
if (req.path === '/health') {
  // Don't log health checks
  return res.status(200).json({ status: 'ok' });
}
```

---

## Cost Monitoring Checklist

### Daily
- [ ] Review cost dashboard
- [ ] Check for cost spikes
- [ ] Verify API usage within limits

### Weekly
- [ ] Review per-service costs
- [ ] Check external API quotas
- [ ] Analyze cost trends

### Monthly
- [ ] Review total spend vs budget
- [ ] Audit unused resources
- [ ] Optimize high-cost services
- [ ] Update cost projections

---

## Alert Response

### 80% Budget Alert ($80)
1. Review cost breakdown
2. Identify any unexpected spikes
3. Check external API usage
4. Consider optimization opportunities
5. No immediate action needed

### 100% Budget Alert ($100)
1. **Immediate:** Review all services
2. Identify cost drivers
3. Implement optimizations
4. Consider pausing non-critical features
5. Alert stakeholders

### 110% Forecast Alert
1. Analyze cost trajectory
2. Identify projected overages
3. Implement preventive measures
4. Adjust budget if justified
5. Communicate plan

---

## Cost Reporting

### Weekly Report Template

```
UPR Weekly Cost Report
Week of: [Date]

Total Spend: $XX.XX
Budget: $100/month
Remaining: $XX.XX

Service Breakdown:
- Cloud Run: $XX.XX
- Database: $XX.XX
- APIs: $XX.XX
- Other: $XX.XX

Trends:
- [Up/Down/Stable]
- Key drivers: [Service names]

Actions:
- [Any optimizations planned]

Forecast:
- Month-end projection: $XX.XX
```

---

**Created:** 2025-11-10
**Sprint:** 18, Task 9
**Status:** Configuration Required
