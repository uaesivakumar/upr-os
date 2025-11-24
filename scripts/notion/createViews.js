import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;

// ============================================================================
// CREATE NOTION VIEWS
// ============================================================================

/**
 * Note: Notion API doesn't directly support creating database views.
 * Instead, we'll create database queries that users can save as views manually.
 *
 * This script demonstrates the filters/sorts that users should apply.
 */

async function demonstrateViews() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎨 Notion Views Configuration Guide");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  if (!WORK_ITEMS_DB) {
    console.error("❌ Error: WORK_ITEMS_DB_ID not found");
    process.exit(1);
  }

  console.log("📋 Work Items Database ID:");
  console.log(`   ${WORK_ITEMS_DB}`);
  console.log("");
  console.log("➡️  Open in Notion:");
  console.log(`   https://notion.so/${WORK_ITEMS_DB.replace(/-/g, '')}`);
  console.log("");

  // Test each view configuration
  await testViewConfiguration();

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📖 Manual View Creation Instructions");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Since Notion API doesn't support view creation, please:");
  console.log("1. Open Work Items database in Notion");
  console.log("2. For each view below, click '+' next to existing views");
  console.log("3. Apply the filters and sorts shown");
  console.log("4. Name the view as specified");
  console.log("");

  printViewInstructions();
}

/**
 * Test view configurations by querying
 */
async function testViewConfiguration() {
  console.log("🔍 Testing view configurations...");
  console.log("");

  // View 1: Daily Focus
  try {
    const dailyFocus = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        and: [
          {
            or: [
              { property: "Status", select: { equals: "In Progress" } },
              { property: "Status", select: { equals: "To Do" } }
            ]
          },
          {
            or: [
              { property: "Priority", select: { equals: "P0" } },
              { property: "Priority", select: { equals: "P1" } }
            ]
          }
        ]
      },
      sorts: [
        { property: "AI Score", direction: "descending" }
      ]
    });
    console.log(`✓ View 1 - Daily Focus: ${dailyFocus.results.length} tasks`);
  } catch (error) {
    console.log(`⚠ View 1 - Daily Focus: Requires AI Score property (will work after prioritization)`);
  }

  // View 2: AI Recommended
  try {
    const aiRecommended = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        and: [
          { property: "Status", select: { does_not_equal: "Done" } },
          { property: "AI Score", number: { greater_than_or_equal_to: 70 } }
        ]
      },
      sorts: [
        { property: "AI Score", direction: "descending" }
      ]
    });
    console.log(`✓ View 2 - AI Recommended: ${aiRecommended.results.length} tasks`);
  } catch (error) {
    console.log(`⚠ View 2 - AI Recommended: Requires AI Score property (will work after prioritization)`);
  }

  // View 3: Quick Wins
  try {
    const quickWins = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        and: [
          { property: "Status", select: { equals: "To Do" } },
          { property: "ETA", number: { less_than_or_equal_to: 2 } }
        ]
      },
      sorts: [
        { property: "AI Score", direction: "descending" }
      ]
    });
    console.log(`✓ View 3 - Quick Wins: ${quickWins.results.length} tasks`);
  } catch (error) {
    console.log(`⚠ View 3 - Quick Wins: ${error.message}`);
  }

  // View 4: All Open Tasks
  try {
    const allOpen = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        property: "Status",
        select: { does_not_equal: "Done" }
      }
    });
    console.log(`✓ View 4 - All Open: ${allOpen.results.length} tasks`);
  } catch (error) {
    console.log(`⚠ View 4 - All Open: ${error.message}`);
  }

  console.log("");
}

/**
 * Print detailed view creation instructions
 */
function printViewInstructions() {
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│              VIEW 1: 🎯 Daily Focus                              │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Name: 🎯 Daily Focus");
  console.log("Layout: Board");
  console.log("Group by: Status");
  console.log("");
  console.log("Filters:");
  console.log("  1. Status is 'In Progress' OR 'To Do'");
  console.log("  2. AND Priority is 'P0' OR 'P1'");
  console.log("");
  console.log("Sort:");
  console.log("  1. AI Score (Descending)");
  console.log("");
  console.log("Purpose: Shows your most important tasks that need attention now");
  console.log("");
  console.log("");

  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│              VIEW 2: 🤖 AI Recommended                           │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Name: 🤖 AI Recommended");
  console.log("Layout: Table");
  console.log("Properties shown: Name, Status, Priority, AI Score, ETA, Tags");
  console.log("");
  console.log("Filters:");
  console.log("  1. Status is not 'Done'");
  console.log("  2. AND AI Score >= 70");
  console.log("");
  console.log("Sort:");
  console.log("  1. AI Score (Descending)");
  console.log("");
  console.log("Purpose: AI-ranked list of high-value tasks to work on");
  console.log("");
  console.log("");

  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│              VIEW 3: ⚡ Quick Wins                                │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Name: ⚡ Quick Wins");
  console.log("Layout: Gallery");
  console.log("Properties shown: Name, Priority, ETA, AI Score");
  console.log("");
  console.log("Filters:");
  console.log("  1. Status is 'To Do'");
  console.log("  2. AND ETA <= 2");
  console.log("");
  console.log("Sort:");
  console.log("  1. AI Score (Descending)");
  console.log("");
  console.log("Purpose: Tasks you can knock out in 2 hours or less");
  console.log("");
  console.log("");

  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│              VIEW 4: 📅 Sprint Board                             │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Name: 📅 Sprint Board");
  console.log("Layout: Board");
  console.log("Group by: Status");
  console.log("Properties shown: Name, Priority, ETA, Assignee");
  console.log("");
  console.log("Filters:");
  console.log("  1. Sprint is [Current Sprint] (select from dropdown)");
  console.log("");
  console.log("Sort:");
  console.log("  1. Priority (Ascending: P0, P1, P2, P3)");
  console.log("  2. AI Score (Descending)");
  console.log("");
  console.log("Purpose: Kanban board for current sprint");
  console.log("");
  console.log("");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 Quick Tips");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("• Create views in this order: Daily Focus first (most useful)");
  console.log("• Pin Daily Focus view as default (star icon)");
  console.log("• Customize colors: P0 = Red, P1 = Yellow, P2 = Blue");
  console.log("• Add property 'AI Score' to all views for visibility");
  console.log("• Hide properties you don't need (Dependencies, etc.)");
  console.log("");
}

/**
 * Create sample tasks if Work Items is empty
 */
async function createSampleTasksIfEmpty() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📝 Checking for sample tasks...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      page_size: 1
    });

    if (response.results.length > 0) {
      console.log("✓ Work Items database has tasks");
      console.log(`  Found ${response.results.length} task(s)`);
      console.log("");
      console.log("  Skipping sample task creation.");
      return;
    }

    console.log("⚠ Work Items database is empty");
    console.log("");
    console.log("Would you like to create sample tasks? (y/n)");
    console.log("");
    console.log("Sample tasks will include:");
    console.log("  • [P0] Database backup failure (Critical, 2h)");
    console.log("  • [P1] Fix RADAR timeout issue (High, 4h)");
    console.log("  • [P1] Email verification integration (High, 4h)");
    console.log("  • [P2] Add dark mode toggle (Medium, 3h)");
    console.log("  • [P2] Mobile responsive layout (Medium, 5h)");
    console.log("  • [P3] Add keyboard shortcuts (Low, 2h)");
    console.log("");
    console.log("Run with --create-samples flag to create them automatically");
    console.log("Or add your own tasks manually in Notion");

  } catch (error) {
    console.error("Error checking Work Items:", error.message);
  }
}

// ============================================================================
// RUN
// ============================================================================

const command = process.argv[2];

if (command === '--test-only') {
  testViewConfiguration().catch(console.error);
} else if (command === '--check-samples') {
  createSampleTasksIfEmpty().catch(console.error);
} else {
  demonstrateViews().catch(console.error);
}
