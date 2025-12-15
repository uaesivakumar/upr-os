#!/bin/bash
# scripts/finops-audit.sh
# Automates FinOps checks for UPR project.

echo "🔍 Starting FinOps Audit..."
echo "--------------------------------"

# 1. Check for AlloyDB Clusters (Should be 0)
echo "1. Checking AlloyDB Clusters (Target: 0)..."
ALLOYDB_COUNT=$(gcloud alloydb clusters list --region=me-central1 --project=applied-algebra-474804-e6 --format="value(name)" 2>/dev/null | wc -l)
if [ "$ALLOYDB_COUNT" -eq 0 ]; then
    echo "✅ PASS: No AlloyDB clusters found in applied-algebra-474804-e6."
else
    echo "❌ FAIL: Found $ALLOYDB_COUNT AlloyDB clusters! Investigate immediately."
    gcloud alloydb clusters list --region=me-central1 --project=applied-algebra-474804-e6
fi

# 2. Check for unused Static IPs
echo -e "\n2. Checking for Unused Static IPs..."
UNUSED_IPS=$(gcloud compute addresses list --filter="status=RESERVED" --format="value(name, region)" 2>/dev/null)
if [ -z "$UNUSED_IPS" ]; then
    echo "✅ PASS: No unused static IPs found."
else
    echo "⚠️ WARNING: Found unused static IPs:"
    echo "$UNUSED_IPS"
fi

# 3. Check Artifact Registry Size
echo -e "\n3. Checking Artifact Registry Size..."
REPO_SIZE=$(gcloud artifacts repositories list --project=applied-algebra-474804-e6 --filter="name:upr-app-repo" --format="value(sizeBytes)" 2>/dev/null)
# Convert to GB
SIZE_GB=$((REPO_SIZE / 1024 / 1024 / 1024))

if [ "$SIZE_GB" -lt 10 ]; then
    echo "✅ PASS: Artifact Registry size is within limits (${SIZE_GB}GB)."
else
    echo "⚠️ NOTICE: Artifact Registry is ${SIZE_GB}GB. Verify cleanup policy is active."
fi

# 4. Check for obsolete Cloud Run services
echo -e "\n4. Checking for Obsolete Cloud Run Services..."
OBSOLETE_SERVICES=("upr-web-service" "coming-soon-service")
FOUND_OBSOLETE=false

for SERVICE in "${OBSOLETE_SERVICES[@]}"; do
    if gcloud run services describe "$SERVICE" --project=applied-algebra-474804-e6 --region=us-central1 > /dev/null 2>&1; then
        echo "❌ FAIL: Found obsolete service: $SERVICE"
        FOUND_OBSOLETE=true
    fi
done

if [ "$FOUND_OBSOLETE" = false ]; then
    echo "✅ PASS: No known obsolete services found."
fi

echo "--------------------------------"
echo "🏁 Audit Complete."
