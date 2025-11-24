import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const TEMPLATE = `# UPR Sprint Checkpoint

Auto-syncs to Notion using: npm run sprint:sync

## Format

Each sprint should follow this structure:

\`\`\`
### Sprint [NUMBER]
- Branch: [branch-name]
- Commit: [commit-hash]
- Date: [YYYY-MM-DD]
- Highlights: [Key accomplishments]
- Outcomes: [What was delivered]
- Learnings: [Insights and improvements]
\`\`\`

---

## Sprint History

### Sprint 11
- Branch: feature/phase-2a-enrichment-migration
- Commit: d2ba5b9
- Date: 2025-11-04
- Highlights: Production fixes + Testing coverage
- Outcomes: Stable deploy with enhanced error tracking
- Learnings: Pre-production testing is critical for reducing post-deploy issues

### Sprint 12
- Branch: main
- Commit:
- Date: 2025-11-18
- Highlights: Template save + context parsing
- Outcomes: Planned
- Learnings: Implement URL context parsing for better AI personalization

### Sprint 13
- Branch: main
- Commit:
- Date: 2025-12-05
- Highlights: LangChain RAG integration
- Outcomes: Planned
- Learnings: Evaluate multi-agent LLM architecture

---

## Usage

**Sync to Notion:**
\`\`\`bash
npm run sprint:sync
\`\`\`

**Close current sprint:**
\`\`\`bash
npm run sprint:close 14
\`\`\`

**Auto-sync on commit (optional):**
\`\`\`bash
npm install --save-dev husky
npx husky install
npx husky add .husky/post-commit "npm run sprint:sync"
\`\`\`
`;

function createTemplate() {
  const checkpointPath = path.join(process.cwd(), 'UPR_CHECKPOINT.md');

  if (fs.existsSync(checkpointPath)) {
    console.log("⚠️  UPR_CHECKPOINT.md already exists!");
    console.log("");
    console.log("Choose what to do:");
    console.log("  1. Keep existing file (do nothing)");
    console.log("  2. Create backup and generate new template");
    console.log("");
    console.log("To create backup:");
    console.log(`  cp UPR_CHECKPOINT.md UPR_CHECKPOINT.backup.md`);
    console.log(`  npm run sprint:template`);
    console.log("");
    return;
  }

  // Get current git info
  let branch = "main";
  let commit = "";
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch (e) {
    console.log("⚠️  Not in a git repository, using defaults");
  }

  // Write template
  fs.writeFileSync(checkpointPath, TEMPLATE);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Created UPR_CHECKPOINT.md");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📝 Location:", checkpointPath);
  console.log("");
  console.log("🎯 Next steps:");
  console.log("");
  console.log("1. Edit UPR_CHECKPOINT.md with your sprint data");
  console.log("2. Run: npm run sprint:sync");
  console.log("3. Check Notion to see your updates!");
  console.log("");
  console.log("💡 Tip: Use 'npm run sprint:close [number]' to auto-close sprints");
  console.log("");
}

createTemplate();
