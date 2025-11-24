#!/bin/bash
#
# UPDATE NOTION - Single command to update both Sprints and Module Features
#
# Usage:
#   ./updateNotion.sh [sprint_number] [previous_sprint_number]
#
# Examples:
#   ./updateNotion.sh 31 30
#   ./updateNotion.sh 32 31
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}                        UPDATE NOTION${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create a .env file with NOTION_TOKEN"
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}📋 Loading environment variables...${NC}"
source .env

# Export NOTION_API_KEY from NOTION_TOKEN
if [ -z "$NOTION_TOKEN" ]; then
    echo -e "${RED}❌ Error: NOTION_TOKEN not set in .env${NC}"
    exit 1
fi

export NOTION_API_KEY=$NOTION_TOKEN
echo -e "${GREEN}✅ Environment variables loaded${NC}"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    exit 1
fi

# Get sprint numbers from arguments
SPRINT_NUMBER=${1:-31}
PREVIOUS_SPRINT=${2:-""}

echo -e "${BLUE}📋 Sprint Number: ${SPRINT_NUMBER}${NC}"
if [ -n "$PREVIOUS_SPRINT" ]; then
    echo -e "${BLUE}📋 Previous Sprint: ${PREVIOUS_SPRINT}${NC}"
fi
echo ""

# Run the complete Notion update
echo -e "${YELLOW}🚀 Running complete Notion update...${NC}"
echo ""

if [ -n "$PREVIOUS_SPRINT" ]; then
    node scripts/notion/updateNotionComplete.js "$SPRINT_NUMBER" "$PREVIOUS_SPRINT"
else
    node scripts/notion/updateNotionComplete.js "$SPRINT_NUMBER"
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "${GREEN}                    ✅ UPDATE NOTION COMPLETE${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo ""
    echo -e "${GREEN}Both Sprints and Module Features have been updated!${NC}"
    echo ""
    echo -e "${YELLOW}📌 Next steps:${NC}"
    echo "   1. Open Notion and verify the updates"
    echo "   2. Check that all columns are filled (including Git columns)"
    echo "   3. Verify Module Features are marked complete"
    echo ""
else
    echo -e "${RED}========================================================================${NC}"
    echo -e "${RED}                    ❌ UPDATE NOTION FAILED${NC}"
    echo -e "${RED}========================================================================${NC}"
    echo ""
    echo -e "${RED}Please review the errors above and try again.${NC}"
    echo ""
fi

exit $EXIT_CODE
