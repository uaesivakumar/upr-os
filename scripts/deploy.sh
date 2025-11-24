#!/bin/bash
# One-command deployment script
# Usage: ./scripts/deploy.sh "commit message" [service-name]

set -e  # Exit on error

COMMIT_MSG="$1"
SERVICE="${2:-upr-web-service}"  # Default to web service
REGION="us-central1"

if [ -z "$COMMIT_MSG" ]; then
  echo "❌ Error: Commit message required"
  echo "Usage: ./scripts/deploy.sh 'feat: your message' [service-name]"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 UPR Deployment Pipeline"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Service: $SERVICE"
echo "Message: $COMMIT_MSG"
echo "Branch: $(git branch --show-current)"
echo ""

# 1. Git operations
echo "📦 Committing changes..."
git add .
git commit -m "$COMMIT_MSG"

echo "⬆️  Pushing to remote..."
git push origin $(git branch --show-current)

# 2. Deploy to Cloud Run
echo ""
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --quiet

# 3. Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)")

# 4. Sync to Notion
echo ""
echo "📝 Syncing to Notion..."
npm run notion -- sync

# 5. Send Slack notification (if webhook configured)
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  echo ""
  echo "📢 Sending Slack notification..."

  BRANCH=$(git branch --show-current)
  COMMIT_SHA=$(git rev-parse --short HEAD)

  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d @- << EOF
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚀 Deployment Complete"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Service:*\n$SERVICE"
        },
        {
          "type": "mrkdwn",
          "text": "*Branch:*\n$BRANCH"
        },
        {
          "type": "mrkdwn",
          "text": "*Commit:*\n$COMMIT_SHA"
        },
        {
          "type": "mrkdwn",
          "text": "*Message:*\n$COMMIT_MSG"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<$SERVICE_URL|🌐 View Service> | <https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e|📊 Notion>"
      }
    }
  ]
}
EOF

  echo "✅ Slack notification sent"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo "📊 Notion: https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e"
echo ""
echo "Next steps:"
echo "  1. Test at: $SERVICE_URL"
echo "  2. If tests pass: git checkout main && git merge $(git branch --show-current)"
echo ""
