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
// FETCH & ANALYZE
// ============================================================================

/**
 * Fetch work items with AI scores
 */
async function fetchWorkItems() {
  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        and: [
          {
            property: "Status",
            select: {
              does_not_equal: "Done"
            }
          },
          {
            or: [
              { property: "Status", select: { equals: "To Do" } },
              { property: "Status", select: { equals: "In Progress" } }
            ]
          }
        ]
      },
      sorts: [
        { property: "AI Score", direction: "descending" }
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
        eta: props.ETA?.number || 4,
        actualTime: props["Actual Time"]?.number || 0,
        aiScore: props["AI Score"]?.number || 0,
        tags: props.Tags?.multi_select?.map(t => t.name) || [],
        dependencies: props.Dependencies?.relation?.map(d => d.id) || [],
        description: props.Description?.rich_text?.[0]?.text?.content || "",
        url: page.url
      };
    });
  } catch (error) {
    console.error("Error fetching work items:", error.message);
    throw error;
  }
}

/**
 * Generate recommendation reasoning
 */
function generateReasoning(task, alternatives) {
  const reasons = [];

  // Priority-based
  if (task.priority === 'P0') {
    reasons.push("🚨 **Critical priority** - Requires immediate attention");
  } else if (task.priority === 'P1') {
    reasons.push("⚠️ **High priority** - Important for current sprint");
  }

  // AI Score-based
  if (task.aiScore >= 90) {
    reasons.push("🤖 **Highest AI score** - Optimal choice based on multiple factors");
  } else if (task.aiScore >= 80) {
    reasons.push("🤖 **High AI score** - Strong recommendation");
  }

  // ETA-based (Quick wins)
  if (task.eta <= 2) {
    reasons.push("⚡ **Quick win** - Can be completed in ≤2 hours");
  }

  // Type-based
  if (task.type === 'Bug') {
    reasons.push("🐛 **Bug fix** - Improves existing functionality");
  }

  // Tag-based
  if (task.tags.some(t => t.toLowerCase().includes('urgent'))) {
    reasons.push("⏰ **Time-sensitive** - Marked as urgent");
  }

  if (task.tags.some(t => ['production', 'critical'].includes(t.toLowerCase()))) {
    reasons.push("🔥 **Production impact** - Affects live users");
  }

  // Dependency-based
  if (task.dependencies.length === 0) {
    reasons.push("✅ **No blockers** - Can start immediately");
  }

  // Comparison with alternatives
  if (alternatives.length > 0) {
    const secondBest = alternatives[0];
    const scoreDiff = task.aiScore - secondBest.aiScore;

    if (scoreDiff >= 10) {
      reasons.push(`📊 **Significantly better** than next option (+${scoreDiff} points)`);
    }
  }

  return reasons;
}

/**
 * Format task card
 */
function formatTaskCard(task, alternatives) {
  const reasons = generateReasoning(task, alternatives);

  let card = `
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 RECOMMENDED TASK                           │
└─────────────────────────────────────────────────────────────────┘

📋 Task: ${task.name}

📊 Details:
   • Priority: ${task.priority}
   • Type: ${task.type || 'Unspecified'}
   • Estimated Time: ${task.eta}h
   • AI Score: ${task.aiScore}/100
   • Status: ${task.status}
   ${task.tags.length > 0 ? `• Tags: ${task.tags.join(', ')}` : ''}

`;

  if (task.description) {
    card += `📝 Description:\n   ${task.description}\n\n`;
  }

  card += `💡 Why This Task?\n`;
  reasons.forEach(reason => {
    card += `   ${reason}\n`;
  });

  card += `\n🔗 View in Notion:\n   ${task.url}\n`;

  return card;
}

/**
 * Format alternatives
 */
function formatAlternatives(alternatives) {
  if (alternatives.length === 0) return '';

  let output = `
┌─────────────────────────────────────────────────────────────────┐
│                    🔄 ALTERNATIVE OPTIONS                        │
└─────────────────────────────────────────────────────────────────┘

`;

  alternatives.forEach((task, index) => {
    output += `${index + 2}. [${task.priority}] ${task.name}\n`;
    output += `   • AI Score: ${task.aiScore}/100\n`;
    output += `   • ETA: ${task.eta}h | Type: ${task.type}\n`;

    // Brief reasoning
    if (task.eta <= 2) {
      output += `   • ⚡ Quick win\n`;
    }
    if (task.priority === 'P0' || task.priority === 'P1') {
      output += `   • 🔥 High priority\n`;
    }

    output += `\n`;
  });

  return output;
}

/**
 * Format context summary
 */
function formatContext(inProgress, toDo) {
  return `
┌─────────────────────────────────────────────────────────────────┐
│                    📊 CURRENT CONTEXT                            │
└─────────────────────────────────────────────────────────────────┘

Work in Progress: ${inProgress.length} task(s)
${inProgress.map(t => `   • [${t.priority}] ${t.name} (${t.actualTime}h / ${t.eta}h)`).join('\n') || '   (none)'}

To Do: ${toDo.length} task(s) available

`;
}

// ============================================================================
// MAIN SUGGESTION FUNCTION
// ============================================================================

async function suggestNextTask() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🤖 AI Task Suggestion Engine");
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

  console.log("📡 Analyzing your task list...");
  const tasks = await fetchWorkItems();

  if (tasks.length === 0) {
    console.log("");
    console.log("✨ No open tasks - you're all caught up!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  // Group by status
  const inProgress = tasks.filter(t => t.status === "In Progress");
  const toDo = tasks.filter(t => t.status === "To Do");

  console.log(`📝 Found ${tasks.length} open task(s) (${inProgress.length} in progress, ${toDo.length} to do)`);
  console.log("");

  // Check if user has too many tasks in progress
  if (inProgress.length >= 3) {
    console.log("⚠️  WARNING: You have 3+ tasks in progress!");
    console.log("   Consider finishing one before starting another.\n");
    console.log("   Tasks in progress:");
    inProgress.forEach(t => {
      console.log(`   • [${t.priority}] ${t.name} (${t.actualTime}h / ${t.eta}h)`);
    });
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 Recommendation: Focus on completing existing work first");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  // If nothing to do
  if (toDo.length === 0) {
    console.log("✨ All tasks either completed or in progress!");
    console.log("");
    console.log("Current work:");
    inProgress.forEach(t => {
      console.log(`   • [${t.priority}] ${t.name} (${t.actualTime}h / ${t.eta}h)`);
    });
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  // Get top recommendation
  const recommended = toDo[0];  // Already sorted by AI Score
  const alternatives = toDo.slice(1, 4);  // Top 3 alternatives

  // Display context
  console.log(formatContext(inProgress, toDo));

  // Display recommendation
  console.log(formatTaskCard(recommended, alternatives));

  // Display alternatives
  if (alternatives.length > 0) {
    console.log(formatAlternatives(alternatives));
  }

  // Footer
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Ready to start working!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("💡 Next steps:");
  console.log("   • Open task in Notion and move to 'In Progress'");
  console.log("   • Create feature branch: git checkout -b feature/task-name");
  console.log("   • Start coding!");
  console.log("");
  console.log("   Or run 'npm run ai:prioritize' to recalculate scores first");
}

// Run
suggestNextTask().catch(console.error);
