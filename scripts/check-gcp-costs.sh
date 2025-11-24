#!/bin/bash
# GCP Cost Analysis Script
# Identifies other potential cost drivers in your project

set -e

PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"

echo "🔍 Analyzing GCP resources for cost drivers..."
echo "Project: $PROJECT_ID"
echo ""

# Check Cloud Run services
echo "━━━ Cloud Run Services ━━━"
gcloud run services list \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    metadata.name,
    status.address.url,
    spec.template.metadata.annotations['autoscaling.knative.dev/minScale']:label=MIN,
    spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']:label=MAX,
    spec.template.spec.containers[0].resources.limits.cpu:label=CPU,
    spec.template.spec.containers[0].resources.limits.memory:label=MEMORY
  )"

echo ""

# Check Cloud SQL instances
echo "━━━ Cloud SQL Instances ━━━"
gcloud sql instances list \
  --project=$PROJECT_ID \
  --format="table(
    name,
    databaseVersion,
    settings.tier,
    state,
    settings.activationPolicy:label=ACTIVATION
  )" || echo "No Cloud SQL instances found"

echo ""

# Check VPC connectors
echo "━━━ VPC Access Connectors ━━━"
gcloud compute networks vpc-access connectors list \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    name,
    network,
    ipCidrRange,
    state,
    minThroughput,
    maxThroughput
  )" || echo "No VPC connectors found"

echo ""

# Check Redis instances (Memorystore)
echo "━━━ Redis/Memorystore Instances ━━━"
gcloud redis instances list \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="table(
    name,
    tier,
    memorySizeGb,
    state
  )" 2>/dev/null || echo "No Redis instances found (this is good for cost)"

echo ""

# Check Compute Engine VMs
echo "━━━ Compute Engine VMs ━━━"
gcloud compute instances list \
  --project=$PROJECT_ID \
  --format="table(
    name,
    zone,
    machineType,
    status
  )" || echo "No VMs found"

echo ""

# Check Cloud Functions
echo "━━━ Cloud Functions ━━━"
gcloud functions list \
  --project=$PROJECT_ID \
  --format="table(
    name,
    status,
    runtime,
    availableMemoryMb
  )" 2>/dev/null || echo "No Cloud Functions found"

echo ""

# Recommendations
echo "━━━ COST OPTIMIZATION RECOMMENDATIONS ━━━"
echo ""
echo "📊 To see your actual spending:"
echo "   gcloud billing accounts list"
echo "   # Then visit: https://console.cloud.google.com/billing"
echo ""
echo "🎯 Common cost reducers:"
echo "   1. ✅ Cloud Run min instances = 0 (already applied)"
echo "   2. 🔍 Cloud SQL: Consider 'NEVER' activation policy if not used 24/7"
echo "   3. 🔍 VPC Connector: Costs ~$10-30/month (needed for private DB access)"
echo "   4. 🔍 Check if you have external IPs or NAT gateways running"
echo ""
echo "💡 To stop Cloud SQL when not in use:"
echo "   gcloud sql instances patch upr-postgres --activation-policy=NEVER --project=$PROJECT_ID"
echo "   # Start it when needed:"
echo "   gcloud sql instances patch upr-postgres --activation-policy=ALWAYS --project=$PROJECT_ID"
echo ""
