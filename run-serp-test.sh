#!/bin/bash

export SERPAPI_KEY=$(gcloud secrets versions access latest --secret=SERPAPI_KEY 2>/dev/null)
export DATABASE_URL="postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require"

echo "SERPAPI_KEY length: ${#SERPAPI_KEY}"
echo ""

node test-domain-pattern-discovery.js
