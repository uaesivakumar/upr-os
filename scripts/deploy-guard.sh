#!/bin/bash
# UPR OS Deployment Guard
# This script MUST be run before any deployment to UPR OS

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=================================================="
echo -e "${RED}⚠️  UPR OS IS A FROZEN SERVICE ⚠️${NC}"
echo "=================================================="
echo ""
echo "This service was frozen on 2025-11-25"
echo "Frozen revision: upr-os-service-00011-pwb"
echo ""
echo -e "${YELLOW}Deploying to UPR OS can break:${NC}"
echo "  - PremiumRadar SaaS API"
echo "  - All customer-facing features"
echo "  - upr.sivakumar.ai frontend"
echo ""
echo "=================================================="
echo ""

read -p "Do you have TC approval to deploy? (type 'YES-I-HAVE-APPROVAL' to continue): " confirmation

if [ "$confirmation" != "YES-I-HAVE-APPROVAL" ]; then
    echo ""
    echo -e "${RED}Deployment cancelled.${NC}"
    echo ""
    echo "To restore the frozen state:"
    echo "  gcloud run deploy upr-os-service \\"
    echo "    --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/cloud-run-source-deploy/upr-os-service:frozen-2025-11-25 \\"
    echo "    --region=us-central1 \\"
    echo "    --project=applied-algebra-474804-e6"
    exit 1
fi

echo ""
echo "Proceeding with deployment..."
echo ""
