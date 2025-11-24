import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ---------- CONFIGURATION ----------
// Replace with your actual parent page ID from Notion
const parentPageId = process.env.NOTION_PARENT_PAGE_ID || "2a166151dd1680e1b2f4ca09e2258dff";

async function createDatabase() {
  try {
    console.log("🔗 Connecting to Notion...");

    // --- 1. Create main Modules database ---
    const modulesDb = await notion.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "UPR Modules & Streams" } }],
      properties: {
        Name: { title: {} },
        Owner: { rich_text: {} },
        Status: { select: { options: [
          { name: "Active", color: "green" },
          { name: "Planned", color: "yellow" },
          { name: "Paused", color: "gray" },
          { name: "Completed", color: "blue" }
        ]}},
        "Progress %": { number: { format: "percent" } },
        "Current Sprint": { number: {} },
        Velocity: { number: {} },
      },
    });
    console.log("✅ Modules DB created:", modulesDb.id);

    // --- 2. Create Sprint Work Items database ---
    const workDb = await notion.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "UPR Sprint Work Items" } }],
      properties: {
        Name: { title: {} },
        Module: { relation: { database_id: modulesDb.id, single_property: {} } },
        Sprint: { number: {} },
        Type: { select: { options: [
          { name: "Feature", color: "green" },
          { name: "Bug Fix", color: "red" },
          { name: "Enhancement", color: "blue" },
          { name: "Infra", color: "purple" }
        ]}},
        Priority: { select: { options: [
          { name: "Low", color: "gray" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "orange" },
          { name: "Critical", color: "red" }
        ]}},
        Complexity: { select: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "orange" }
        ]}},
        ETA: { number: {} },
        Status: { select: { options: [
          { name: "Backlog", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Testing", color: "purple" },
          { name: "Done", color: "green" }
        ]}},
        Notes: { rich_text: {} },
      },
    });
    console.log("✅ Work Items DB created:", workDb.id);

    // --- 3. Create Sprint Journal database ---
    const journalDb = await notion.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "UPR Sprint Journal" } }],
      properties: {
        Sprint: { title: {} },
        Date: { date: {} },
        Branch: { rich_text: {} },
        Commit: { rich_text: {} },
        Highlights: { rich_text: {} },
        Outcomes: { rich_text: {} },
        Learnings: { rich_text: {} },
      },
    });
    console.log("✅ Sprint Journal DB created:", journalDb.id);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎯 All databases created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n📊 Database IDs (save these for later):");
    console.log("   Modules DB:", modulesDb.id);
    console.log("   Work Items DB:", workDb.id);
    console.log("   Sprint Journal DB:", journalDb.id);
    console.log("\n➡️  Open Notion to view them under your UPR page.");
    console.log("\n💡 Next step: Run populate_upr_sprints.js to add your sprint data");

    // Save database IDs for later use
    return {
      modulesDbId: modulesDb.id,
      workDbId: workDb.id,
      journalDbId: journalDb.id,
    };
  } catch (error) {
    console.error("❌ Error creating Notion databases:", error.message);
    if (error.code === "unauthorized") {
      console.error("\n⚠️  Make sure:");
      console.error("   1. NOTION_TOKEN is set correctly");
      console.error("   2. Your integration has access to the parent page");
      console.error("   3. The parent page ID is correct");
    }
    throw error;
  }
}

createDatabase();
