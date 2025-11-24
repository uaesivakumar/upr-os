#!/bin/bash
# Setup GCP Budget Alerts
# First, enable the API by visiting:
# https://console.developers.google.com/apis/api/billingbudgets.googleapis.com/overview?project=applied-algebra-474804-e6

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💰 Setting Up GCP Budget Alerts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BILLING_ACCOUNT="01BF3F-B89AC7-72D444"
BUDGET_NAME="UPR Monthly Budget Alert"
BUDGET_AMOUNT=120

echo "Creating budget alerts at 50%, 90%, and 100% thresholds..."
echo ""

gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="$BUDGET_NAME" \
  --budget-amount="$BUDGET_AMOUNT" \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Budget alerts created successfully!"
  echo ""
  echo "You will receive email notifications at:"
  echo "  • $60 (50% of budget)"
  echo "  • $108 (90% of budget)"
  echo "  • $120 (100% of budget)"
  echo ""
else
  echo ""
  echo "❌ Failed to create budget alerts"
  echo ""
  echo "Manual setup:"
  echo "1. Visit: https://console.cloud.google.com/billing/$BILLING_ACCOUNT/budgets"
  echo "2. Click 'Create Budget'"
  echo "3. Set amount: $120 USD per month"
  echo "4. Add thresholds: 50%, 90%, 100%"
  echo "5. Add email notification with your email"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
