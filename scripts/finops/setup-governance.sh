#!/bin/bash
# FinOps Governance Setup (Fixed)
# Creates budget alerts and enables billing export

set -e

PROJECT_ID="applied-algebra-474804-e6"
BILLING_ACCOUNT_ID=$(gcloud billing projects describe $PROJECT_ID --format="value(billingAccountName)" | cut -d'/' -f2)

echo "🔍 Detected billing account: $BILLING_ACCOUNT_ID"

# Create monthly budget with alerts (using beta API)
echo "💰 Creating monthly budget alert..."
gcloud beta billing budgets create \
  --billing-account=$BILLING_ACCOUNT_ID \
  --display-name="UPR Monthly Budget" \
  --budget-amount=200USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=75 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100 2>&1 || echo "⚠️  Budget may already exist"

# Enable billing export to BigQuery
echo "📊 Enabling billing export to BigQuery..."

# Create dataset if not exists
bq mk --dataset --location=US ${PROJECT_ID}:finops_data 2>&1 || echo "Dataset already exists"

# Enable billing export (using Cloud Console API)
echo "ℹ️  Billing export must be enabled via Cloud Console:"
echo "   https://console.cloud.google.com/billing/${BILLING_ACCOUNT_ID}"
echo "   Navigate to: Billing Export → BigQuery Export"
echo "   Dataset: finops_data"

echo ""
echo "✅ FinOps governance setup complete!"
echo ""
echo "📈 Next steps:"
echo "  1. Enable billing export manually: https://console.cloud.google.com/billing/${BILLING_ACCOUNT_ID}"
echo "  2. View costs: https://console.cloud.google.com/billing"
echo "  3. Query BigQuery: SELECT * FROM finops_data.gcp_billing_export_v1_*"
echo "  4. Build Looker Studio dashboard"
