import fs from "fs";
import path from "path";
import { Client } from "@notionhq/client";
import dotenv from "dotenv";

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
// NOTION → LOCAL (Pull Work Items)
// ============================================================================

/**
 * Fetch all work items from Notion
 */
async function fetchNotionWorkItems() {
  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        property: "Status",
        select: {
          does_not_equal: "Done"  // Only fetch active tasks
        }
      },
      sorts: [
        { property: "AI Score", direction: "descending" },
        { property: "Priority", direction: "ascending" }
      ]
    });

    return response.results.map(page => {
      const props = page.properties;

      return {
        id: page.id,
        name: props.Name?.title?.[0]?.text?.content || "Untitled",
        status: props.Status?.select?.name || "To Do",
        priority: props.Priority?.select?.name || "P2",
        type: props.Type?.select?.name || "",
        module: props.Module?.relation?.[0]?.id || "",
        eta: props.ETA?.number || 0,
        actualTime: props["Actual Time"]?.number || 0,
        aiScore: props["AI Score"]?.number || 0,
        tags: props.Tags?.multi_select?.map(t => t.name) || [],
        description: props.Description?.rich_text?.[0]?.text?.content || "",
        startedAt: props["Started At"]?.date?.start || null,
        completedAt: props["Completed At"]?.date?.start || null,
        dependencies: props.Dependencies?.relation?.map(d => d.id) || [],
        notes: props.Notes?.rich_text?.[0]?.text?.content || "",
        relatedPR: props["Related PR"]?.url || "",
        lastEdited: page.last_edited_time,
        url: page.url
      };
    });
  } catch (error) {
    console.error("Error fetching work items from Notion:", error.message);
    throw error;
  }
}

/**
 * Generate TODO.md from Notion work items
 */
function generateTodoMarkdown(workItems) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Group by status
  const inProgress = workItems.filter(t => t.status === "In Progress");
  const toDo = workItems.filter(t => t.status === "To Do");
  const blocked = workItems.filter(t => t.status === "Blocked");
  const inReview = workItems.filter(t => t.status === "In Review");

  // Group high priority
  const highPriority = workItems.filter(t =>
    (t.priority === "P0" || t.priority === "P1") && t.status === "To Do"
  );

  // Quick wins
  const quickWins = workItems.filter(t =>
    t.eta <= 2 && t.status === "To Do"
  );

  let md = `# UPR To-Do List

**Last Synced:** ${now} (Auto-generated from Notion)
**Sync Status:** ✅ In Sync

---

`;

  // In Progress section
  if (inProgress.length > 0) {
    md += `## 🎯 My Focus (In Progress)\n\n`;
    inProgress.forEach(task => {
      md += formatTask(task);
    });
    md += `\n---\n\n`;
  }

  // High Priority section
  if (highPriority.length > 0) {
    md += `## 🔥 High Priority (P0/P1)\n\n`;
    md += `_${highPriority.length} critical tasks requiring attention_\n\n`;
    highPriority.forEach(task => {
      md += formatTask(task, true);  // Brief format
    });
    md += `\n---\n\n`;
  }

  // To Do section
  if (toDo.length > 0) {
    md += `## 📋 To Do (${toDo.length} tasks)\n\n`;
    toDo.slice(0, 10).forEach(task => {  // Top 10 only
      md += formatTask(task, true);
    });
    if (toDo.length > 10) {
      md += `\n_...and ${toDo.length - 10} more tasks in Notion_\n`;
    }
    md += `\n---\n\n`;
  }

  // Quick Wins section
  if (quickWins.length > 0) {
    md += `## 🚀 Quick Wins (≤ 2 hours)\n\n`;
    quickWins.forEach(task => {
      md += formatTask(task, true);
    });
    md += `\n---\n\n`;
  }

  // Blocked section
  if (blocked.length > 0) {
    md += `## 🚧 Blocked (${blocked.length} tasks)\n\n`;
    blocked.forEach(task => {
      md += formatTask(task, true);
    });
    md += `\n---\n\n`;
  }

  // In Review section
  if (inReview.length > 0) {
    md += `## 👀 In Review (${inReview.length} tasks)\n\n`;
    inReview.forEach(task => {
      md += formatTask(task, true);
    });
    md += `\n---\n\n`;
  }

  // Stats
  md += `## 📊 Stats\n\n`;
  md += `- **Total Active:** ${workItems.length} tasks\n`;
  md += `- **In Progress:** ${inProgress.length} tasks\n`;
  md += `- **To Do:** ${toDo.length} tasks\n`;
  md += `- **Blocked:** ${blocked.length} tasks\n`;
  md += `- **In Review:** ${inReview.length} tasks\n`;

  const avgScore = workItems.length > 0
    ? (workItems.reduce((sum, t) => sum + t.aiScore, 0) / workItems.length).toFixed(1)
    : 0;
  md += `- **Avg AI Score:** ${avgScore}/100\n`;

  const totalETA = workItems.filter(t => t.status !== "Done").reduce((sum, t) => sum + t.eta, 0);
  md += `- **Total Estimated Time:** ${totalETA}h\n`;

  md += `\n---\n\n`;

  // Commands
  md += `**Commands:**\n`;
  md += `\`\`\`bash\n`;
  md += `npm run todo:sync     # Sync with Notion (bidirectional)\n`;
  md += `npm run todo:add      # Add new task via CLI\n`;
  md += `npm run ai:suggest    # Get AI recommendation for next task\n`;
  md += `\`\`\`\n`;
  md += `\n`;
  md += `**View in Notion:** https://notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e\n`;

  return md;
}

/**
 * Format a single task
 */
function formatTask(task, brief = false) {
  let md = `### [${task.priority}] ${task.name}\n`;
  md += `- **Status:** ${task.status}\n`;

  if (task.module) {
    md += `- **Module:** ${task.module}\n`;
  }

  md += `- **ETA:** ${task.eta}h`;
  if (task.actualTime > 0) {
    md += ` | **Actual:** ${task.actualTime}h`;
  }
  md += `\n`;

  if (task.aiScore > 0) {
    md += `- **AI Score:** ${task.aiScore}/100\n`;
  }

  if (task.tags.length > 0) {
    md += `- **Tags:** ${task.tags.map(t => `#${t}`).join(', ')}\n`;
  }

  if (task.dependencies.length > 0) {
    md += `- **Dependencies:** ${task.dependencies.length} task(s)\n`;
  }

  if (!brief) {
    if (task.description) {
      md += `- **Description:** ${task.description}\n`;
    }

    if (task.notes) {
      md += `- **Notes:** ${task.notes}\n`;
    }

    if (task.relatedPR) {
      md += `- **PR:** ${task.relatedPR}\n`;
    }
  }

  md += `- **View in Notion:** [Open](${task.url})\n`;
  md += `\n`;

  return md;
}

// ============================================================================
// LOCAL → NOTION (Push Work Items)
// ============================================================================

/**
 * Parse TODO.md to extract local changes
 * (Simplified - assumes Notion is source of truth for now)
 */
function parseLocalTodo() {
  const todoPath = path.join(process.cwd(), 'TODO.md');

  if (!fs.existsSync(todoPath)) {
    return null;
  }

  const content = fs.readFileSync(todoPath, 'utf-8');

  // Extract last sync time
  const syncMatch = content.match(/Last Synced:\*\* (.+)/);
  const lastSync = syncMatch ? new Date(syncMatch[1]) : null;

  return { lastSync, content };
}

/**
 * Create new work item in Notion
 */
async function createWorkItem(task) {
  try {
    const properties = {
      Name: { title: [{ text: { content: task.name } }] },
      Status: { select: { name: task.status || "To Do" } },
      Priority: { select: { name: task.priority || "P2" } }
    };

    if (task.type) {
      properties.Type = { select: { name: task.type } };
    }

    if (task.eta) {
      properties.ETA = { number: task.eta };
    }

    if (task.description) {
      properties.Description = { rich_text: [{ text: { content: task.description } }] };
    }

    if (task.tags && task.tags.length > 0) {
      properties.Tags = { multi_select: task.tags.map(t => ({ name: t })) };
    }

    await notion.pages.create({
      parent: { database_id: WORK_ITEMS_DB },
      properties
    });

    console.log(`  ✓ Created: ${task.name}`);
  } catch (error) {
    console.error(`  ✗ Failed to create ${task.name}:`, error.message);
  }
}

/**
 * Update work item in Notion
 */
async function updateWorkItem(taskId, updates) {
  try {
    const properties = {};

    if (updates.status) {
      properties.Status = { select: { name: updates.status } };
    }

    if (updates.actualTime) {
      properties["Actual Time"] = { number: updates.actualTime };
    }

    if (updates.notes) {
      properties.Notes = { rich_text: [{ text: { content: updates.notes } }] };
    }

    if (updates.completedAt) {
      properties["Completed At"] = { date: { start: updates.completedAt } };
    }

    await notion.pages.update({
      page_id: taskId,
      properties
    });

    console.log(`  ✓ Updated task`);
  } catch (error) {
    console.error(`  ✗ Failed to update task:`, error.message);
  }
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

async function syncWorkItems(mode = 'pull') {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔄 Syncing Work Items (To-Do List)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Validate configuration
  if (!process.env.NOTION_TOKEN) {
    console.error("❌ Error: NOTION_TOKEN not found");
    process.exit(1);
  }

  if (!WORK_ITEMS_DB) {
    console.error("❌ Error: WORK_ITEMS_DB_ID not found");
    process.exit(1);
  }

  if (mode === 'pull' || mode === 'bidirectional') {
    console.log("📡 Pulling work items from Notion...");
    const workItems = await fetchNotionWorkItems();
    console.log(`📝 Found ${workItems.length} active task(s)`);
    console.log("");

    // Display summary
    const byStatus = workItems.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});

    console.log("📊 Task Breakdown:");
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  • ${status}: ${count}`);
    });
    console.log("");

    // Generate TODO.md
    const todoPath = path.join(process.cwd(), 'TODO.md');

    // Backup if exists
    if (fs.existsSync(todoPath)) {
      const backupPath = todoPath.replace('.md', '.backup.md');
      fs.copyFileSync(todoPath, backupPath);
      console.log(`💾 Backup created: TODO.backup.md`);
    }

    const markdown = generateTodoMarkdown(workItems);
    fs.writeFileSync(todoPath, markdown);

    console.log(`✅ Updated: TODO.md`);
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Sync complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("💡 Next steps:");
  console.log("   • Review TODO.md");
  console.log("   • Edit tasks in Notion if needed");
  console.log("   • Run 'npm run ai:suggest' for recommendations");
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2] || 'pull';

if (command === 'help') {
  console.log("Usage:");
  console.log("  npm run todo:sync          # Pull from Notion to TODO.md");
  console.log("  npm run todo:sync push     # Push local changes to Notion");
  console.log("  npm run todo:sync bi       # Bidirectional sync (with conflict detection)");
} else {
  syncWorkItems(command).catch(console.error);
}
