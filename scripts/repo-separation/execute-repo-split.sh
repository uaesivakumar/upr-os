#!/bin/bash
# ============================================================================
# UPR REPO SEPARATION SCRIPT
# Phase-2 Preparation: OS Freeze + Legacy UI Archive
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPR_ROOT="/Users/skc/DataScience/upr"
BACKUP_ROOT="/Users/skc/DataScience/upr-legacy-ui-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "============================================================================"
echo "UPR REPO SEPARATION - Phase-2 Preparation"
echo "Timestamp: $TIMESTAMP"
echo "============================================================================"

# ============================================================================
# STEP 1: Create Legacy UI Backup Directory
# ============================================================================
echo ""
echo "STEP 1: Creating Legacy UI Backup Directory..."
echo "─────────────────────────────────────────────────"

mkdir -p "$BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/dashboard"
mkdir -p "$BACKUP_ROOT/routes-legacy"
mkdir -p "$BACKUP_ROOT/docs-legacy"
mkdir -p "$BACKUP_ROOT/scripts-legacy"

# ============================================================================
# STEP 1a: Move Dashboard (entire frontend) to backup
# ============================================================================
echo "  Moving dashboard/ to backup..."
if [ -d "$UPR_ROOT/dashboard" ]; then
  cp -R "$UPR_ROOT/dashboard" "$BACKUP_ROOT/"
  echo "  ✓ Dashboard copied to backup"
fi

# ============================================================================
# STEP 1b: Identify and move legacy route handlers
# ============================================================================
echo "  Identifying legacy routes..."

# These are page-serving routes (not OS API routes)
LEGACY_ROUTES=(
  "companies.js"
  "email.js"
  "campaignTypes.js"
  "experiments.js"
  "hiringEnrich.js"
  "hiringSignals.js"
  "hrLeads.js"
  "intelligence.js"
  "knowledgeGraph.js"
  "news.js"
)

for route in "${LEGACY_ROUTES[@]}"; do
  if [ -f "$UPR_ROOT/routes/$route" ]; then
    cp "$UPR_ROOT/routes/$route" "$BACKUP_ROOT/routes-legacy/"
    echo "  ✓ Backed up routes/$route"
  fi
done

# ============================================================================
# STEP 1c: Backup legacy documentation
# ============================================================================
echo "  Backing up legacy docs..."

LEGACY_DOCS=(
  "ML_IMPLEMENTATION.md"
  "ENTERPRISE_ML_FEATURES.md"
  "PATTERN_LEARNING_IMPLEMENTATION.md"
  "RADAR_TESTING.md"
  "TESTING_SCRIPTS_README.md"
)

for doc in "${LEGACY_DOCS[@]}"; do
  if [ -f "$UPR_ROOT/$doc" ]; then
    cp "$UPR_ROOT/$doc" "$BACKUP_ROOT/docs-legacy/"
    echo "  ✓ Backed up $doc"
  fi
done

# ============================================================================
# STEP 1d: Backup legacy test scripts
# ============================================================================
echo "  Backing up legacy test scripts..."

LEGACY_SCRIPTS=(
  "test_enrichment_flow.sh"
  "test_final_enrichment.sh"
  "test_radar_after_deploy.sh"
  "test_radar_fix.sh"
  "test_radar_sprint3.sh"
  "test-apollo-integration.js"
  "test-apollo-pattern-engine.js"
  "test-domain-pattern-discovery.js"
  "test-layer-minus-1-real-data.js"
  "test-new-pattern-learning.js"
  "test-simple-discovery.js"
  "run_first_discovery.sh"
  "run-serp-test.sh"
  "verify_radar_results.sh"
  "verify-pattern.js"
)

for script in "${LEGACY_SCRIPTS[@]}"; do
  if [ -f "$UPR_ROOT/$script" ]; then
    cp "$UPR_ROOT/$script" "$BACKUP_ROOT/scripts-legacy/"
    echo "  ✓ Backed up $script"
  fi
done

# ============================================================================
# STEP 1e: Create backup manifest
# ============================================================================
echo "  Creating backup manifest..."

cat > "$BACKUP_ROOT/MANIFEST.md" << 'MANIFEST_EOF'
# UPR Legacy UI Backup Manifest

## Backup Date
$(date)

## Purpose
This backup contains all legacy UI components, page-based routes, and old testing
scripts that are NOT part of the OS (Operating System) core.

## Contents

### /dashboard/
Complete React frontend from Phase-1 era including:
- Page-based UI screens (discovery, enrichment, hiring-signals)
- Old component library
- Legacy state management
- Old routing structure

### /routes-legacy/
Route handlers that serve UI pages or legacy API endpoints:
- companies.js - Old company management UI API
- email.js - Legacy email composition
- campaignTypes.js - Old campaign type management
- experiments.js - A/B testing UI
- hiringEnrich.js - Legacy hiring enrichment
- hiringSignals.js - Old hiring signals UI
- hrLeads.js - HR leads management
- intelligence.js - Old intelligence UI
- knowledgeGraph.js - Legacy knowledge graph
- news.js - News feed UI

### /docs-legacy/
Documentation for legacy features:
- ML_IMPLEMENTATION.md
- ENTERPRISE_ML_FEATURES.md
- PATTERN_LEARNING_IMPLEMENTATION.md
- RADAR_TESTING.md
- TESTING_SCRIPTS_README.md

### /scripts-legacy/
Old test and utility scripts

## Restoration
To restore any component, copy it back to the upr/ directory.
These files are NOT deleted from the main repo - only archived here.

## Note
The OS repo (upr-os) does NOT include these files.
The SaaS repo (premiumradar-saas) will have its own fresh UI.
MANIFEST_EOF

echo "  ✓ Manifest created"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "============================================================================"
echo "STEP 1 COMPLETE: Legacy UI Backup Created"
echo "============================================================================"
echo ""
echo "Backup Location: $BACKUP_ROOT"
echo ""
echo "Contents:"
find "$BACKUP_ROOT" -type f | wc -l | xargs echo "  Total files:"
du -sh "$BACKUP_ROOT" | awk '{print "  Total size: " $1}'
echo ""
echo "============================================================================"
