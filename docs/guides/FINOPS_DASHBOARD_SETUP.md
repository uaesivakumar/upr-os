# FinOps Dashboard Setup Guide

**Objective:** Create a Looker Studio dashboard for real-time cost monitoring

---

## Prerequisites

1. ✅ BigQuery dataset `finops_data` created
2. ✅ Budget alerts configured (50%, 75%, 90%, 100%)
3. ⏳ Billing export enabled (manual step required)

---

## Step 1: Enable Billing Export

**Manual Action Required:**

1. Go to: https://console.cloud.google.com/billing/01BF3F-B89AC7-72D444
2. Click "Billing Export" in left menu
3. Click "BigQuery Export" tab
4. Click "Edit Settings"
5. Select dataset: `finops_data`
6. Click "Save"

**Wait 24 hours** for initial data to populate.

---

## Step 2: Verify Data Export

Run this query in BigQuery:

```sql
SELECT COUNT(*) as row_count
FROM `finops_data.gcp_billing_export_v1_*`
WHERE DATE(usage_start_time) = CURRENT_DATE();
```

Expected: > 0 rows (after 24 hours)

---

## Step 3: Create Looker Studio Dashboard

### Option A: Quick Setup (Recommended)

1. Go to: https://lookerstudio.google.com
2. Click "Create" → "Data Source"
3. Select "BigQuery"
4. Choose dataset: `applied-algebra-474804-e6.finops_data`
5. Select table: `gcp_billing_export_v1_*` (wildcard)
6. Click "Connect"
7. Click "Create Report"

### Option B: Use Pre-built Queries

1. Open `scripts/finops/cost-monitoring-queries.sql`
2. Copy each query into BigQuery
3. Save results as views:
   - `finops_data.daily_cost_by_service`
   - `finops_data.cost_by_labels`
   - `finops_data.cloud_run_breakdown`
4. Connect Looker Studio to these views

---

## Step 4: Dashboard Widgets

Add these visualizations:

### 1. Budget Gauge
- **Type:** Scorecard
- **Metric:** Budget Used %
- **Query:** #6 from cost-monitoring-queries.sql
- **Alert:** Red if > 90%

### 2. Daily Cost Trend
- **Type:** Time Series
- **Metric:** Daily Cost USD
- **Dimension:** Date
- **Query:** #1

### 3. Cost by Service (Pie Chart)
- **Type:** Pie Chart
- **Metric:** Total Cost
- **Dimension:** Service Name
- **Query:** #1

### 4. Cost by Label (Table)
- **Type:** Table
- **Metric:** Total Cost
- **Dimension:** Label Key, Label Value
- **Query:** #2

### 5. Month-over-Month Comparison
- **Type:** Bar Chart
- **Metric:** Cost Change
- **Dimension:** Month
- **Query:** #4

### 6. Top 10 Resources
- **Type:** Table
- **Metric:** Total Cost
- **Dimension:** Resource Name, Service
- **Query:** #5

---

## Step 5: Set Up Alerts

In Looker Studio:
1. Click "Share" → "Schedule email delivery"
2. Set frequency: Weekly (Monday 9 AM)
3. Add recipients: team@example.com
4. Enable "Send only if data changes"

---

## Step 6: Mobile Access

1. Install "Looker Studio" app (iOS/Android)
2. Sign in with Google account
3. Dashboard will be accessible on mobile

---

## Maintenance

- **Weekly:** Review dashboard, check for anomalies
- **Monthly:** Update budget if needed
- **Quarterly:** Review committed use discount opportunities

---

## Troubleshooting

**No data in BigQuery?**
- Wait 24 hours after enabling export
- Check billing account permissions
- Verify dataset location (US)

**Dashboard not updating?**
- Refresh data source in Looker Studio
- Check BigQuery table partitioning
- Verify billing export is still enabled

---

**Next Steps:**
1. Enable billing export (manual)
2. Wait 24 hours
3. Create Looker Studio dashboard
4. Share with team
