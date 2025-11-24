import fs from "fs";
import path from "path";
import { Client } from "@notionhq/client";
import dotenv from "dotenv";

// Load environment variables from scripts/notion/.env
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // Try root .env
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;
const MODULES_DB = process.env.MODULES_DB_ID || process.env.NOTION_MODULES_DB;
const WORKITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;

// ============================================================================
// CHECKPOINT PARSER
// ============================================================================

/**
 * Parse UPR_CHECKPOINT.md to extract sprint data
 */
function extractSprintData(text) {
  const lines = text.split("\n");
  const data = [];
  let current = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("### Sprint")) {
      if (current.Sprint) data.push(current);
      const sprintNum = trimmed.replace("### Sprint", "").trim();
      current = { Sprint: sprintNum };
    } else if (trimmed.startsWith("- Branch:")) {
      current.Branch = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- Commit:")) {
      current.Commit = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- Highlights:")) {
      current.Highlights = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- Outcomes:")) {
      current.Outcomes = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- Learnings:")) {
      current.Learnings = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- Date:")) {
      current.Date = trimmed.split(":").slice(1).join(":").trim();
    }
  }

  if (current.Sprint) data.push(current);
  return data;
}

// ============================================================================
// NOTION OPERATIONS
// ============================================================================

/**
 * Find existing sprint entry in Notion by sprint number
 */
async function findExistingSprint(sprintNumber) {
  try {
    const response = await notion.databases.query({
      database_id: JOURNAL_DB,
      filter: {
        property: "Sprint",
        title: {
          equals: `Sprint ${sprintNumber}`
        }
      }
    });

    return response.results.length > 0 ? response.results[0] : null;
  } catch (error) {
    console.error(`Error finding sprint ${sprintNumber}:`, error.message);
    return null;
  }
}

/**
 * Create new sprint entry in Notion
 */
async function createSprint(entry) {
  const properties = {
    Sprint: { title: [{ text: { content: `Sprint ${entry.Sprint}` } }] },
    Date: { date: { start: entry.Date || new Date().toISOString().split("T")[0] } },
  };

  if (entry.Branch) {
    properties.Branch = { rich_text: [{ text: { content: entry.Branch } }] };
  }
  if (entry.Commit) {
    properties.Commit = { rich_text: [{ text: { content: entry.Commit } }] };
  }
  if (entry.Highlights) {
    properties.Highlights = { rich_text: [{ text: { content: entry.Highlights } }] };
  }
  if (entry.Outcomes) {
    properties.Outcomes = { rich_text: [{ text: { content: entry.Outcomes } }] };
  }
  if (entry.Learnings) {
    properties.Learnings = { rich_text: [{ text: { content: entry.Learnings } }] };
  }

  await notion.pages.create({
    parent: { database_id: JOURNAL_DB },
    properties,
  });
}

/**
 * Update existing sprint entry in Notion
 */
async function updateSprint(pageId, entry) {
  const properties = {
    Date: { date: { start: entry.Date || new Date().toISOString().split("T")[0] } },
  };

  if (entry.Branch) {
    properties.Branch = { rich_text: [{ text: { content: entry.Branch } }] };
  }
  if (entry.Commit) {
    properties.Commit = { rich_text: [{ text: { content: entry.Commit } }] };
  }
  if (entry.Highlights) {
    properties.Highlights = { rich_text: [{ text: { content: entry.Highlights } }] };
  }
  if (entry.Outcomes) {
    properties.Outcomes = { rich_text: [{ text: { content: entry.Outcomes } }] };
  }
  if (entry.Learnings) {
    properties.Learnings = { rich_text: [{ text: { content: entry.Learnings } }] };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}

/**
 * Upsert sprint entry (create if new, update if exists)
 */
async function upsertSprint(entry) {
  const sprintNumber = entry.Sprint;
  const existing = await findExistingSprint(sprintNumber);

  if (existing) {
    await updateSprint(existing.id, entry);
    console.log(`  ✓ Updated Sprint ${sprintNumber}`);
  } else {
    await createSprint(entry);
    console.log(`  ✓ Created Sprint ${sprintNumber}`);
  }
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

async function syncToNotion() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔁 Syncing UPR Sprint Data to Notion...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Validate configuration
  if (!process.env.NOTION_TOKEN) {
    console.error("❌ Error: NOTION_TOKEN not found in environment");
    console.error("   Please set it in scripts/notion/.env");
    process.exit(1);
  }

  if (!JOURNAL_DB) {
    console.error("❌ Error: JOURNAL_DB_ID not found in environment");
    console.error("   Please set it in scripts/notion/.env");
    process.exit(1);
  }

  // Find checkpoint file
  const checkpointPaths = [
    path.join(process.cwd(), 'UPR_SPRINT_LOG.md'),
    path.join(process.cwd(), 'UPR_CHECKPOINT.md'),
    path.join(process.cwd(), 'progress', 'UPR_CHECKPOINT.md'),
    path.join(process.cwd(), 'CHECKPOINT.md'),
  ];

  let checkpointPath = null;
  for (const p of checkpointPaths) {
    if (fs.existsSync(p)) {
      checkpointPath = p;
      break;
    }
  }

  if (!checkpointPath) {
    console.error("❌ Error: Checkpoint file not found");
    console.error("   Searched in:");
    checkpointPaths.forEach(p => console.error(`   - ${p}`));
    console.error("");
    console.error("💡 Create a checkpoint file with sprint data:");
    console.error("   npm run sprint:template");
    process.exit(1);
  }

  console.log(`📖 Reading: ${path.relative(process.cwd(), checkpointPath)}`);

  // Read and parse checkpoint
  const checkpoint = fs.readFileSync(checkpointPath, "utf-8");
  const sprints = extractSprintData(checkpoint);

  if (sprints.length === 0) {
    console.log("⚠️  No sprint data found in checkpoint file");
    console.log("   Make sure your file follows this format:");
    console.log("");
    console.log("   ### Sprint 11");
    console.log("   - Branch: feature/my-feature");
    console.log("   - Commit: abc123");
    console.log("   - Highlights: What was accomplished");
    console.log("   - Outcomes: What was delivered");
    console.log("   - Learnings: What was learned");
    console.log("");
    process.exit(0);
  }

  console.log(`📝 Found ${sprints.length} sprint(s) to sync`);
  console.log("");

  // Sync each sprint
  for (const sprint of sprints) {
    await upsertSprint(sprint);
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Sync complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("➡️  View in Notion:");
  console.log("   https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e");
}

// ============================================================================
// CLI HELPERS
// ============================================================================

/**
 * Close a sprint and sync to Notion
 */
async function closeSprint(sprintNumber) {
  console.log(`🔒 Closing Sprint ${sprintNumber}...`);
  console.log("");

  // Get current branch and latest commit
  const { execSync } = await import('child_process');
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const commit = execSync('git rev-parse --short HEAD').toString().trim();

  console.log(`📍 Current branch: ${branch}`);
  console.log(`📍 Latest commit: ${commit}`);
  console.log("");

  // Create sprint entry
  const entry = {
    Sprint: sprintNumber,
    Branch: branch,
    Commit: commit,
    Date: new Date().toISOString().split("T")[0],
    Highlights: `Sprint ${sprintNumber} completed`,
    Outcomes: `Work from ${branch} branch`,
    Learnings: `Commit: ${commit}`,
  };

  await upsertSprint(entry);

  console.log("");
  console.log(`✅ Sprint ${sprintNumber} closed and synced to Notion`);
}

// ============================================================================
// RUN
// ============================================================================

const command = process.argv[2];
const arg = process.argv[3];

if (command === 'close' && arg) {
  closeSprint(arg).catch(console.error);
} else if (command === 'sync' || !command) {
  syncToNotion().catch(console.error);
} else {
  console.log("Usage:");
  console.log("  npm run sprint:sync              # Sync checkpoint file to Notion");
  console.log("  npm run sprint:close <number>    # Close sprint and sync to Notion");
}
