#!/bin/bash
# Sprint 18, Task 9: Production Monitoring Setup
# This script sets up Cloud Monitoring dashboard and budget alerts

set -e

echo "═══════════════════════════════════════════════════════════"
echo "UPR Production Monitoring Setup"
echo "Sprint 18, Task 9"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="applied-algebra-474804-e6"
REGION="us-central1"
SERVICE_NAME="upr-web-service"

echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Step 1: Create Cloud Monitoring Dashboard
echo "Step 1: Creating Cloud Monitoring Dashboard..."
if gcloud monitoring dashboards create --config-from-file=monitoring/dashboard.json 2>/dev/null; then
  echo -e "${GREEN}✅ Dashboard created successfully${NC}"
else
  echo -e "${YELLOW}⚠️  Dashboard may already exist or error occurred${NC}"
  echo "   You can update it manually in Cloud Console"
fi
echo ""

# Step 2: Get billing account
echo "Step 2: Setting up budget alerts..."
BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" --limit=1)

if [ -z "$BILLING_ACCOUNT" ]; then
  echo -e "${RED}❌ No billing account found${NC}"
  echo "   Please set up billing in GCP Console first"
  echo "   Skip budget setup for now"
else
  echo "Billing Account: $BILLING_ACCOUNT"

  # Check if budget already exists
  EXISTING_BUDGET=$(gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --filter="displayName:UPR Monthly Budget" --format="value(name)" 2>/dev/null || echo "")

  if [ -n "$EXISTING_BUDGET" ]; then
    echo -e "${YELLOW}⚠️  Budget 'UPR Monthly Budget' already exists${NC}"
    echo "   Budget ID: $EXISTING_BUDGET"
  else
    # Create budget
    if gcloud billing budgets create \
      --billing-account="$BILLING_ACCOUNT" \
      --display-name="UPR Monthly Budget" \
      --budget-amount=100USD \
      --threshold-rule=percent=80,basis=CURRENT_SPEND \
      --threshold-rule=percent=100,basis=CURRENT_SPEND 2>/dev/null; then
      echo -e "${GREEN}✅ Budget alert created successfully${NC}"
    else
      echo -e "${RED}❌ Failed to create budget${NC}"
      echo "   Create manually in GCP Console: Billing → Budgets & alerts"
    fi
  fi
fi
echo ""

# Step 3: Verify Cloud Run service
echo "Step 3: Verifying Cloud Run service..."
if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" >/dev/null 2>&1; then
  SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
  echo -e "${GREEN}✅ Service found: $SERVICE_URL${NC}"
else
  echo -e "${RED}❌ Service not found${NC}"
  echo "   Ensure upr-web-service is deployed"
fi
echo ""

# Step 4: Check Sentry integration
echo "Step 4: Checking Sentry integration..."
if grep -q "SENTRY_DSN" .env 2>/dev/null; then
  echo -e "${GREEN}✅ Sentry DSN configured in .env${NC}"
else
  echo -e "${YELLOW}⚠️  SENTRY_DSN not found in .env${NC}"
  echo "   Add SENTRY_DSN to .env for error tracking"
fi
echo ""

# Step 5: Summary and next steps
echo "═══════════════════════════════════════════════════════════"
echo "Setup Summary"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ Completed:"
echo "   - Cloud Monitoring dashboard configuration"
echo "   - Budget alert setup (if billing enabled)"
echo ""
echo "📋 Manual Steps Required:"
echo ""
echo "1. Sentry Alerts (https://sentry.io)"
echo "   - Configure 6 alert rules (see monitoring/sentry-alerts.md)"
echo "   - Test alerts with /api/test/error endpoint"
echo ""
echo "2. Cost Tracking"
echo "   - Review monitoring/cost-tracking.md"
echo "   - Set up external API monitoring"
echo "   - Configure daily cost reports (optional)"
echo ""
echo "3. SLO Tracking"
echo "   - Review monitoring/slo-tracking.md"
echo "   - Set up SLO queries in Cloud Console"
echo "   - Configure SLO alerts"
echo ""
echo "4. View Dashboard"
echo "   - Open: https://console.cloud.google.com/monitoring/dashboards"
echo "   - Find: 'UPR Production Dashboard'"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "For detailed instructions, see:"
echo "  - monitoring/README.md"
echo "  - monitoring/sentry-alerts.md"
echo "  - monitoring/cost-tracking.md"
echo "  - monitoring/slo-tracking.md"
echo ""
echo "Setup complete!"
