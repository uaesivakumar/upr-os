#!/bin/bash
set -e

echo "🔍 Validating UPR Deployment Configuration..."

# Function to check if service has required config
check_service() {
  local SERVICE=$1

  echo ""
  echo "Checking $SERVICE..."

  # Check VPC connector
  VPC=$(gcloud run services describe $SERVICE --region=us-central1 --format='value(spec.template.metadata.annotations["run.googleapis.com/vpc-access-connector"])' 2>/dev/null || echo "MISSING")

  if [[ "$VPC" == *"upr-vpc-connector"* ]]; then
    echo "  ✅ VPC Connector: OK"
  else
    echo "  ❌ VPC Connector: MISSING"
    echo "     Expected: projects/applied-algebra-474804-e6/locations/us-central1/connectors/upr-vpc-connector"
    echo "     Got: $VPC"
    exit 1
  fi

  # Check Cloud SQL instance
  SQL=$(gcloud run services describe $SERVICE --region=us-central1 --format='value(spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"])' 2>/dev/null || echo "MISSING")

  if [[ "$SQL" == *"upr-postgres"* ]]; then
    echo "  ✅ Cloud SQL: OK"
  else
    echo "  ⚠️  Cloud SQL: $SQL (might be OK if not needed)"
  fi

  # Check REDIS_URL secret
  ENV_VARS=$(gcloud run services describe $SERVICE --region=us-central1 --format='json' 2>/dev/null | grep -A 100 '"env":' || echo "")

  if echo "$ENV_VARS" | grep -q "REDIS_URL"; then
    echo "  ✅ REDIS_URL: OK"
  else
    echo "  ❌ REDIS_URL: MISSING"
    exit 1
  fi

  # Check DATABASE_URL secret
  if echo "$ENV_VARS" | grep -q "DATABASE_URL"; then
    echo "  ✅ DATABASE_URL: OK"
  else
    echo "  ❌ DATABASE_URL: MISSING"
    exit 1
  fi

  # Check service account
  SA=$(gcloud run services describe $SERVICE --region=us-central1 --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo "MISSING")

  if [[ "$SA" == *"upr-runner"* ]]; then
    echo "  ✅ Service Account: OK"
  else
    echo "  ⚠️  Service Account: $SA (expected upr-runner@...)"
  fi
}

# Validate both services
check_service "upr-web-service"
check_service "upr-enrichment-worker"

echo ""
echo "✅ All validations passed!"
