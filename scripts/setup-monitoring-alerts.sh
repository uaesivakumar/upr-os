#!/bin/bash
# Setup monitoring alerts for Cloud Run services
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  Setting Up Monitoring Alerts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ID="applied-algebra-474804-e6"

# 1. High Error Rate Alert (>5% error rate)
echo "Creating high error rate alert..."
gcloud alpha monitoring policies create \
  --notification-channels="" \
  --display-name="UPR High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"' \
  --condition-aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.service_name"]}' \
  --if-value=COMPARISON_GT \
  --documentation='High error rate detected. Check service logs and Sentry for details.' \
  --quiet \
  || echo "✓ Error rate alert already exists or created"

# 2. High Latency Alert (>2s p95)
echo "Creating high latency alert..."
gcloud alpha monitoring policies create \
  --notification-channels="" \
  --display-name="UPR High Latency" \
  --condition-display-name="P95 latency > 2000ms" \
  --condition-threshold-value=2000 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"' \
  --condition-aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_DELTA","crossSeriesReducer":"REDUCE_PERCENTILE_95","groupByFields":["resource.service_name"]}' \
  --if-value=COMPARISON_GT \
  --documentation='High latency detected. Check service performance and database queries.' \
  --quiet \
  || echo "✓ Latency alert already exists or created"

# 3. High CPU Usage Alert (>80%)
echo "Creating high CPU usage alert..."
gcloud alpha monitoring policies create \
  --notification-channels="" \
  --display-name="UPR High CPU Usage" \
  --condition-display-name="CPU > 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/cpu/utilizations"' \
  --condition-aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN","crossSeriesReducer":"REDUCE_MEAN","groupByFields":["resource.service_name"]}' \
  --if-value=COMPARISON_GT \
  --documentation='High CPU usage detected. Consider scaling or optimizing service.' \
  --quiet \
  || echo "✓ CPU alert already exists or created"

# 4. High Memory Usage Alert (>85%)
echo "Creating high memory usage alert..."
gcloud alpha monitoring policies create \
  --notification-channels="" \
  --display-name="UPR High Memory Usage" \
  --condition-display-name="Memory > 85%" \
  --condition-threshold-value=0.85 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/memory/utilizations"' \
  --condition-aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN","crossSeriesReducer":"REDUCE_MEAN","groupByFields":["resource.service_name"]}' \
  --if-value=COMPARISON_GT \
  --documentation='High memory usage detected. Check for memory leaks or increase memory allocation.' \
  --quiet \
  || echo "✓ Memory alert already exists or created"

echo ""
echo "✅ Monitoring alerts configured!"
echo ""
echo "📊 View dashboard:"
echo "   https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
echo ""
echo "⚠️  Configure notification channels:"
echo "   https://console.cloud.google.com/monitoring/alerting/notifications?project=$PROJECT_ID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
