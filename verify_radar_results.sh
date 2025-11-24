#!/bin/bash
# Verify RADAR discovery results after manual test run

echo "🔍 RADAR Results Verification"
echo "=============================="
echo ""

# Get DATABASE_URL
DB_URL=$(gcloud secrets versions access latest --secret="DATABASE_URL" 2>/dev/null)
if [ -z "$DB_URL" ]; then
    echo "❌ Failed to get DATABASE_URL"
    exit 1
fi

echo "Step 1: Check most recent discovery run"
echo "----------------------------------------"
psql "$DB_URL" -c "
SELECT
    run_id,
    status,
    companies_found,
    companies_accepted,
    ROUND(cost_usd::numeric, 4) as cost_usd,
    ROUND(latency_ms::numeric / 1000, 1) as latency_sec,
    created_at
FROM discovery_runs
ORDER BY created_at DESC
LIMIT 1;" 2>&1 | head -15

echo ""
echo "Step 2: Check for errors in latest run"
echo "---------------------------------------"
LATEST_RUN_ID=$(psql "$DB_URL" -t -c "SELECT run_id FROM discovery_runs ORDER BY created_at DESC LIMIT 1;" 2>&1 | xargs)

if [ -n "$LATEST_RUN_ID" ]; then
    echo "Latest run ID: $LATEST_RUN_ID"
    echo ""
    echo "Checking Cloud Run logs for this run..."
    gcloud run services logs read upr-web-service --region=us-central1 --limit=50 --format=json 2>&1 | \
    python3 -c "
import sys, json
run_id = '$LATEST_RUN_ID'
found_run = False
errors = []
success_messages = []

for line in sys.stdin:
    try:
        data = json.loads(line)
        msg = data.get('textPayload', '') or str(data.get('jsonPayload', {}).get('message', ''))

        if run_id[:8] in msg:
            found_run = True

        if 'prompt_text' in msg.lower() and 'not exist' in msg.lower():
            errors.append(f'❌ {msg[:150]}')
        elif '❌' in msg or 'Error' in msg or 'Failed' in msg:
            if run_id[:8] in msg or found_run:
                errors.append(f'⚠️  {msg[:150]}')
        elif '✅' in msg and ('SCAN COMPLETE' in msg or 'companies' in msg.lower()):
            if run_id[:8] in msg:
                success_messages.append(f'✅ {msg[:200]}')
    except:
        pass

if errors:
    print('Found errors:')
    for err in errors[:5]:
        print(err)
else:
    print('✅ No errors found!')

if success_messages:
    print('\nSuccess messages:')
    for msg in success_messages:
        print(msg)
"
else
    echo "No runs found in database"
fi

echo ""
echo "Step 3: Check discovered companies"
echo "-----------------------------------"
COMPANY_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM entities_company WHERE metadata->>'discovered_by' = 'radar';" 2>&1 | xargs)
echo "Total RADAR-discovered companies: $COMPANY_COUNT"

if [ "$COMPANY_COUNT" -gt 0 ]; then
    echo ""
    echo "Recent RADAR discoveries:"
    psql "$DB_URL" -c "
    SELECT
        legal_name,
        domain_norm,
        primary_industry,
        ROUND(uae_presence_confidence::numeric, 2) as confidence,
        metadata->>'discovered_at' as discovered_at
    FROM entities_company
    WHERE metadata->>'discovered_by' = 'radar'
    ORDER BY created_at DESC
    LIMIT 5;" 2>&1 | head -20
fi

echo ""
echo "=============================="
echo "📊 EXPECTED RESULTS:"
echo "✅ Status: completed"
echo "✅ Companies found: > 0"
echo "✅ Cost: > $0.00 (should be $0.10 - $2.00)"
echo "✅ Latency: 60-900 seconds"
echo "✅ No 'prompt_text' errors"
echo ""
echo "❌ If you see 0 companies and $0.00 cost:"
echo "   - Run: gcloud run services logs tail upr-web-service"
echo "   - Look for specific error messages"
echo "   - Check if SERPAPI_KEY and OPENAI_API_KEY are working"
echo ""
