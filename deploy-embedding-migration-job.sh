#!/bin/bash
set -e

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "DEPLOYING EMBEDDING MIGRATION AS CLOUD RUN JOB"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "This creates a Cloud Run Job that:"
echo "  - Uses same VPC connector as your services"
echo "  - Has same Cloud SQL connection (Unix socket)"
echo "  - Uses same service account with proper permissions"
echo "  - No private IP connection headaches"
echo ""
echo "Job: db-migrate-embeddings"
echo "Region: us-central1"
echo ""

# Create Cloud Run Job
gcloud run jobs create db-migrate-embeddings \
  --source=. \
  --region=us-central1 \
  --vpc-connector=upr-vpc-connector \
  --vpc-egress=private-ranges-only \
  --set-cloudsql-instances=applied-algebra-474804-e6:us-central1:upr-postgres \
  --service-account=upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command="node,run-embedding-fix-migration.js" \
  --max-retries=0 \
  --task-timeout=10m \
  --quiet

echo ""
echo "✅ Cloud Run Job created: db-migrate-embeddings"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "TO EXECUTE THE MIGRATION:"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Option 1: Execute now"
echo "  gcloud run jobs execute db-migrate-embeddings --region=us-central1 --wait"
echo ""
echo "Option 2: Execute and follow logs"
echo "  gcloud run jobs execute db-migrate-embeddings --region=us-central1 &"
echo "  gcloud logging read 'resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"db-migrate-embeddings\"' --limit=100 --format=json | jq -r '.[] | select(.textPayload != null) | .textPayload'"
echo ""
echo "Option 3: Schedule for later"
echo "  # Creates Cloud Scheduler job to run at specific time"
echo "  gcloud scheduler jobs create http embedding-migration-scheduled \\"
echo "    --location=us-central1 \\"
echo "    --schedule='0 2 * * *' \\"
echo "    --uri='https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/applied-algebra-474804-e6/jobs/db-migrate-embeddings:run' \\"
echo "    --http-method=POST \\"
echo "    --oauth-service-account-email=upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "WHAT THE MIGRATION DOES:"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "1. ALTER TABLE pattern_failures ALTER COLUMN embedding TYPE vector(384)"
echo "2. ALTER TABLE email_patterns ALTER COLUMN embedding TYPE vector(384)"
echo "3. ALTER TABLE kb_chunks ALTER COLUMN embedding TYPE vector(384)"
echo "4. DROP INDEX idx_pattern_failures_embedding (brief lock)"
echo "5. DROP INDEX idx_email_patterns_embedding (brief lock)"
echo "6. DROP INDEX idx_kb_chunks_embedding (brief lock)"
echo "7. CREATE INDEX idx_pattern_failures_embedding USING ivfflat"
echo "8. CREATE INDEX idx_email_patterns_embedding USING ivfflat"
echo "9. CREATE INDEX idx_kb_chunks_embedding USING ivfflat"
echo "10. CREATE TABLE embedding_meta (version tracking)"
echo ""
echo "Duration: ~30 seconds"
echo "Downtime: None (enrichment continues, only vector queries affected)"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "POST-MIGRATION CHECKS:"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "After migration completes, verify:"
echo ""
echo "1. Check embedding_meta table"
echo "   gcloud run jobs execute db-health-check --region=us-central1 --args='embeddings'"
echo ""
echo "2. Test enrichment with failure learning enabled"
echo "   curl -X POST https://upr-web-service-*.run.app/api/hiring-enrich/enrich \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"domain\":\"test-failure.com\",\"company_name\":\"Test Company\"}'"
echo ""
echo "3. Monitor logs for embedding dimension validation"
echo "   gcloud logging read 'resource.type=\"cloud_run_revision\" AND textPayload=~\"embedding\"' --limit=20"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
