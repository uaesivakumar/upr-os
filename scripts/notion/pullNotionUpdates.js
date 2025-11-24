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

const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;

// ============================================================================
// NOTION → LOCAL SYNC (BI-DIRECTIONAL)
// ============================================================================

/**
 * Fetch all sprint entries from Notion
 */
async function fetchNotionSprints() {
  try {
    const response = await notion.databases.query({
      database_id: JOURNAL_DB,
      sorts: [
        {
          property: "Sprint",
          direction: "ascending"
        }
      ]
    });

    return response.results.map(page => {
      const props = page.properties;

      // Extract sprint number from title
      const sprintTitle = props.Sprint?.title?.[0]?.text?.content || "";
      const sprintNumber = sprintTitle.replace("Sprint", "").trim();

      // Extract all properties
      return {
        id: page.id,
        Sprint: sprintNumber,
        Date: props.Date?.date?.start || "",
        Branch: props.Branch?.rich_text?.[0]?.text?.content || "",
        Commit: props.Commit?.rich_text?.[0]?.text?.content || "",
        Highlights: props.Highlights?.rich_text?.[0]?.text?.content || "",
        Outcomes: props.Outcomes?.rich_text?.[0]?.text?.content || "",
        Learnings: props.Learnings?.rich_text?.[0]?.text?.content || "",
        lastEdited: page.last_edited_time,
      };
    });
  } catch (error) {
    console.error("Error fetching from Notion:", error.message);
    throw error;
  }
}

/**
 * Generate markdown content from Notion sprints
 */
function generateMarkdownFromSprints(sprints) {
  let markdown = `# UPR Sprint Log

This file auto-syncs to Notion using: \`npm run sprint:sync\`
**Last synced from Notion:** ${new Date().toISOString().split('T')[0]}

---

## Current Sprints

`;

  sprints.forEach(sprint => {
    markdown += `### Sprint ${sprint.Sprint}\n`;
    if (sprint.Branch) markdown += `- Branch: ${sprint.Branch}\n`;
    if (sprint.Commit) markdown += `- Commit: ${sprint.Commit}\n`;
    if (sprint.Date) markdown += `- Date: ${sprint.Date}\n`;
    if (sprint.Highlights) markdown += `- Highlights: ${sprint.Highlights}\n`;
    if (sprint.Outcomes) markdown += `- Outcomes: ${sprint.Outcomes}\n`;
    if (sprint.Learnings) markdown += `- Learnings: ${sprint.Learnings}\n`;
    markdown += '\n';
  });

  markdown += `---

## Sync Commands

\`\`\`bash
# Sync local changes to Notion
npm run sprint:sync

# Pull Notion updates to local
npm run sprint:pull

# Close current sprint (auto-captures git info)
npm run sprint:close 14

# Create checkpoint template
npm run sprint:template
\`\`\`

## Auto-Sync Setup (Optional)

Install Husky for automatic sync on git commit:

\`\`\`bash
npm install --save-dev husky
npx husky install
npx husky add .husky/post-commit "npm run sprint:sync"
\`\`\`
`;

  return markdown;
}

/**
 * Main pull function
 */
async function pullFromNotion() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⬇️  Pulling sprint data from Notion...");
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

  // Fetch sprints from Notion
  console.log("📡 Fetching sprints from Notion...");
  const sprints = await fetchNotionSprints();
  console.log(`📝 Found ${sprints.length} sprint(s) in Notion`);
  console.log("");

  if (sprints.length === 0) {
    console.log("⚠️  No sprints found in Notion");
    console.log("   Run 'npm run sprint:sync' to sync local sprints first");
    process.exit(0);
  }

  // Display sprints
  console.log("📊 Sprint Overview:");
  sprints.forEach(s => {
    console.log(`  • Sprint ${s.Sprint}: ${s.Highlights || '(no highlights)'}`);
  });
  console.log("");

  // Determine output file
  const outputPaths = [
    path.join(process.cwd(), 'UPR_SPRINT_LOG.md'),
    path.join(process.cwd(), 'UPR_CHECKPOINT.md'),
  ];

  let outputPath = outputPaths[0]; // Default to UPR_SPRINT_LOG.md

  // Check if any file exists
  for (const p of outputPaths) {
    if (fs.existsSync(p)) {
      outputPath = p;
      break;
    }
  }

  // Create backup if file exists
  if (fs.existsSync(outputPath)) {
    const backupPath = outputPath.replace('.md', '.backup.md');
    fs.copyFileSync(outputPath, backupPath);
    console.log(`💾 Backup created: ${path.basename(backupPath)}`);
  }

  // Generate and write markdown
  const markdown = generateMarkdownFromSprints(sprints);
  fs.writeFileSync(outputPath, markdown);

  console.log(`✅ Updated: ${path.basename(outputPath)}`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Pull complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📊 Summary:");
  console.log(`   • ${sprints.length} sprints synced from Notion`);
  console.log(`   • Local file updated: ${path.basename(outputPath)}`);
  console.log(`   • Backup saved: ${path.basename(outputPath).replace('.md', '.backup.md')}`);
  console.log("");
  console.log("💡 Next steps:");
  console.log("   • Review the updated file");
  console.log("   • Make local changes if needed");
  console.log("   • Run 'npm run sprint:sync' to push changes back to Notion");
}

/**
 * Check for conflicts between local and Notion
 */
async function checkForConflicts() {
  console.log("🔍 Checking for conflicts...");

  const localPath = path.join(process.cwd(), 'UPR_SPRINT_LOG.md');
  if (!fs.existsSync(localPath)) {
    console.log("   No local file found, safe to pull");
    return true;
  }

  const localContent = fs.readFileSync(localPath, 'utf-8');
  const localLastSync = localContent.match(/Last synced from Notion:\*\* (.+)/);

  if (!localLastSync) {
    console.log("⚠️  Warning: Local file has unsaved changes");
    console.log("   Consider running 'npm run sprint:sync' first");
    console.log("   Or backup will be created automatically");
  }

  return true;
}

// ============================================================================
// RUN
// ============================================================================

const command = process.argv[2];

if (command === 'check') {
  checkForConflicts().catch(console.error);
} else {
  pullFromNotion().catch(console.error);
}
