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

const JOURNAL_DB = process.env.JOURNAL_DB_ID;
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID;

// Sprint 16 recommended tasks from handoff document
const SPRINT_16_TASKS = [
  // Priority 1: Enrichment Enhancements
  {
    name: "Email Verification Service Integration",
    priority: "P1",
    type: "Feature",
    eta: 5,
    tags: ["backend", "api", "sprint16", "enrichment"],
    description: "Integrate Hunter.io or ZeroBounce for email verification. Add deliverability scores to hr_leads table and update UI to show verified vs unverified emails.",
    status: "To Do"
  },
  {
    name: "Multi-Source Enrichment",
    priority: "P1",
    type: "Feature",
    eta: 7,
    tags: ["backend", "api", "sprint16", "enrichment"],
    description: "Add LinkedIn Sales Navigator integration and Clearbit fallback. Combine data from multiple sources for better lead quality.",
    status: "To Do"
  },
  {
    name: "Bulk Enrichment",
    priority: "P2",
    type: "Feature",
    eta: 5,
    tags: ["backend", "ui", "sprint16", "enrichment"],
    description: "Add batch processing to enrich multiple companies at once. Queue management for large batches with progress tracking UI.",
    status: "To Do"
  },

  // Priority 2: RADAR Expansion
  {
    name: "Automated RADAR Scheduling",
    priority: "P1",
    type: "Feature",
    eta: 4,
    tags: ["backend", "automation", "sprint16", "radar"],
    description: "Set up Cloud Scheduler to run RADAR daily. Configure source rotation (news, social, job boards) and email digest of new discoveries.",
    status: "To Do"
  },
  {
    name: "Additional Signal Sources - LinkedIn",
    priority: "P2",
    type: "Feature",
    eta: 7,
    tags: ["backend", "api", "sprint16", "radar"],
    description: "Add LinkedIn company updates as a signal source. Scrape company page updates and hiring announcements.",
    status: "To Do"
  },

  // Priority 3: Outreach Automation
  {
    name: "Email Campaign Builder",
    priority: "P2",
    type: "Feature",
    eta: 7,
    tags: ["frontend", "backend", "sprint16", "outreach"],
    description: "Template editor for outreach emails with variable substitution (company, name, signal details) and A/B testing capabilities.",
    status: "To Do"
  },

  // Priority 4: Analytics & Insights
  {
    name: "Company Intelligence Dashboard",
    priority: "P2",
    type: "Feature",
    eta: 7,
    tags: ["frontend", "sprint16", "analytics"],
    description: "Historical signal timeline, competitive analysis (who else is hiring in sector), and growth trajectory visualization.",
    status: "To Do"
  },

  // Quick wins
  {
    name: "API Rate Limiting",
    priority: "P1",
    type: "Tech Debt",
    eta: 2,
    tags: ["backend", "quick-win", "sprint16", "security"],
    description: "Add rate limiting middleware (express-rate-limit) to protect enrichment endpoints from abuse.",
    status: "To Do"
  },
  {
    name: "Database Indexing for Performance",
    priority: "P1",
    type: "Tech Debt",
    eta: 2,
    tags: ["database", "quick-win", "sprint16", "performance"],
    description: "Add indexes on hiring_signals.company, hr_leads.company_id, and hr_leads.job_id for faster lookups.",
    status: "To Do"
  }
];

async function startSprint16() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 Starting Sprint 16");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Step 1: Create Sprint 16 in Journal
  console.log("📝 Step 1: Creating Sprint 16 in Journal...");

  const sprint16Entry = await notion.pages.create({
    parent: { database_id: JOURNAL_DB },
    properties: {
      Sprint: { title: [{ text: { content: "Sprint 16" } }] },
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
      Branch: { rich_text: [{ text: { content: "main" } }] },
      Highlights: { rich_text: [{ text: { content: "Enrichment Enhancements + RADAR Automation + Analytics + AI-Powered Task Management" } }] },
      Outcomes: { rich_text: [{ text: { content: "Goal: Improve enrichment quality and automate RADAR discovery" } }] }
    }
  });

  const sprint16Id = sprint16Entry.id;
  console.log(`   ✓ Created Sprint 16 (ID: ${sprint16Id})`);
  console.log("");

  // Step 2: Create Sprint 16 tasks
  console.log("📋 Step 2: Creating Sprint 16 tasks...");
  let created = 0;

  for (const task of SPRINT_16_TASKS) {
    try {
      await notion.pages.create({
        parent: { database_id: WORK_ITEMS_DB },
        properties: {
          Features: { title: [{ text: { content: task.name } }] },
          Status: { select: { name: task.status } },
          Priority: { select: { name: task.priority } },
          Type: { select: { name: task.type } },
          ETA: { number: task.eta },
          Tags: { multi_select: task.tags.map(t => ({ name: t })) },
          Notes: { rich_text: [{ text: { content: task.description } }] },
          Sprint: { number: 16 }
        }
      });

      created++;
      console.log(`   ✓ [${task.priority}] ${task.name} (${task.eta}h)`);
    } catch (error) {
      console.log(`   ✗ Failed: ${task.name} - ${error.message}`);
    }
  }

  console.log("");
  console.log(`   Created ${created}/${SPRINT_16_TASKS.length} tasks`);
  console.log("");

  // Step 3: Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Sprint 16 Started!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📊 Sprint 16 Overview:");
  console.log(`   • Start Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`   • Goal: Improve enrichment quality and automate RADAR discovery`);
  console.log(`   • Tasks Created: ${created}`);
  console.log(`   • Total Estimated Time: ${SPRINT_16_TASKS.reduce((sum, t) => sum + t.eta, 0)}h`);
  console.log("");

  console.log("📋 Task Breakdown:");
  const byPriority = SPRINT_16_TASKS.reduce((acc, t) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1;
    return acc;
  }, {});
  Object.entries(byPriority).forEach(([p, count]) => {
    console.log(`   • ${p}: ${count} task(s)`);
  });
  console.log("");

  console.log("💡 Next Steps:");
  console.log("   1. Run 'npm run ai:prioritize' to calculate AI scores");
  console.log("   2. Run 'npm run todo:sync' to update TODO.md");
  console.log("   3. Open Notion 🎯 Daily Focus view");
  console.log("   4. Run 'npm run ai:suggest' to get first task recommendation");
  console.log("");
  console.log("🚀 Ready to build! Let's make Sprint 16 amazing!");
}

startSprint16().catch(console.error);
