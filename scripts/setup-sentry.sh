#!/bin/bash
# Setup Sentry Error Monitoring
# Run after signing up at sentry.io (free tier)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Setting Up Sentry Error Monitoring"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Install Sentry packages
echo "📦 Installing Sentry packages..."
npm install --save @sentry/node @sentry/react

echo ""
echo "✅ Sentry packages installed!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Sign up at https://sentry.io (free tier: 5K errors/month)"
echo "2. Create a new project for 'upr-production'"
echo "3. Copy your DSN (looks like: https://xxxxx@xxxxx.ingest.sentry.io/xxxxx)"
echo ""
echo "4. Add DSN to environment variables:"
echo "   export SENTRY_DSN='your-dsn-here'"
echo ""
echo "5. Backend setup is ready in: utils/sentry.js"
echo "6. Frontend setup is ready in: dashboard/src/sentry.js"
echo ""
echo "7. Import Sentry in your code (see SENTRY_INTEGRATION.md)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
