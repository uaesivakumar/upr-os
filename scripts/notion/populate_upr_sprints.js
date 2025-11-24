import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ---------- CONFIGURATION ----------
// Add your database IDs here after running create_upr_roadmap.js
const MODULES_DB_ID = process.env.MODULES_DB_ID || "YOUR_MODULES_DB_ID";
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID || "YOUR_WORK_ITEMS_DB_ID";
const JOURNAL_DB_ID = process.env.JOURNAL_DB_ID || "YOUR_JOURNAL_DB_ID";

// ---------- SPRINT DATA ----------
const SPRINTS_DATA = {
  // Sprint 6: Q-Score & Signal Processing
  sprint6: {
    module: "Signal Intelligence",
    items: [
      {
        name: "Implement Q-Score calculation system",
        type: "Feature",
        priority: "High",
        complexity: "High",
        status: "Done",
        eta: 8,
      },
      {
        name: "Fix signal type case-sensitivity bug",
        type: "Bug Fix",
        priority: "Critical",
        complexity: "Low",
        status: "Done",
        eta: 2,
      },
      {
        name: "Separate signal query from upsert logic",
        type: "Enhancement",
        priority: "High",
        complexity: "Medium",
        status: "Done",
        eta: 4,
      },
    ],
    journal: {
      highlights: "Q-Score now working with database signals, fixed critical bugs",
      outcomes: "Signal processing is now more reliable and accurate",
      learnings: "Case-insensitive comparisons are critical for robust data processing",
    },
  },

  // Sprint 7-13: Add your data here
  // sprint7: { ... },
  // sprint8: { ... },
};

async function populateSprint(sprintNumber, sprintData) {
  console.log(`\n📝 Populating Sprint ${sprintNumber}...`);

  try {
    // Create work items for this sprint
    for (const item of sprintData.items) {
      await notion.pages.create({
        parent: { database_id: WORK_ITEMS_DB_ID },
        properties: {
          Name: { title: [{ text: { content: item.name } }] },
          Sprint: { number: sprintNumber },
          Type: { select: { name: item.type } },
          Priority: { select: { name: item.priority } },
          Complexity: { select: { name: item.complexity } },
          Status: { select: { name: item.status } },
          ETA: { number: item.eta },
        },
      });
      console.log(`  ✓ Created: ${item.name}`);
    }

    // Create journal entry for this sprint
    if (sprintData.journal) {
      await notion.pages.create({
        parent: { database_id: JOURNAL_DB_ID },
        properties: {
          Sprint: { title: [{ text: { content: `Sprint ${sprintNumber}` } }] },
          Date: { date: { start: new Date().toISOString().split("T")[0] } },
          Highlights: {
            rich_text: [{ text: { content: sprintData.journal.highlights || "" } }],
          },
          Outcomes: {
            rich_text: [{ text: { content: sprintData.journal.outcomes || "" } }],
          },
          Learnings: {
            rich_text: [{ text: { content: sprintData.journal.learnings || "" } }],
          },
        },
      });
      console.log(`  ✓ Created journal entry`);
    }

    console.log(`✅ Sprint ${sprintNumber} populated successfully`);
  } catch (error) {
    console.error(`❌ Error populating Sprint ${sprintNumber}:`, error.message);
  }
}

async function populateAllSprints() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 Populating UPR Sprint Data...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Validate database IDs
  if (MODULES_DB_ID.startsWith("YOUR_") || WORK_ITEMS_DB_ID.startsWith("YOUR_")) {
    console.error("\n❌ Error: Database IDs not configured!");
    console.error("\n📝 Steps to fix:");
    console.error("   1. Run create_upr_roadmap.js first");
    console.error("   2. Copy the database IDs from the output");
    console.error("   3. Set them as environment variables:");
    console.error("      export MODULES_DB_ID='your_modules_db_id'");
    console.error("      export WORK_ITEMS_DB_ID='your_work_items_db_id'");
    console.error("      export JOURNAL_DB_ID='your_journal_db_id'");
    console.error("\n   Or add them to your .env file");
    return;
  }

  // Populate Sprint 6
  await populateSprint(6, SPRINTS_DATA.sprint6);

  // Add more sprints here as you define them
  // await populateSprint(7, SPRINTS_DATA.sprint7);
  // await populateSprint(8, SPRINTS_DATA.sprint8);
  // ...

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All sprints populated successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n➡️  Open Notion to view your roadmap");
}

populateAllSprints();
