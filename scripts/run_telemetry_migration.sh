#!/bin/bash
# Run telemetry migration on Cloud SQL
# Usage: ./scripts/run_telemetry_migration.sh

set -e

echo "🔄 Running telemetry migration..."

# Method 1: Via Cloud SQL Proxy (if running locally)
# Start proxy first: cloud_sql_proxy -instances=applied-algebra-474804-e6:us-central1:upr-postgres=tcp:5432
# Then run: PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql -h localhost -U upr_app -d upr_production < db/migrations/2025_10_30_user_interactions_telemetry.sql

# Method 2: Via gcloud sql connect (interactive)
echo "Starting Cloud SQL connection..."
gcloud beta sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production \
  --quiet <<'EOF'
\i db/migrations/2025_10_30_user_interactions_telemetry.sql
\q
EOF

echo "✅ Migration complete! Verifying table..."

# Verify table creation
gcloud beta sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production \
  --quiet <<'EOF'
\d user_interactions
SELECT COUNT(*) as table_exists FROM information_schema.tables WHERE table_name = 'user_interactions';
\q
EOF

echo "✅ Telemetry system ready!"
