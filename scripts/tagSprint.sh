#!/bin/bash

# Tag Sprint Script
# Usage: bash scripts/tagSprint.sh <sprint_number> <sprint_summary>
# Example: bash scripts/tagSprint.sh 16 "SIVA Phase 2 - 100% MCP"

SPRINT_NUM=$1
SPRINT_SUMMARY=$2

if [ -z "$SPRINT_NUM" ]; then
  echo "❌ Error: Sprint number required"
  echo "Usage: bash scripts/tagSprint.sh <sprint_number> <summary>"
  exit 1
fi

if [ -z "$SPRINT_SUMMARY" ]; then
  echo "❌ Error: Sprint summary required"
  echo "Usage: bash scripts/tagSprint.sh <sprint_number> <summary>"
  exit 1
fi

TAG_NAME="sprint-${SPRINT_NUM}"

# Check if tag already exists
if git tag -l "$TAG_NAME" | grep -q "$TAG_NAME"; then
  echo "⚠️  Warning: Tag $TAG_NAME already exists"
  echo "Delete it first: git tag -d $TAG_NAME"
  exit 1
fi

# Get latest commit
LATEST_COMMIT=$(git rev-parse --short HEAD)

# Get sprint stats from git log
COMMIT_COUNT=$(git log --oneline --grep="sprint" --grep="Sprint" -i | wc -l)

# Create annotated tag with detailed message
git tag -a "$TAG_NAME" -m "Sprint ${SPRINT_NUM}: ${SPRINT_SUMMARY}

Latest Commit: ${LATEST_COMMIT}
Commits in Sprint: ${COMMIT_COUNT}

Status: Closed ✅
Tagged: $(date '+%Y-%m-%d %H:%M:%S')

---
For rollback: git checkout ${TAG_NAME}
For details: git show ${TAG_NAME}
"

echo "✅ Created tag: $TAG_NAME"
echo "📍 Commit: $LATEST_COMMIT"
echo ""
echo "📤 Push tag to remote:"
echo "   git push origin $TAG_NAME"
echo ""
echo "🔄 Future rollback command:"
echo "   git checkout $TAG_NAME"
