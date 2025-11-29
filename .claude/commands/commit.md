# PremiumRadar-SAAS Smart Commit

Create well-formatted commits following conventional commit standards.

**Usage:**
- `/commit` - Smart commit with auto-generated message
- `/commit "message"` - Commit with custom message
- `/commit sprint S26` - Sprint completion commit

---

## CONVENTIONAL COMMIT FORMAT

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types
| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(siva): add reasoning overlay` |
| `fix` | Bug fix | `fix(auth): resolve token refresh` |
| `docs` | Documentation | `docs(readme): update setup guide` |
| `style` | Formatting | `style(lint): fix indentation` |
| `refactor` | Code refactoring | `refactor(api): simplify handlers` |
| `test` | Adding tests | `test(scoring): add unit tests` |
| `chore` | Maintenance | `chore(deps): update packages` |
| `perf` | Performance | `perf(build): optimize bundle` |
| `ci` | CI/CD changes | `ci(deploy): add staging workflow` |

### Scopes (Project-Specific)
- `siva` - SIVA AI Surface
- `auth` - Authentication
- `notion` - Notion integration
- `api` - API routes
- `ui` - UI components
- `store` - State management
- `deploy` - Deployment
- `qa` - Quality assurance

---

## COMMIT WORKFLOW

### Step 1: Analyze Changes
```bash
# Check what's changed
git status
git diff --stat
git diff --name-only
```

### Step 2: Stage Files
```bash
# Stage all changes
git add -A

# Or stage specific files
git add components/siva/*.tsx
git add lib/stores/siva-store.ts
```

### Step 3: Generate Commit Message
TC analyzes staged changes and generates appropriate message:

```javascript
function generateCommitMessage(changes) {
  // Determine type
  const type = determineType(changes);
  // Determine scope
  const scope = determineScope(changes);
  // Generate description
  const description = generateDescription(changes);

  return `${type}(${scope}): ${description}`;
}
```

### Step 4: Create Commit
```bash
git commit -m "$(cat <<'EOF'
feat(siva): implement reasoning overlay panel

- Add ReasoningOverlay component with timeline/graph views
- Create ReasoningToggle floating button
- Integrate with SIVA store for step tracking
- Add progress bar and view mode switching

Sprint: S29
Features: Reasoning Overlay System

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 5: Verify Commit
```bash
git log -1 --format="%h %s"
git show --stat HEAD
```

---

## SMART COMMIT PATTERNS

### Feature Commit
```bash
git commit -m "$(cat <<'EOF'
feat(siva): add output object engine

- Create ObjectContainer with drag/pin functionality
- Implement DiscoveryObject, ScoringObject, RankingObject
- Add Q/T/L/E radar visualization
- Enable expand/collapse and context menu

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Bug Fix Commit
```bash
git commit -m "$(cat <<'EOF'
fix(auth): resolve token expiration handling

- Add token refresh before API calls
- Handle 401 responses gracefully
- Clear session on persistent failures

Fixes: #123

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Sprint Completion Commit
```bash
git commit -m "$(cat <<'EOF'
feat(sprint): complete S26 - Global SIVA Surface

Sprint S26 Deliverables:
- SIVASurface.tsx full-screen canvas
- Neural mesh background animation
- SIVAInputBar with Cmd+K shortcut
- SIVAPersonaPanel AI state display
- Zustand store for SIVA state
- Industry-aware theming
- Quick start cards

8/8 features complete
QA: Pending certification

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Documentation Commit
```bash
git commit -m "$(cat <<'EOF'
docs(notion): update sync commands documentation

- Add /sync command for progress tracking
- Document /notion-update for troubleshooting
- Add schema reference for databases

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## PRE-COMMIT CHECKS

Before committing, TC verifies:

### 1. Build Passes
```bash
npm run build
```

### 2. TypeScript Clean
```bash
npx tsc --noEmit
```

### 3. No Secrets Exposed
```bash
grep -r "NOTION_TOKEN\|API_KEY" --include="*.ts" | grep -v "process.env" | grep -v ".example"
```

### 4. Tests Pass (if available)
```bash
npm test 2>/dev/null || echo "No tests"
```

---

## GIT SAFETY RULES

### NEVER DO
- ❌ `git push --force` (destroys history)
- ❌ `git reset --hard` on shared branches
- ❌ Commit secrets or credentials
- ❌ Commit node_modules
- ❌ Commit .env files

### ALWAYS DO
- ✅ Review diff before committing
- ✅ Use meaningful commit messages
- ✅ Run build before pushing
- ✅ Create feature branches for large changes

---

## BRANCH STRATEGY

```
main (staging)
├── feat/siva-surface
├── feat/output-objects
├── fix/auth-token
└── chore/update-deps

production (live)
└── merged from main after QA
```

### Creating Feature Branch
```bash
git checkout -b feat/feature-name
# work on feature
git push -u origin feat/feature-name
```

### Merging to Main
```bash
git checkout main
git pull origin main
git merge feat/feature-name
git push origin main
```

---

## COMMIT MESSAGE TEMPLATE

```
<type>(<scope>): <short description>

<body - what and why>

<footer - references>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Guidelines:**
- Subject line: Max 72 characters
- Body: Wrap at 72 characters
- Use present tense ("add" not "added")
- Use imperative mood ("move" not "moves")

---

## QUICK COMMIT COMMANDS

### Commit all with message
```bash
git add -A && git commit -m "feat(scope): description"
```

### Amend last commit (local only)
```bash
git commit --amend -m "new message"
```

### View commit history
```bash
git log --oneline -10
```

### Undo last commit (keep changes)
```bash
git reset --soft HEAD~1
```
