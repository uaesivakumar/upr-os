-- FinOps Cost Monitoring Queries
-- Use these queries in BigQuery or Looker Studio

-- 1. Daily Cost by Service (Last 30 Days)
SELECT
  DATE(usage_start_time) as date,
  service.description as service_name,
  ROUND(SUM(cost), 2) as daily_cost_usd
FROM
  `finops_data.gcp_billing_export_v1_*`
WHERE
  DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY
  date, service_name
ORDER BY
  date DESC, daily_cost_usd DESC;

-- 2. Cost by Resource Labels (Current Month)
SELECT
  labels.value as label_value,
  labels.key as label_key,
  ROUND(SUM(cost), 2) as total_cost_usd
FROM
  `finops_data.gcp_billing_export_v1_*`,
  UNNEST(labels) as labels
WHERE
  DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND labels.key IN ('env', 'team', 'cost-center', 'component')
GROUP BY
  label_key, label_value
ORDER BY
  total_cost_usd DESC;

-- 3. Cloud Run Cost Breakdown (Last 7 Days)
SELECT
  service.description as service_name,
  sku.description as sku_description,
  ROUND(SUM(cost), 2) as cost_usd,
  ROUND(SUM(usage.amount), 2) as usage_amount,
  usage.unit as usage_unit
FROM
  `finops_data.gcp_billing_export_v1_*`
WHERE
  DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
  AND service.description = 'Cloud Run'
GROUP BY
  service_name, sku_description, usage_unit
ORDER BY
  cost_usd DESC;

-- 4. Month-over-Month Cost Comparison
WITH monthly_costs AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(usage_start_time)) as month,
    ROUND(SUM(cost), 2) as total_cost_usd
  FROM
    `finops_data.gcp_billing_export_v1_*`
  WHERE
    DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  GROUP BY
    month
)
SELECT
  month,
  total_cost_usd,
  LAG(total_cost_usd) OVER (ORDER BY month) as previous_month_cost,
  ROUND(total_cost_usd - LAG(total_cost_usd) OVER (ORDER BY month), 2) as cost_change,
  ROUND(((total_cost_usd - LAG(total_cost_usd) OVER (ORDER BY month)) / LAG(total_cost_usd) OVER (ORDER BY month)) * 100, 1) as percent_change
FROM
  monthly_costs
ORDER BY
  month DESC;

-- 5. Top 10 Most Expensive Resources
SELECT
  resource.name as resource_name,
  service.description as service,
  ROUND(SUM(cost), 2) as total_cost_usd
FROM
  `finops_data.gcp_billing_export_v1_*`
WHERE
  DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY
  resource_name, service
ORDER BY
  total_cost_usd DESC
LIMIT 10;

-- 6. Budget vs Actual (Current Month)
WITH current_month_cost AS (
  SELECT
    ROUND(SUM(cost), 2) as actual_cost
  FROM
    `finops_data.gcp_billing_export_v1_*`
  WHERE
    DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
)
SELECT
  200 as budget_usd,
  actual_cost as actual_cost_usd,
  ROUND((actual_cost / 200) * 100, 1) as budget_used_percent,
  ROUND(200 - actual_cost, 2) as remaining_budget_usd
FROM
  current_month_cost;
