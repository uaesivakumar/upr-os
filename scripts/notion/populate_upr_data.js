import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ➊ Database IDs from create_upr_roadmap.js
const MODULES_DB = process.env.MODULES_DB_ID || "2a266151-dd16-81e7-8ea4-d3a4a761d152";
const WORK_DB    = process.env.WORK_ITEMS_DB_ID || "2a266151-dd16-810d-8578-c190d7cc3e42";
const JOURNAL_DB = process.env.JOURNAL_DB_ID || "2a266151-dd16-815b-8431-ce6212efb9ac";

/* ---------------------------  SAMPLE DATA  --------------------------- */
// Historical & upcoming modules
const modules = [
  { Name: "Discovery Engine", Owner: "Siva", Status: "Active", Progress: 0.9, CurrentSprint: 11, Velocity: 8 },
  { Name: "Enrichment Engine", Owner: "Siva", Status: "Active", Progress: 0.75, CurrentSprint: 11, Velocity: 6 },
  { Name: "Outreach Generator", Owner: "Siva", Status: "Active", Progress: 0.7, CurrentSprint: 11, Velocity: 5 },
  { Name: "Admin Console", Owner: "Siva", Status: "Active", Progress: 0.6, CurrentSprint: 11, Velocity: 4 },
  { Name: "AI Agent Core", Owner: "Siva", Status: "Planned", Progress: 0.4, CurrentSprint: 12, Velocity: 0 },
  { Name: "Infra & DevOps", Owner: "Siva", Status: "Active", Progress: 0.8, CurrentSprint: 11, Velocity: 7 },
];

// Sprint Journal entries (6 → 13)
const journal = [
  { Sprint: 6, Date: "2025-09-19", Branch: "enrichment-core", Commit: "b14ef2d",
    Highlights: "Hiring Signals Recall Mode", Outcomes: "Improved precision", Learnings: "Continue dedupe tuning" },
  { Sprint: 7, Date: "2025-09-27", Branch: "phase/ai-learning", Commit: "a82749b",
    Highlights: "Style memory + bandit model", Outcomes: "Better personalization", Learnings: "Silent failure logs need fix" },
  { Sprint: 8, Date: "2025-10-05", Branch: "feature/unified-enrichment", Commit: "e6f27ec",
    Highlights: "Enrichment routing consolidation", Outcomes: "Stable API", Learnings: "Avoid contract mismatch" },
  { Sprint: 9, Date: "2025-10-14", Branch: "main", Commit: "f6ff4dc",
    Highlights: "Testing infra + Outreach revamp", Outcomes: "UX overhaul", Learnings: "Testing maturity gained" },
  { Sprint: 10, Date: "2025-10-27", Branch: "main", Commit: "d2ba5b9",
    Highlights: "Template Creator enhancements", Outcomes: "One-box UX stable", Learnings: "Improve save flow" },
  { Sprint: 11, Date: "2025-11-04", Branch: "feature/phase-2a-enrichment-migration", Commit: "d2ba5b9",
    Highlights: "Production fixes + Testing coverage", Outcomes: "Stable deploy", Learnings: "Enhance error tracking" },
  { Sprint: 12, Date: "2025-11-18", Branch: "main", Commit: "",
    Highlights: "Template save + context parsing", Outcomes: "Planned", Learnings: "Implement URL context parsing" },
  { Sprint: 13, Date: "2025-12-05", Branch: "main", Commit: "",
    Highlights: "LangChain RAG integration", Outcomes: "Planned", Learnings: "Evaluate multi-agent LLM" },
];

// Work-item samples (simplified)
const workItems = [
  { Name: "Template Creator – Save Flow", Module: "Outreach Generator", Sprint: 12,
    Type: "Feature", Priority: "High", Complexity: "Medium", ETA: 1, Status: "In Progress",
    Notes: "Implement createAndSaveTemplate() and versioning API" },
  { Name: "Opening Context Generation", Module: "Outreach Generator", Sprint: 12,
    Type: "Enhancement", Priority: "Medium", Complexity: "Medium", ETA: 1, Status: "Backlog",
    Notes: "Generate AI-based opening context" },
  { Name: "URL Context Parsing Backend", Module: "Outreach Generator", Sprint: 12,
    Type: "Feature", Priority: "High", Complexity: "High", ETA: 2, Status: "Backlog",
    Notes: "Scrape company and LinkedIn data from brief URL" },
  { Name: "Central LLM Agent (MCP)", Module: "AI Agent Core", Sprint: 13,
    Type: "Feature", Priority: "Critical", Complexity: "High", ETA: 3, Status: "Backlog",
    Notes: "Unify LLM behavior across modules" },
];

/* ---------------------------  HELPERS  --------------------------- */
async function addItem(db, properties) {
  try {
    await notion.pages.create({
      parent: { database_id: db },
      properties,
    });
  } catch (err) {
    console.error("Add item failed:", err.message);
  }
}

async function run() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 Populating UPR roadmap data (Sprints 6-13)...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Modules
  console.log("📘 Adding Modules...");
  for (const m of modules) {
    await addItem(MODULES_DB, {
      Name: { title: [{ text: { content: m.Name } }] },
      Owner: { rich_text: [{ text: { content: m.Owner } }] },
      Status: { select: { name: m.Status } },
      "Progress %": { number: m.Progress },
      "Current Sprint": { number: m.CurrentSprint },
      Velocity: { number: m.Velocity },
    });
    console.log(`  ✓ ${m.Name} (${Math.round(m.Progress * 100)}% complete)`);
  }
  console.log("✅ Modules inserted.");
  console.log("");

  // Sprint Journal
  console.log("📓 Adding Sprint Journal entries...");
  for (const j of journal) {
    await addItem(JOURNAL_DB, {
      Sprint: { title: [{ text: { content: `Sprint ${j.Sprint}` } }] },
      Date: { date: { start: j.Date } },
      Branch: { rich_text: [{ text: { content: j.Branch } }] },
      Commit: { rich_text: [{ text: { content: j.Commit } }] },
      Highlights: { rich_text: [{ text: { content: j.Highlights } }] },
      Outcomes: { rich_text: [{ text: { content: j.Outcomes } }] },
      Learnings: { rich_text: [{ text: { content: j.Learnings } }] },
    });
    console.log(`  ✓ Sprint ${j.Sprint}: ${j.Highlights}`);
  }
  console.log("✅ Sprint Journal entries added.");
  console.log("");

  // Work Items
  console.log("⚙️  Adding Work Items...");
  for (const w of workItems) {
    await addItem(WORK_DB, {
      Name: { title: [{ text: { content: w.Name } }] },
      Sprint: { number: w.Sprint },
      Type: { select: { name: w.Type } },
      Priority: { select: { name: w.Priority } },
      Complexity: { select: { name: w.Complexity } },
      ETA: { number: w.ETA },
      Status: { select: { name: w.Status } },
      Notes: { rich_text: [{ text: { content: w.Notes } }] },
    });
    console.log(`  ✓ Sprint ${w.Sprint}: ${w.Name}`);
  }
  console.log("✅ Work items added.");
  console.log("");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Population complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📊 Summary:");
  console.log(`   • ${modules.length} modules added`);
  console.log(`   • ${journal.length} sprint journal entries (Sprints 6-13)`);
  console.log(`   • ${workItems.length} work items added`);
  console.log("");
  console.log("➡️  Refresh your Notion page to see all data:");
  console.log("   https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e");
}

run();
