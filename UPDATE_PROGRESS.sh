#!/bin/bash

################################################################################
# UPR Progress Tracker Update Script
#
# Purpose: Automatically parse CHECKPOINT.md and update PROGRESS_TRACKER.md
# Usage: ./UPDATE_PROGRESS.sh
# Frequency: Run weekly (every Friday after sprint)
#
# What it does:
# 1. Parse CHECKPOINT.md for phase completion status
# 2. Calculate overall completion percentage
# 3. Generate visual progress bars
# 4. Update PROGRESS_TRACKER.md
# 5. Display summary in terminal
################################################################################

set -e # Exit on error

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# File paths
CHECKPOINT_FILE="progress/docs/CHECKPOINT.md"
TRACKER_FILE="progress/docs/PROGRESS_TRACKER.md"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       UPR PROGRESS TRACKER UPDATE SCRIPT                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if CHECKPOINT.md exists
if [ ! -f "$CHECKPOINT_FILE" ]; then
    echo -e "${RED}❌ ERROR: CHECKPOINT.md not found at $CHECKPOINT_FILE${NC}"
    echo "Please ensure you're running this from the UPR project root."
    exit 1
fi

echo -e "${BLUE}📖 Reading CHECKPOINT.md...${NC}"
echo ""

################################################################################
# PHASE COMPLETION PARSING
################################################################################

# Extract phase completion percentages from CHECKPOINT.md
# Expected format in CHECKPOINT.md:
# ### Phase 0: Foundation ✅
# - **Completion:** 100%

parse_phase_completion() {
    local phase_name=$1
    local completion=$(grep -A 3 "### Phase $phase_name:" "$CHECKPOINT_FILE" | grep -E "Completion:|Status:" | head -1 | grep -oE '[0-9]+%' | grep -oE '[0-9]+' || echo "0")
    echo "$completion"
}

# Parse all 9 phases (0-8)
PHASE_0_COMPLETION=$(parse_phase_completion "0")
PHASE_1_COMPLETION=$(parse_phase_completion "1")
PHASE_2_COMPLETION=$(parse_phase_completion "2")
PHASE_3_COMPLETION=$(parse_phase_completion "3")
PHASE_4_COMPLETION=$(parse_phase_completion "4")
PHASE_5_COMPLETION=$(parse_phase_completion "5")
PHASE_6_COMPLETION=$(parse_phase_completion "6")
PHASE_7_COMPLETION=$(parse_phase_completion "7")
PHASE_8_COMPLETION=$(parse_phase_completion "8")

# Calculate overall completion (average of all phases)
TOTAL_PHASES=9
OVERALL_COMPLETION=$(( ($PHASE_0_COMPLETION + $PHASE_1_COMPLETION + $PHASE_2_COMPLETION + $PHASE_3_COMPLETION + $PHASE_4_COMPLETION + $PHASE_5_COMPLETION + $PHASE_6_COMPLETION + $PHASE_7_COMPLETION + $PHASE_8_COMPLETION) / $TOTAL_PHASES ))

echo -e "${GREEN}✅ Phase Completion Parsed:${NC}"
echo "   Phase 0: ${PHASE_0_COMPLETION}%"
echo "   Phase 1: ${PHASE_1_COMPLETION}%"
echo "   Phase 2: ${PHASE_2_COMPLETION}%"
echo "   Phase 3: ${PHASE_3_COMPLETION}%"
echo "   Phase 4: ${PHASE_4_COMPLETION}%"
echo "   Phase 5: ${PHASE_5_COMPLETION}%"
echo "   Phase 6: ${PHASE_6_COMPLETION}%"
echo "   Phase 7: ${PHASE_7_COMPLETION}%"
echo "   Phase 8: ${PHASE_8_COMPLETION}%"
echo ""
echo "   📊 Overall Completion: ${OVERALL_COMPLETION}%"
echo ""

################################################################################
# PROGRESS BAR GENERATION
################################################################################

generate_progress_bar() {
    local percentage=$1
    local bar_length=40
    local filled=$(( $percentage * $bar_length / 100 ))
    local empty=$(( $bar_length - $filled ))

    local bar=""
    for ((i=0; i<$filled; i++)); do
        bar+="█"
    done
    for ((i=0; i<$empty; i++)); do
        bar+="░"
    done

    echo "$bar"
}

OVERALL_BAR=$(generate_progress_bar $OVERALL_COMPLETION)
PHASE_0_BAR=$(generate_progress_bar $PHASE_0_COMPLETION)
PHASE_1_BAR=$(generate_progress_bar $PHASE_1_COMPLETION)
PHASE_2_BAR=$(generate_progress_bar $PHASE_2_COMPLETION)
PHASE_3_BAR=$(generate_progress_bar $PHASE_3_COMPLETION)
PHASE_4_BAR=$(generate_progress_bar $PHASE_4_COMPLETION)
PHASE_5_BAR=$(generate_progress_bar $PHASE_5_COMPLETION)
PHASE_6_BAR=$(generate_progress_bar $PHASE_6_COMPLETION)
PHASE_7_BAR=$(generate_progress_bar $PHASE_7_COMPLETION)
PHASE_8_BAR=$(generate_progress_bar $PHASE_8_COMPLETION)

################################################################################
# STATUS EMOJI DETERMINATION
################################################################################

get_status_emoji() {
    local completion=$1
    if [ $completion -eq 100 ]; then
        echo "✅"
    elif [ $completion -gt 0 ]; then
        echo "🔄"
    else
        echo "⏸️"
    fi
}

PHASE_0_STATUS=$(get_status_emoji $PHASE_0_COMPLETION)
PHASE_1_STATUS=$(get_status_emoji $PHASE_1_COMPLETION)
PHASE_2_STATUS=$(get_status_emoji $PHASE_2_COMPLETION)
PHASE_3_STATUS=$(get_status_emoji $PHASE_3_COMPLETION)
PHASE_4_STATUS=$(get_status_emoji $PHASE_4_COMPLETION)
PHASE_5_STATUS=$(get_status_emoji $PHASE_5_COMPLETION)
PHASE_6_STATUS=$(get_status_emoji $PHASE_6_COMPLETION)
PHASE_7_STATUS=$(get_status_emoji $PHASE_7_COMPLETION)
PHASE_8_STATUS=$(get_status_emoji $PHASE_8_COMPLETION)

################################################################################
# TERMINAL OUTPUT (SUMMARY)
################################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           UPR PROJECT PROGRESS SUMMARY                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "OVERALL COMPLETION: ${OVERALL_COMPLETION}% ${OVERALL_BAR}"
echo ""
echo "PHASE BREAKDOWN:"
echo "├─ Phase 0: Foundation          [${PHASE_0_BAR}] ${PHASE_0_COMPLETION}% ${PHASE_0_STATUS}"
echo "├─ Phase 1: Discovery           [${PHASE_1_BAR}] ${PHASE_1_COMPLETION}% ${PHASE_1_STATUS}"
echo "├─ Phase 2: Enrichment          [${PHASE_2_BAR}] ${PHASE_2_COMPLETION}% ${PHASE_2_STATUS}"
echo "├─ Phase 3: Signals             [${PHASE_3_BAR}] ${PHASE_3_COMPLETION}% ${PHASE_3_STATUS}"
echo "├─ Phase 4: Outreach            [${PHASE_4_BAR}] ${PHASE_4_COMPLETION}% ${PHASE_4_STATUS}"
echo "├─ Phase 5: Follow-Ups          [${PHASE_5_BAR}] ${PHASE_5_COMPLETION}% ${PHASE_5_STATUS}"
echo "├─ Phase 6: Dashboard           [${PHASE_6_BAR}] ${PHASE_6_COMPLETION}% ${PHASE_6_STATUS}"
echo "├─ Phase 7: Learning            [${PHASE_7_BAR}] ${PHASE_7_COMPLETION}% ${PHASE_7_STATUS}"
echo "└─ Phase 8: Scale               [${PHASE_8_BAR}] ${PHASE_8_COMPLETION}% ${PHASE_8_STATUS}"
echo ""

################################################################################
# PARSE BLOCKERS FROM CHECKPOINT.md
################################################################################

echo -e "${BLUE}🚧 Checking for blockers...${NC}"
BLOCKERS=$(grep -A 10 "## What's Blocked" "$CHECKPOINT_FILE" | grep "^\- " | head -5 || echo "")

if [ -z "$BLOCKERS" ]; then
    echo -e "${GREEN}   ✅ No blockers detected${NC}"
else
    echo -e "${YELLOW}   ⚠️  Blockers found:${NC}"
    echo "$BLOCKERS" | sed 's/^/   /'
fi
echo ""

################################################################################
# CALCULATE VELOCITY
################################################################################

# Count completed deliverables (tasks marked with [x] in CHECKPOINT.md)
COMPLETED_DELIVERABLES=$(grep -c "\[x\]" "$CHECKPOINT_FILE" || echo "0")
PENDING_DELIVERABLES=$(grep -c "\[ \]" "$CHECKPOINT_FILE" || echo "0")
TOTAL_DELIVERABLES=$(( $COMPLETED_DELIVERABLES + $PENDING_DELIVERABLES ))

if [ $TOTAL_DELIVERABLES -gt 0 ]; then
    COMPLETION_RATE=$(( $COMPLETED_DELIVERABLES * 100 / $TOTAL_DELIVERABLES ))
else
    COMPLETION_RATE=0
fi

echo -e "${BLUE}📈 Velocity Metrics:${NC}"
echo "   Completed Deliverables: $COMPLETED_DELIVERABLES"
echo "   Pending Deliverables: $PENDING_DELIVERABLES"
echo "   Completion Rate: $COMPLETION_RATE%"
echo ""

################################################################################
# HEALTH CHECK
################################################################################

# Determine overall health
if [ $OVERALL_COMPLETION -ge 80 ]; then
    HEALTH_STATUS="${GREEN}🟢 EXCELLENT${NC}"
elif [ $OVERALL_COMPLETION -ge 60 ]; then
    HEALTH_STATUS="${GREEN}🟢 ON TRACK${NC}"
elif [ $OVERALL_COMPLETION -ge 40 ]; then
    HEALTH_STATUS="${YELLOW}🟡 NEEDS ATTENTION${NC}"
else
    HEALTH_STATUS="${YELLOW}🟡 EARLY STAGE${NC}"
fi

echo -e "PROJECT HEALTH: $HEALTH_STATUS"
echo ""

################################################################################
# OPTIONAL: UPDATE PROGRESS_TRACKER.MD
################################################################################

echo -e "${BLUE}📝 Would you like to update PROGRESS_TRACKER.md with latest data? (y/n)${NC}"
read -r UPDATE_TRACKER

if [ "$UPDATE_TRACKER" = "y" ] || [ "$UPDATE_TRACKER" = "Y" ]; then
    echo -e "${BLUE}   Updating PROGRESS_TRACKER.md...${NC}"

    # Update last updated timestamp
    CURRENT_DATE=$(date -u +"%B %d, %Y %H:%M UTC")

    # Replace overall completion in PROGRESS_TRACKER.md
    # This is a simplified update - for production, you'd use more robust text replacement

    if [ -f "$TRACKER_FILE" ]; then
        # Backup original
        cp "$TRACKER_FILE" "${TRACKER_FILE}.bak"

        # Update last updated date (simplified - just replace the line)
        sed -i.tmp "s/Last Updated:.*/Last Updated: $CURRENT_DATE/" "$TRACKER_FILE"

        # Update overall completion percentage (look for pattern)
        sed -i.tmp "s/OVERALL COMPLETION: [0-9]*%/OVERALL COMPLETION: ${OVERALL_COMPLETION}%/" "$TRACKER_FILE"

        # Clean up temp files
        rm -f "${TRACKER_FILE}.tmp"

        echo -e "${GREEN}   ✅ PROGRESS_TRACKER.md updated successfully${NC}"
        echo -e "   Backup saved to: ${TRACKER_FILE}.bak"
    else
        echo -e "${YELLOW}   ⚠️  PROGRESS_TRACKER.md not found${NC}"
    fi
else
    echo -e "${YELLOW}   ⏭️  Skipping PROGRESS_TRACKER.md update${NC}"
fi

echo ""

################################################################################
# NEXT STEPS REMINDER
################################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  NEXT STEPS                                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "1. Review PROGRESS_TRACKER.md for detailed breakdown"
echo "2. Update CHECKPOINT.md with this week's progress"
echo "3. Run this script again next Friday"
echo "4. Share summary with team via Slack/email"
echo ""
echo -e "${GREEN}✨ Progress update complete!${NC}"
echo ""

exit 0
