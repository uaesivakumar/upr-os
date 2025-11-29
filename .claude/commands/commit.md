# UPR OS Smart Commit

Create well-formatted commits following conventional commit standards.

**Usage:**
- `/commit` - Smart commit with auto-generated message
- `/commit "message"` - Commit with custom message
- `/commit sprint S50` - Sprint completion commit

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
| `feat` | New feature | `feat(providers): add fallback engine` |
| `fix` | Bug fix | `fix(llm): resolve routing error` |
| `docs` | Documentation | `docs(readme): update setup guide` |
| `refactor` | Code refactoring | `refactor(api): simplify handlers` |
| `test` | Adding tests | `test(scoring): add unit tests` |
| `chore` | Maintenance | `chore(deps): update packages` |
| `perf` | Performance | `perf(query): optimize database calls` |

### Scopes (UPR OS Specific)
- `providers` - API Provider management
- `llm` - LLM routing engine
- `journey` - Journey engine
- `scoring` - Q/T/L/E scoring
- `enrichment` - Data enrichment
- `signals` - Signal processing
- `autonomous` - Autonomous agents
- `api` - API routes

---

## COMMIT WORKFLOW

### Step 1: Analyze Changes
```bash
git status
git diff --stat
git diff --name-only
```

### Step 2: Stage Files
```bash
git add -A
```

### Step 3: Generate Commit Message
Analyze staged changes and generate appropriate message with OS-specific prefix:

```bash
# OS commits use feat(os/sXX): format
git commit -m "feat(os/s50): Add provider fallback engine"
```

### Step 4: Create Commit
```bash
git commit -m "$(cat <<'HEREDOC'
feat(os/s50): description here

- Bullet point 1
- Bullet point 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
HEREDOC
)"
```

---

## IMPORTANT: REPOSITORY AWARENESS

This is the **UPR OS** repository (Intelligence Engine).

✅ DO commit here:
- Intelligence logic
- Provider management
- LLM routing
- Journey engine
- Scoring algorithms

❌ DON'T commit here:
- Tenant/user code (belongs in SaaS)
- Billing logic (belongs in SaaS)
- UI components (belongs in SaaS)

If you're working on SaaS code, switch repos first:
```bash
cd ~/Projects/UPR/premiumradar-saas
```
