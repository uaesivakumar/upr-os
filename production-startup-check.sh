#!/bin/bash

# Production Startup Check for EmailPatternEngine v3.1.0
# Verifies all systems ready before deployment
# UPR (Universal People Radar)

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "EmailPatternEngine v3.1.0 - Production Startup Check"
echo "UPR (Universal People Radar)"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Load environment
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | grep -v '^$' | xargs)
    echo "✅ Loaded .env.production"
else
    echo "❌ ERROR: .env.production file not found"
    exit 1
fi

echo ""

# Check 1: Database Connection
echo "1. Checking Database Connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "   ✅ Database connection successful"
else
    echo "   ❌ Database connection failed"
    exit 1
fi

# Check 2: Required Tables
echo ""
echo "2. Checking Required Tables..."
TABLES=("email_patterns" "pattern_failures" "enrichment_telemetry" "nb_cache" "nb_token_bucket")
ALL_TABLES_EXIST=true

for table in "${TABLES[@]}"; do
    if psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='$table');" 2>/dev/null | grep -q "t"; then
        echo "   ✅ $table"
    else
        echo "   ❌ $table (missing)"
        ALL_TABLES_EXIST=false
    fi
done

if [ "$ALL_TABLES_EXIST" = false ]; then
    echo ""
    echo "   ⚠️  Some tables are missing. Run migrations first."
    exit 1
fi

# Check 3: Pattern Count
echo ""
echo "3. Checking Pattern Database..."
PATTERN_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM email_patterns;" 2>/dev/null)
echo "   ✅ $PATTERN_COUNT patterns in database"

if [ "$PATTERN_COUNT" -lt 10 ]; then
    echo "   ⚠️  Warning: Low pattern count. System will learn as it runs."
fi

# Check 4: Environment Variables
echo ""
echo "4. Checking Environment Variables..."

HAS_ERRORS=false

if [ -z "$NEVERBOUNCE_API_KEY" ] || [ "$NEVERBOUNCE_API_KEY" = "private_XXXXXXXXXXXXXXXXXXXXXXXX" ]; then
    echo "   ❌ NEVERBOUNCE_API_KEY not set or using placeholder (MANDATORY)"
    HAS_ERRORS=true
else
    echo "   ✅ NEVERBOUNCE_API_KEY set"
fi

if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" ]; then
    echo "   ❌ OPENAI_API_KEY not set or using placeholder (MANDATORY)"
    HAS_ERRORS=true
else
    echo "   ✅ OPENAI_API_KEY set"
fi

if [ -z "$TENANT_ID" ]; then
    echo "   ⚠️  TENANT_ID not set (recommended)"
else
    echo "   ✅ TENANT_ID set"
fi

# Check 5: Node Modules
echo ""
echo "5. Checking Node Modules..."
if [ -d "node_modules" ]; then
    echo "   ✅ node_modules exists"
else
    echo "   ⚠️  node_modules missing - run: npm install"
fi

# Check 6: Critical Files
echo ""
echo "6. Checking Critical Files..."
FILES=(
    "server/lib/emailIntelligence/orchestrator.js"
    "server/lib/emailIntelligence/failureLearning.js"
    "server/lib/emailIntelligence/startup.js"
    "server/lib/emailIntelligence/rag.js"
    "server/lib/emailIntelligence/rules.js"
    "server/lib/emailIntelligence/prompt.js"
    "server/lib/emailIntelligence/nb.js"
    "server/lib/emailIntelligence/integration.js"
)

ALL_FILES_EXIST=true

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing)"
        ALL_FILES_EXIST=false
    fi
done

if [ "$ALL_FILES_EXIST" = false ]; then
    echo ""
    echo "   ⚠️  Some critical files are missing."
    exit 1
fi

# Summary
echo ""

if [ "$HAS_ERRORS" = true ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "❌ STARTUP CHECK FAILED - MISSING REQUIRED API KEYS"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    echo "ACTION REQUIRED:"
    echo "  1. Retrieve API keys from GCP Secrets Manager"
    echo "  2. Update .env.production with actual keys"
    echo "  3. Re-run this check"
    echo ""
    echo "API Keys Location (GCP Secrets):"
    echo "  • NEVERBOUNCE_API_KEY → neverbounce-api-key"
    echo "  • OPENAI_API_KEY → openai-api-key"
    echo ""
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ ALL CHECKS PASSED - READY FOR PRODUCTION DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "System Status:"
echo "  • Database: Connected ($PATTERN_COUNT patterns)"
echo "  • NeverBounce: Configured ✅"
echo "  • OpenAI: Configured ✅"
echo "  • Pattern Learning: ENABLED"
echo "  • Failure Learning: ENABLED"
echo ""
echo "Investment Targets:"
echo "  • Month 1: 1,000 patterns → \$24 investment"
echo "  • Year 1: 10,000 patterns → \$240 investment"
echo "  • Year 5: 1,000,000 patterns → \$24,000 investment → \$500K asset (21× ROI)"
echo ""
echo "Next Steps:"
echo "  1. Deploy: gcloud run deploy upr-hiring-signals-worker"
echo "  2. Monitor: node server/lib/emailIntelligence/test-production-monitoring.js"
echo "  3. Test: node server/lib/emailIntelligence/test-production-flow.js"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
