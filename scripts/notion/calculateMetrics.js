import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Load environment variables
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const JOURNAL_DB = process.env.JOURNAL_DB_ID;
const MODULES_DB = process.env.MODULES_DB_ID;
const WORKITEMS_DB = process.env.WORK_ITEMS_DB_ID;

/**
 * Get commit count between two dates/tags
 */
function getCommitCount(since, until = 'HEAD') {
  try {
    const result = execSync(`git log --oneline ${since}..${until} | wc -l`).toString().trim();
    return parseInt(result, 10);
  } catch (error) {
    return 0;
  }
}

/**
 * Get commit range for a sprint
 */
function getCommitRange(sprint) {
  try {
    const commits = execSync(`git log --oneline -5 --grep="Sprint ${sprint}"`).toString().trim();
    if (!commits) return null;

    const lines = commits.split('\n');
    if (lines.length === 0) return null;

    const latest = lines[0].split(' ')[0];
    const oldest = lines[lines.length - 1].split(' ')[0];

    return {
      range: `${oldest}..${latest}`,
      count: lines.length
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate velocity metrics for a module
 */
async function calculateModuleVelocity(moduleId) {
  try {
    // Query work items for this module
    const response = await notion.databases.query({
      database_id: WORKITEMS_DB,
      filter: {
        property: "UPR Modules & Streams",
        relation: {
          contains: moduleId
        }
      }
    });

    const items = response.results;

    const completed = items.filter(item =>
      item.properties.Status?.select?.name === "Done"
    );

    const totalETA = completed.reduce((sum, item) =>
      sum + (item.properties.ETA?.number || 0), 0
    );

    const avgETA = completed.length > 0 ? totalETA / completed.length : 0;

    const bugs = completed.filter(item =>
      item.properties.Type?.select?.name === "Bug Fix"
    ).length;

    const features = completed.filter(item =>
      item.properties.Type?.select?.name === "Feature"
    ).length;

    return {
      completedItems: completed.length,
      avgETA,
      bugsFixed: bugs,
      featuresAdded: features
    };
  } catch (error) {
    console.error("Error calculating module velocity:", error.message);
    return null;
  }
}

/**
 * Update module with metrics
 */
async function updateModuleMetrics(modulePageId, metrics) {
  try {
    await notion.pages.update({
      page_id: modulePageId,
      properties: {
        "Last Updated": {
          date: { start: new Date().toISOString().split('T')[0] }
        },
        "Avg Completion Time": {
          number: Math.round(metrics.avgETA * 10) / 10
        },
        "Bugs Fixed": {
          number: metrics.bugsFixed
        },
        "Features Added": {
          number: metrics.featuresAdded
        }
      }
    });
  } catch (error) {
    console.error("Error updating module metrics:", error.message);
  }
}

/**
 * Update sprint with commit metrics
 */
async function updateSprintMetrics(sprintPageId, sprintNumber) {
  try {
    const commitInfo = getCommitRange(sprintNumber);

    const properties = {
      "Synced At": {
        date: { start: new Date().toISOString() }
      }
    };

    if (commitInfo) {
      properties["Commit Range"] = {
        rich_text: [{ text: { content: commitInfo.range } }]
      };
      properties["Commits Count"] = {
        number: commitInfo.count
      };
    }

    await notion.pages.update({
      page_id: sprintPageId,
      properties
    });
  } catch (error) {
    console.error("Error updating sprint metrics:", error.message);
  }
}

/**
 * Main metrics calculation
 */
async function calculateAndPushMetrics() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Calculating and Pushing Metrics...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Validate configuration
  if (!process.env.NOTION_TOKEN) {
    console.error("❌ Error: NOTION_TOKEN not found");
    process.exit(1);
  }

  // 1. Update Module Metrics
  console.log("📈 Calculating module velocity...");
  try {
    const modulesResponse = await notion.databases.query({
      database_id: MODULES_DB
    });

    for (const module of modulesResponse.results) {
      const moduleName = module.properties.Name?.title?.[0]?.text?.content || "Unknown";
      console.log(`  • ${moduleName}...`);

      const metrics = await calculateModuleVelocity(module.id);
      if (metrics) {
        await updateModuleMetrics(module.id, metrics);
        console.log(`    ✓ Completed: ${metrics.completedItems}, Bugs: ${metrics.bugsFixed}, Features: ${metrics.featuresAdded}`);
      }
    }
  } catch (error) {
    console.error("Error updating module metrics:", error.message);
  }

  console.log("");

  // 2. Update Sprint Commit Ranges
  console.log("📊 Updating sprint commit ranges...");
  try {
    const sprintsResponse = await notion.databases.query({
      database_id: JOURNAL_DB,
      sorts: [
        {
          property: "Sprint",
          direction: "descending"
        }
      ],
      page_size: 10 // Last 10 sprints
    });

    for (const sprint of sprintsResponse.results) {
      const sprintTitle = sprint.properties.Sprint?.title?.[0]?.text?.content || "";
      const sprintNumber = sprintTitle.replace("Sprint", "").trim();

      console.log(`  • Sprint ${sprintNumber}...`);
      await updateSprintMetrics(sprint.id, sprintNumber);
      console.log(`    ✓ Updated metrics and timestamp`);
    }
  } catch (error) {
    console.error("Error updating sprint metrics:", error.message);
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Metrics calculation complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("➡️  View updated metrics in Notion:");
  console.log("   https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e");
}

calculateAndPushMetrics().catch(console.error);
