# UPR Project Context - AI Continuity Guide

**Last Updated:** 2025-11-21
**Current Sprint:** 49 (Complete ✅)
**Active Branch:** main
**Project Owner:** SKC
**Project Progress:** ~70% (Frontend Maturity: Enterprise Level)

---

## 🎯 Project Overview

**Product Name:** UAE Premium Radar (UPR)
**Purpose:** B2B SaaS platform for tracking high-value business signals and opportunities in UAE market.
**Differentiation:** "Executive Intelligence" tool for UAE business leaders, focusing on high-quality, verified local data.

**Tech Stack:**
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express (API)
- **Database:** PostgreSQL
- **Testing:** Vitest (Unit), Playwright (E2E)
- **Deployment:** Google Cloud Run

---

## 📈 Recent Accomplishments (Sprint 49)

**Sprint 49 Complete** (Nov 21, 2025) - 100% Quality

**Key Features Delivered:**
1.  ✅ **Quality Indicators:** Visual scoring (Accuracy, Freshness, Completeness) for leads.
2.  ✅ **Enrichment History:** Vertical timeline tracking all changes and enrichment events.
3.  ✅ **Enrichment Templates:** System to save and reuse enrichment configurations.
4.  ✅ **Security Audit:** Confirmed Frontend is a "Thin Client" with no exposed proprietary logic.
5.  ✅ **Documentation:** Organized all project docs into `docs/` structure.

**Impact:**
- Frontend is now "Enterprise Ready" in terms of UX and features.
- Security posture is verified.
- Codebase is clean and well-documented.

---

## 📊 System Architecture Status

1.  **Enrichment Engine (Frontend)** - ✅ 100% Complete
    - UI for Batch Processing, Quality Scoring, History, and Templates.
    - *Next:* Backend integration for real data.

2.  **Discovery Engine** - 🔄 Active
    - Signal detection logic (LinkedIn, News).

3.  **Infra & DevOps** - ✅ Stable
    - Cloud Run deployment pipeline active.

---

## 🛠️ Development Patterns & Conventions

### Code Style
- **Frontend:** TypeScript, Functional Components, Custom Hooks for logic.
- **State Management:** React Context + Local State (moving to Zustand if complex).
- **Styling:** Tailwind CSS (Standard Design Tokens).
- **Testing:** Vitest for logic, React Testing Library for components.

### Security Rules
1.  **Thin Client:** NO proprietary algorithms in Frontend code.
2.  **API Gateway:** All logic sits behind authenticated API endpoints.
3.  **Auth:** JWT Tokens with `authFetch` wrapper.

---

## 📁 Documentation Structure & Storage Rules

**Rule:** ALL markdown files must be saved in the `docs/` directory. NO loose files in root.

- `docs/sprints/`: **Sprint Logs, Plans, Handoffs.** (Naming: `SPRINT_XX_TYPE.md`)
- `docs/architecture/`: **Design Docs, Diagrams.** (Naming: `TOPIC_ARCHITECTURE.md`)
- `docs/guides/`: **Runbooks, Manuals.** (Naming: `TOPIC_GUIDE.md`)
- `docs/reports/`: **Audits, QC Certs.** (Naming: `TOPIC_REPORT.md`)
- `docs/api/`: **OpenAPI Specs.**

---

## 🚀 Strategic Roadmap

**Phase 1: Validation (Current)**
- Goal: Prove data quality with manual/concierge backend.
- Action: Connect Frontend to real data sources.
- Monetization: High-ticket "Data Packs".

**Phase 2: Traction**
- Goal: $10k MRR.
- Action: Target specific UAE verticals (Real Estate, Fintech).

**Phase 3: Exit/Scale**
- Goal: Acquisition by regional player or global competitor.

---

## �️ Sprint Execution Guardrails (STRICT)

To maintain Enterprise-Level Quality, every sprint MUST follow this protocol:

### 1. Planning Phase
- **Source of Truth:** Tasks MUST be pulled from Notion (`Module Features` page).
- **Command:** `npm run notion -- pull`
- **Output:** Create a `docs/sprints/SPRINT_XX_PLAN.md` file.

### 2. Execution Phase (The Checkpoints)
- **Mandatory Checkpoints:** Insert validation steps between major tasks.
- **Rule:** Do NOT proceed to Task B until Task A is verified (Unit Test or Visual Check).
- **Documentation:** Update `docs/sprints/SPRINT_XX_LOG.md` in real-time.

### 3. Quality Assurance (The "Tester" Persona)
- **Role Switch:** Agent must explicitly switch to "QA Mode" before closing a sprint.
- **Requirement:** Run the full test suite (`npm run test`).
- **Deliverable:** Generate a `QC_CERTIFICATE.md` for the sprint.
- **Rule:** A sprint is **NOT COMPLETE** until the QC Certificate is generated and passing.

### 4. Completion Phase
- **Notion Sync:** `npm run notion -- close <sprint_number>` (or `./scripts/notion/updateNotion.sh <sprint_number>`)
- **Artifacts:** Ensure all docs are moved to `docs/sprints/`.

---

## �🔄 Session Resume Checklist

**When starting a new session, AI should:**
1.  ✅ Read this `CONTEXT.md` file.
2.  ✅ Check `docs/README.md` for specific documentation.
3.  ✅ Verify working directory: `/Users/skc/DataScience/upr`.

**Last Context Update:** 2025-11-21 (Sprint 49 Completion)
