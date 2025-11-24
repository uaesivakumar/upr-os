# UPR Documentation System

**Last Updated:** October 18, 2025

---

## 📚 Overview

This directory contains UPR's living documentation - the complete blueprint for building, scaling, and defending the UAE's premier B2B sales intelligence platform.

**Philosophy:** Separate public strategy from private implementation. Public docs are investor-ready and safe to share. Private docs contain trade secrets and must remain encrypted.

---

## 📂 Public Documents (Safe to Share)

Located in `/progress/docs/` - commit to version control

| Document | Purpose | Update Frequency | Lines |
|----------|---------|------------------|-------|
| **VISION.md** | Why UPR exists, market opportunity, 3-5 year vision | Yearly | ~350 |
| **ROADMAP.md** | 12-18 month execution plan (8 phases) | Quarterly | ~800 |
| **CHECKPOINT.md** | Weekly progress snapshot | Weekly (Friday) | ~450 |
| **DECISIONS_PUBLIC.md** | Strategic rationale (no implementation) | As needed | ~550 |
| **MOAT_METRICS.md** | Monthly defensibility tracking | Monthly (1st) | ~700 |
| **PROGRESS_TRACKER.md** | Auto-generated progress dashboard | Auto-updated | ~550 |
| **SECURITY_CHECKLIST.md** | Weekly security review | Weekly (Friday) | ~350 |

### What's Safe to Share

✅ Vision, mission, market opportunity
✅ Feature roadmap (WHAT we're building)
✅ Success metrics and KPIs
✅ Strategic decisions and rationale
✅ Progress updates and milestones

❌ Implementation details (HOW we build)
❌ Database schemas, API designs
❌ Agent topology, RAG architecture
❌ Cost optimization techniques
❌ Security vulnerabilities or defenses

---

## 🔐 Private Documents (ENCRYPTED ONLY - Not in Git)

Located in `/progress/private/` - **NEVER commit to version control**

| Document | Purpose | Classification | Lines |
|----------|---------|----------------|-------|
| **ARCHITECTURE_FULL.md** | Complete technical specification | CONFIDENTIAL | ~650 |
| **SECURITY_ARCHITECTURE.md** | Defense in depth implementation | CONFIDENTIAL | ~2000 |
| **PHASE_0_FOUNDATION_FULL.md** | Detailed Phase 0 implementation | CONFIDENTIAL | ~450 |
| **API_OPTIMIZATION_SECRETS.md** | 85-95% cost reduction techniques | TOP SECRET | ~600 |
| **INCIDENT_RESPONSE.md** | Emergency procedures & runbooks | CONFIDENTIAL | ~850 |
| **FUTURE_ARCHITECTURE.md** | 18-month scaling strategy | CONFIDENTIAL | ~400 |
| **COMPETITIVE_DEFENSE.md** | Moat protection strategy | CONFIDENTIAL | ~350 |
| **TEAM_SCALING.md** | Hiring & knowledge transfer | CONFIDENTIAL | ~300 |
| **RISK_MITIGATION.md** | Existential threat playbook | CONFIDENTIAL | ~400 |

### Access Instructions

Private docs are encrypted after creation:

```bash
# To access encrypted docs:
cd /Users/skc/DataScience/upr/progress/private
./setup_encryption.sh --decrypt

# Enter your passphrase
# Files will be available temporarily
# Remember to re-encrypt after use
```

**CRITICAL:** Store encryption passphrase in password manager (1Password, Bitwarden). If lost, data is UNRECOVERABLE.

---

## 🔄 Weekly Workflow

**Every Friday at 4:00 PM** (or end of sprint):

### 1. Update Progress (15 minutes)

```bash
cd /Users/skc/DataScience/upr
code progress/docs/CHECKPOINT.md

# Mark completed tasks as [x]
# Update phase completion percentages
# Add blockers if any
# Set next week's priorities
```

### 2. Run Automation (2 minutes)

```bash
./UPDATE_PROGRESS.sh
# Answer 'y' to update PROGRESS_TRACKER.md
# Review terminal summary
```

### 3. Security Review (15 minutes)

```bash
code progress/docs/SECURITY_CHECKLIST.md
# Check all boxes
# Address any issues found
# Update completion log
```

### 4. Commit to Git (2 minutes)

```bash
git add progress/docs/
git commit -m "docs: weekly progress update $(date +%Y-%m-%d)"
git push
```

**Total Time:** ~35 minutes/week

---

## 📅 Monthly Workflow

**First Monday of each month** (10:00 AM):

### 1. Moat Metrics Update (30 minutes)

```bash
code progress/docs/MOAT_METRICS.md

# Update all 7 core metrics:
# - Reuse Rate (target: ≥80%)
# - Freshness SLA (target: <30 days)
# - Provenance Coverage (target: ≥90%)
# - Resolution Time (target: <48 hours)
# - Edge Density (target: ≥3 relationships/company)
# - Outcome Lift (target: +20% meeting rate)
# - Cost per Lead (target: <$0.50)

# Add monthly snapshot
# Analyze trends (improving or declining?)
```

### 2. Cost Analysis (15 minutes)

```bash
# Review API spend from usage_events table
psql $DATABASE_URL -c "
  SELECT
    source_type,
    COUNT(*) AS calls,
    SUM(cost_usd) AS total_cost,
    AVG(freshness_score) AS avg_freshness
  FROM kb_chunks
  WHERE created_at > NOW() - INTERVAL '1 month'
  GROUP BY source_type
  ORDER BY total_cost DESC;
"

# Check if costs are decreasing (85-95% reduction goal)
# Identify optimization opportunities
```

### 3. Roadmap Check (15 minutes)

```bash
code progress/docs/ROADMAP.md

# Are we on track with quarterly milestones?
# Any delays or accelerations?
# Update expected completion dates if needed
```

**Total Time:** ~60 minutes/month

---

## 📈 Quarterly Workflow

**First week of each quarter**:

### 1. Roadmap Review (2 hours)

- Completed vs planned features
- Adjust next quarter priorities
- Update Q+2 and Q+3 plans
- Align with latest market feedback

### 2. Decision Log Update (1 hour)

```bash
code progress/docs/DECISIONS_PUBLIC.md

# Document major strategic decisions made this quarter
# Update status of previous decisions (Accepted → Superseded?)
# Ensure rationale is clear for future reference
```

### 3. Vision Alignment Check (1 hour)

```bash
code progress/docs/VISION.md

# Is current trajectory aligned with 3-5 year vision?
# Any pivots needed?
# Update TAM/market assumptions if changed
```

### 4. Backup & Disaster Recovery Test (1 hour)

```bash
# Test restoration from encrypted backup
# Verify all private docs can be decrypted
# Test database backup restoration
# Document any issues in INCIDENT_RESPONSE.md
```

**Total Time:** ~5 hours/quarter

---

## 🎯 Recommended Reading Order

### For New Team Members:

1. **VISION.md** - Understand the "why"
2. **ROADMAP.md** - Understand the "what" and "when"
3. **CHECKPOINT.md** - Understand current status
4. **DECISIONS_PUBLIC.md** - Understand key choices

### For Technical Onboarding:

(After NDA signed + encrypted docs access granted)

1. **ARCHITECTURE_FULL.md** - Complete system design
2. **PHASE_0_FOUNDATION_FULL.md** - Foundation implementation
3. **SECURITY_ARCHITECTURE.md** - Security best practices
4. **API_OPTIMIZATION_SECRETS.md** - Cost reduction techniques

### For Investors/Advisors:

1. **VISION.md** - Market opportunity
2. **MOAT_METRICS.md** - Defensibility proof
3. **ROADMAP.md** - Execution plan
4. **CHECKPOINT.md** - Current traction

---

## 🔒 Security & Access Control

### Who Can Access What?

| Role | Public Docs | Private Docs | Encryption Key |
|------|-------------|--------------|----------------|
| **Founder** | ✅ Read/Write | ✅ Read/Write | ✅ Yes |
| **Co-Founder (future)** | ✅ Read/Write | ✅ Read (NDA) | ✅ Yes (separate passphrase) |
| **Engineer (employee)** | ✅ Read | ✅ Read (NDA) | ❌ No (founder decrypts as needed) |
| **Advisor** | ✅ Read | ❌ No | ❌ No |
| **Investor** | ✅ Read | ❌ No | ❌ No |
| **Customer** | ❌ No | ❌ No | ❌ No |

### What NEVER Goes in Docs (Store Separately):

- API keys (use Secret Manager)
- Database passwords (use Secret Manager)
- Customer PII (database only)
- Legal contracts (secure file storage)
- Financial details (accounting software)

---

## 🚨 Emergency Procedures

### If Private Docs Accidentally Committed to Git:

```bash
# IMMEDIATE ACTION (within 5 minutes):

# 1. DO NOT PUSH if local only
git reset HEAD~1  # Undo commit

# 2. If already pushed to GitHub:
git filter-repo --path progress/private/ --invert-paths
git push --force --all

# 3. Rotate ALL secrets immediately:
# - OpenAI API key
# - Apollo API key
# - Database password
# - JWT secret

# 4. Contact GitHub support to purge from cache

# 5. Document incident in INCIDENT_RESPONSE.md
```

### If Encryption Passphrase Lost:

⚠️ **NO RECOVERY POSSIBLE** ⚠️

AES-256 encryption cannot be broken. This is why backups are critical:

- Primary: Password manager (1Password, Bitwarden)
- Secondary: Physical note in bank safe deposit box
- Tertiary: Shared with co-founder (encrypted message)

**NEVER:**
- Store in plaintext file
- Email to yourself
- Write in unencrypted notes app

---

## 📞 Support & Questions

### Documentation Issues:

- File unclear or outdated? Update it (living docs principle)
- Missing information? Add it (future you will thank current you)
- Contradiction between docs? Resolve and document decision

### Technical Issues:

- Can't decrypt private docs? Check passphrase in password manager
- UPDATE_PROGRESS.sh errors? Ensure CHECKPOINT.md format is correct
- Git push rejected? Check .gitignore is protecting private/

### Process Questions:

- How often to update? See workflows above (weekly/monthly/quarterly)
- What to track? See MOAT_METRICS.md for the 7 core metrics
- When to create new ADR? Whenever a strategic decision is made

---

## 🎓 Documentation Best Practices

### 1. Keep Public Docs Strategic

✅ **Good (Strategic):**
- "We chose a knowledge graph to model company relationships"
- "This enables network-based targeting and improves precision"
- "Outcome data helps optimize future outreach strategies"

❌ **Bad (Too Detailed):**
- "We use PostgreSQL with this exact schema: CREATE TABLE..."
- "The RAG fusion algorithm weights sources as: Manual=1.0, Website=0.85..."
- "Our prompt template for enrichment is: You are an AI that..."

### 2. Keep Private Docs Detailed

✅ **Good (Implementable):**
- Full SQL CREATE statements
- Complete TypeScript interface definitions
- Exact prompt templates with examples
- Step-by-step deployment commands

❌ **Bad (Too Vague):**
- "We have a database for storing companies"
- "Security is implemented using best practices"
- "The system uses OpenAI for intelligent features"

### 3. Update Frequently, Commit Regularly

- Better to have imperfect docs than no docs
- Update as you work (context is fresh)
- Commit every Friday (weekly cadence)
- Review quarterly (ensure accuracy)

### 4. Write for Future You

- Assume you'll forget everything in 6 months
- Document WHY, not just WHAT
- Include examples and edge cases
- Link related sections

---

## 🗺️ Future Additions to This System

As UPR grows, consider adding:

**At $10k MRR:**
- SALES_PLAYBOOK.md (how to sell UPR)
- CUSTOMER_SUCCESS.md (onboarding & support)
- PRICING_STRATEGY.md (tiers, packaging)

**At First Hire:**
- ONBOARDING.md (dev environment setup)
- CONTRIBUTING.md (code standards, PR process)
- RUNBOOKS/ (operations procedures)

**At Fundraising:**
- INVESTOR_FAQ.md (common questions + answers)
- PITCH_DECK.md (slide-by-slide talking points)
- FINANCIAL_MODEL.md (assumptions, projections)

**At Scale (100+ customers):**
- SLA_COMMITMENTS.md (uptime, support response)
- COMPLIANCE/ (SOC 2, ISO 27001 documentation)
- API_CHANGELOG.md (breaking changes, versioning)

---

## ✨ Remember

**This documentation system is your second brain.**

- It captures decisions so you don't repeat debates
- It onboards teammates faster than you ever could
- It proves to investors you're thinking long-term
- It protects your IP if you get hit by a bus

**Invest in it weekly. Future you will be grateful.**

---

**Questions? Improvements?**

This is YOUR documentation system. Adapt, extend, and improve as needed. The goal is clarity, not perfection.

**Last Updated:** October 18, 2025
**Next Review:** January 18, 2026
**Maintainer:** Sivakumar Chandrasekaran
