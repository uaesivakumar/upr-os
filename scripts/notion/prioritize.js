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
// AI PRIORITIZATION ALGORITHM
// ============================================================================

/**
 * Calculate AI Score for a task (0-100)
 *
 * Formula:
 * AI Score = (Urgency * 30 + Impact * 25 + Ease * 20 + Dependencies * 15 + Context * 10) / 100
 *
 * Factors:
 * - Urgency: How time-sensitive is this task?
 * - Impact: What's the business value?
 * - Ease: How easy/quick to complete? (Quick wins score higher)
 * - Dependencies: Does it unblock other tasks?
 * - Context Relevance: Related to current sprint/focus?
 */
function calculateAIScore(task, allTasks, currentSprintId) {
  const urgency = calculateUrgency(task);
  const impact = calculateImpact(task);
  const ease = calculateEase(task);
  const dependencies = calculateDependencyScore(task, allTasks);
  const context = calculateContextRelevance(task, currentSprintId);

  const score = Math.round(
    (urgency * 0.30) +
    (impact * 0.25) +
    (ease * 0.20) +
    (dependencies * 0.15) +
    (context * 0.10)
  );

  return {
    total: Math.min(100, Math.max(0, score)),
    breakdown: {
      urgency: Math.round(urgency),
      impact: Math.round(impact),
      ease: Math.round(ease),
      dependencies: Math.round(dependencies),
      context: Math.round(context)
    }
  };
}

/**
 * Calculate Urgency Score (0-100)
 */
function calculateUrgency(task) {
  // Priority mapping
  const priorityScores = {
    'P0': 100,  // Critical - production down, security issue
    'P1': 80,   // High - blocking users, important feature
    'P2': 50,   // Medium - nice to have, non-blocking
    'P3': 20    // Low - future enhancement
  };

  let score = priorityScores[task.priority] || 50;

  // Boost if production-related
  const productionTags = ['production', 'critical', 'urgent', 'hotfix'];
  if (task.tags.some(tag => productionTags.includes(tag.toLowerCase()))) {
    score = Math.min(100, score + 20);
  }

  // Boost if bug vs feature
  if (task.type === 'Bug') {
    score = Math.min(100, score + 15);
  }

  return score;
}

/**
 * Calculate Impact Score (0-100)
 */
function calculateImpact(task) {
  // Type impact mapping
  const typeImpact = {
    'Bug': 80,          // Bugs affect existing users
    'Feature': 70,      // Features add value
    'Tech Debt': 60,    // Tech debt improves quality
    'Docs': 40,         // Docs help but indirect
    'Research': 30      // Research is exploratory
  };

  let score = typeImpact[task.type] || 50;

  // Boost based on priority (priority indicates business value)
  if (task.priority === 'P0') score = Math.min(100, score + 20);
  if (task.priority === 'P1') score = Math.min(100, score + 10);

  // Boost for user-facing features
  const userFacingTags = ['frontend', 'ux', 'ui', 'user'];
  if (task.tags.some(tag => userFacingTags.includes(tag.toLowerCase()))) {
    score = Math.min(100, score + 10);
  }

  // Boost for backend infrastructure
  const backendTags = ['backend', 'api', 'database', 'infrastructure'];
  if (task.tags.some(tag => backendTags.includes(tag.toLowerCase()))) {
    score = Math.min(100, score + 15);
  }

  return score;
}

/**
 * Calculate Ease Score (0-100)
 * Higher score = easier/quicker to complete (Quick Wins!)
 */
function calculateEase(task) {
  // ETA-based scoring (inverse - shorter = higher score)
  if (task.eta <= 1) return 100;      // < 1 hour = super quick
  if (task.eta <= 2) return 90;       // 1-2 hours = quick win
  if (task.eta <= 4) return 70;       // 2-4 hours = manageable
  if (task.eta <= 8) return 50;       // Half day
  if (task.eta <= 16) return 30;      // 1-2 days
  return 10;                          // > 2 days = complex

  // Note: We prefer quick wins for momentum
}

/**
 * Calculate Dependency Score (0-100)
 * Higher score = unblocks more tasks
 */
function calculateDependencyScore(task, allTasks) {
  // Count how many tasks depend on this one
  const taskId = task.id;
  const blockedCount = allTasks.filter(t =>
    t.dependencies && t.dependencies.includes(taskId)
  ).length;

  // Score based on number of blocked tasks
  if (blockedCount >= 5) return 100;  // Unblocks 5+ tasks
  if (blockedCount >= 3) return 80;   // Unblocks 3-4 tasks
  if (blockedCount >= 2) return 60;   // Unblocks 2 tasks
  if (blockedCount >= 1) return 40;   // Unblocks 1 task
  return 20;                          // Doesn't unblock anything
}

/**
 * Calculate Context Relevance (0-100)
 * Higher score = related to current sprint/focus
 */
function calculateContextRelevance(task, currentSprintId) {
  let score = 50;  // Default: somewhat relevant

  // If task is in current sprint
  if (task.sprint === currentSprintId) {
    score = 100;
  }

  // If task is in backlog but high priority
  if (!task.sprint && (task.priority === 'P0' || task.priority === 'P1')) {
    score = 80;
  }

  // If task is in future sprint
  if (task.sprint && task.sprint !== currentSprintId) {
    score = 30;
  }

  // Boost for sprint-related tags
  const sprintTags = ['sprint', 'current', 'focus'];
  if (task.tags.some(tag => sprintTags.some(st => tag.toLowerCase().includes(st)))) {
    score = Math.min(100, score + 20);
  }

  return score;
}

// ============================================================================
// NOTION OPERATIONS
// ============================================================================

/**
 * Fetch all open work items from Notion
 */
async function fetchWorkItems() {
  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        property: "Status",
        select: {
          does_not_equal: "Done"
        }
      }
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
        tags: props.Tags?.multi_select?.map(t => t.name) || [],
        dependencies: props.Dependencies?.relation?.map(d => d.id) || [],
        sprint: props.Sprint?.relation?.[0]?.id || null,
        currentAIScore: props["AI Score"]?.number || 0
      };
    });
  } catch (error) {
    console.error("Error fetching work items:", error.message);
    throw error;
  }
}

/**
 * Update AI Score in Notion
 */
async function updateAIScore(taskId, score) {
  try {
    await notion.pages.update({
      page_id: taskId,
      properties: {
        "AI Score": { number: score }
      }
    });
  } catch (error) {
    console.error(`Error updating AI score for ${taskId}:`, error.message);
  }
}

/**
 * Get current sprint ID (latest sprint in Journal)
 */
async function getCurrentSprintId() {
  try {
    const JOURNAL_DB = process.env.JOURNAL_DB_ID;
    if (!JOURNAL_DB) return null;

    const response = await notion.databases.query({
      database_id: JOURNAL_DB,
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 1
    });

    return response.results[0]?.id || null;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// MAIN PRIORITIZATION FUNCTION
// ============================================================================

async function runPrioritization() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🤖 AI Task Prioritization Engine");
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

  console.log("📡 Fetching work items from Notion...");
  const tasks = await fetchWorkItems();
  console.log(`📝 Found ${tasks.length} open task(s)`);
  console.log("");

  if (tasks.length === 0) {
    console.log("✨ No open tasks - you're all caught up!");
    return;
  }

  // Get current sprint
  const currentSprintId = await getCurrentSprintId();
  console.log(`🎯 Current Sprint: ${currentSprintId ? 'Detected' : 'None'}`);
  console.log("");

  // Calculate AI scores
  console.log("🧮 Calculating AI scores...");
  const scoredTasks = tasks.map(task => {
    const score = calculateAIScore(task, tasks, currentSprintId);
    return { ...task, aiScore: score };
  });

  // Sort by AI score
  scoredTasks.sort((a, b) => b.aiScore.total - a.aiScore.total);

  // Update scores in Notion
  console.log("📤 Updating Notion with AI scores...");
  let updated = 0;
  let unchanged = 0;

  for (const task of scoredTasks) {
    // Only update if score changed significantly (±5 points)
    if (Math.abs(task.aiScore.total - task.currentAIScore) >= 5) {
      await updateAIScore(task.id, task.aiScore.total);
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`  ✓ Updated: ${updated}`);
  console.log(`  • Unchanged: ${unchanged}`);
  console.log("");

  // Display top 10 recommendations
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Top 10 Recommended Tasks");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  scoredTasks.slice(0, 10).forEach((task, index) => {
    const { total, breakdown } = task.aiScore;

    console.log(`${index + 1}. [${task.priority}] ${task.name}`);
    console.log(`   AI Score: ${total}/100`);
    console.log(`   Breakdown: Urgency=${breakdown.urgency}, Impact=${breakdown.impact}, Ease=${breakdown.ease}, Deps=${breakdown.dependencies}, Context=${breakdown.context}`);
    console.log(`   ETA: ${task.eta}h | Status: ${task.status}`);

    // Add reasoning
    let reason = "";
    if (breakdown.urgency >= 80) reason = "⚠️ High urgency";
    else if (breakdown.ease >= 90) reason = "⚡ Quick win";
    else if (breakdown.dependencies >= 80) reason = "🔓 Unblocks others";
    else if (breakdown.impact >= 80) reason = "💎 High impact";

    if (reason) console.log(`   ${reason}`);
    console.log("");
  });

  // Summary statistics
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Prioritization Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const avgScore = scoredTasks.reduce((sum, t) => sum + t.aiScore.total, 0) / scoredTasks.length;
  const highPriority = scoredTasks.filter(t => t.aiScore.total >= 80).length;
  const quickWins = scoredTasks.filter(t => t.aiScore.breakdown.ease >= 90).length;
  const blockers = scoredTasks.filter(t => t.aiScore.breakdown.dependencies >= 80).length;

  console.log(`Average AI Score: ${avgScore.toFixed(1)}/100`);
  console.log(`High Priority Tasks (≥80): ${highPriority}`);
  console.log(`Quick Wins (≤2h): ${quickWins}`);
  console.log(`Blockers (Unblocking others): ${blockers}`);
  console.log("");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Prioritization complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("💡 Next steps:");
  console.log("   • Run 'npm run ai:suggest' to get next task recommendation");
  console.log("   • Run 'npm run todo:sync' to update TODO.md");
  console.log("   • View updated scores in Notion Work Items database");
}

// Run
runPrioritization().catch(console.error);
