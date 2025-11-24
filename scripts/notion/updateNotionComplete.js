#!/usr/bin/env node
/**
 * Complete Notion Updater - Bulletproof Notion updates
 * Eliminates all 10 recurring issues with schema validation and Git integration
 *
 * Usage: node updateNotionComplete.js [sprint_number] [previous_sprint_number]
 * Example: node updateNotionComplete.js 31 30
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { SchemaInspector } from './lib/schemaInspector.js';
import { GitDataExtractor } from './lib/gitDataExtractor.js';

// Load configuration
const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Initialize utilities
const schemaInspector = new SchemaInspector(notion);
const gitExtractor = new GitDataExtractor();

// Database names
const DB_SPRINTS = 'Sprints';
const DB_MODULE_FEATURES = 'Module Features';

/**
 * Sprint data configuration
 * Add new sprints here with their completion details
 */
const SPRINT_DATA = {
  33: {
    status: 'Done',
    completedAt: '2025-11-18',
    outcomes: 'Phase 8: Opportunity Lifecycle Engine complete. 7-state machine, auto-transitions, 21+ intents, journey tracking. 296/296 tests passing (100%). QA Certified.',
    sprintNotes: 'Test Results: 296/296 passing (100%). Comprehensive QA: 4 checkpoints + smoke test + certification. Files: 22 files, 4,700 LOC. Database: Full schema with tables, views, functions. Performance: <1s transitions, 50 ops/sec batch.',
    highlights: '• 7-state lifecycle machine (DISCOVERED → QUALIFIED → OUTREACH → ENGAGED → NEGOTIATING → DORMANT → CLOSED)\n• Auto-transition logic (time, activity, score, event-based)\n• 21+ business intent mappings\n• RESTful API with 11 endpoints\n• Complete journey tracking and analytics\n• State visualization (ASCII + Mermaid)\n• 296 tests, 100% pass rate',
    goal: 'Implement comprehensive opportunity lifecycle state machine with automated transitions, journey tracking, and re-engagement logic',
    businessValue: 'Automates 80% of manual tracking effort, provides complete journey visibility, enables data-driven optimization, supports automatic re-engagement after 60 days. Scalable to thousands of opportunities with batch processing.',
    learnings: '• Event-driven architecture enables extensibility\n• Test-driven development with checkpoints caught issues early\n• Persistence layer abstraction simplified testing\n• Intent mapping pattern simplified business logic\n• Performance optimization critical for batch operations\n• Comprehensive documentation aids stakeholder communication'
  },
  30: {
    status: 'Done',
    completedAt: '2025-01-18',
    outcomes: 'Phase 5: Agent Hub REST API complete. 18/18 tests passing. Migrated to Express routes with authentication, input validation, standardized responses.',
    sprintNotes: 'Test Results: 18/18 passing (100%). All smoke tests validated. Ready for production deployment.',
    highlights: 'REST API migration complete, authentication implemented, all tests passing',
    goal: 'Transform Agent Hub to production-ready REST API with Express, authentication, and comprehensive testing',
    businessValue: 'Production-ready API enables secure integration with external systems, standardized error handling improves reliability',
    learnings: 'Express migration simplified routing, JWT authentication provides security, comprehensive testing catches edge cases early'
  },
  31: {
    status: 'Done',
    completedAt: '2025-01-18',
    outcomes: 'Phase 6: Voice Template System complete. All 11 features: 23 templates, 3 DB tables, variable substitution, tone adjustment, context-aware generation. Quality score: 93/100.',
    sprintNotes: 'Test Results: 15/15 passing (100%). Fixed: variable enrichment, placeholder validation. Files: 10 files, 3,651 LOC. Database: 23 templates loaded, all smoke tests passing.',
    highlights: 'Voice template system with 23 templates, context-aware generation, 93/100 quality score',
    goal: 'Build comprehensive voice template system with variable substitution, tone adjustment, and context-aware message generation',
    businessValue: 'Automated message generation reduces manual effort, consistent tone maintains brand voice, context-awareness improves personalization',
    learnings: 'Variable enrichment critical for quality, placeholder validation prevents production issues, comprehensive smoke testing ensures reliability'
  },
  32: {
    status: 'Done',
    completedAt: '2025-11-18',
    outcomes: '✅ 3 Doctrine Prompts (Research, Qualification, Strategy)\n✅ A/B Testing Infrastructure\n✅ Multi-Step Prompting (Chain-of-thought)\n✅ Personalization Engine\n✅ Safety Guardrails\n✅ Prompt Analytics API\n✅ Prompt Library API\n✅ 75 Tests Passing (100%)',
    sprintNotes: 'Test Results: 75/75 passing (100%). QA Certified for production. Files: 17 files, 5,515 additions. All safety and performance tests validated.',
    highlights: '• Fixed doctrine prompts for research, qualification, and strategy\n• Complete A/B testing infrastructure with performance tracking\n• Multi-step prompting with chain-of-thought reasoning\n• Industry/company/contact personalization engine\n• Comprehensive safety guardrails and brand compliance\n• Analytics API for usage, performance, and conversions\n• 100% test pass rate (75 tests)',
    goal: 'Implement advanced prompt engineering and optimization system with A/B testing, personalization, and safety guardrails',
    businessValue: 'Enables data-driven prompt optimization, ensures brand compliance, and provides personalized outreach at scale. A/B testing allows continuous improvement of conversion rates.',
    learnings: '• Chain-of-thought prompting improves output quality\n• Safety guardrails catch 100% of brand violations\n• Personalization engine handles edge cases gracefully\n• Performance: <110ms per execution, <1ms per personalization\n• Unicode/Arabic content requires proper length validation'
  },
  50: {
    status: 'Done',
    completedAt: '2025-11-22',
    outcomes: 'Phase 10: SIVA Agent Visualization complete. Performance dashboard, collaboration graph, confidence indicators, decision cards, activity feed, filter bar. 181/181 tests passing (100%).',
    sprintNotes: 'Test Results: 181/181 passing (100%). All SIVA components implemented with full accessibility support. Dark theme (2030 design language) applied throughout.',
    highlights: '• Agent performance dashboard with metrics\n• Collaboration graph visualization\n• Confidence score indicators with tooltips\n• Decision cards with reasoning display\n• Real-time activity feed\n• Advanced filter bar with multi-select\n• 181 tests, 100% pass rate',
    goal: 'Build comprehensive agent visualization system for SIVA with performance metrics, collaboration graphs, and decision tracking',
    businessValue: 'Provides visibility into agent behavior and performance, enables optimization of agent interactions, supports debugging and monitoring of AI decisions.',
    learnings: '• Component-based architecture enables reusability\n• Accessibility-first design improves UX for all users\n• Dark theme reduces eye strain for power users\n• TypeScript strict mode catches errors early'
  },
  51: {
    status: 'Done',
    completedAt: '2025-11-22',
    outcomes: 'Phase 11: Analytics & Insights Dashboard complete. 6 components: AnalyticsDashboard, TimeSeriesChart, MetricCard, CohortAnalysis, ExportManager, DashboardTemplates. 163/163 tests passing (100%).',
    sprintNotes: 'Test Results: 419 total tests passing (163 new analytics + 181 SIVA + 6 enrichment + 69 storybook). Full test suite green. QC Certificate issued.',
    highlights: '• Analytics dashboard with time range selector\n• Recharts-based time series visualization\n• Metric cards with trend indicators\n• Cohort retention analysis heatmap\n• PDF/CSV export functionality\n• Pre-built dashboard templates (Sales, Marketing, Operations, Executive)\n• 163 tests, 100% pass rate',
    goal: 'Build enterprise analytics dashboard with visualizations, cohort analysis, export functionality, and dashboard templates',
    businessValue: 'Enables data-driven decision making, provides business intelligence capabilities, supports executive reporting and operational insights.',
    learnings: '• Recharts integration requires careful TypeScript typing\n• Test timeouts need explicit handling for async operations\n• Template-based approach speeds up dashboard creation\n• Cohort heatmaps effectively communicate retention patterns'
  },
  55: {
    status: 'Done',
    completedAt: '2025-11-22',
    outcomes: 'Phase 12: Predictive Intelligence Engine complete. 6 features: Time-Series Forecasting, Lead Risk Scoring, Prediction API, AI Explanation Panel, Anomaly Detection, Trend Visualization. 240/240 tests passing (100%).',
    sprintNotes: 'Test Results: 240/240 passing (202 core + 38 TC compliance). TC-SC-01 Data Integrity: PASS. TC-SC-02 Performance Baseline: PASS (50K ops <100ms). TC-SC-03 SSE Payload Audit: PASS (<64KB). Files: 15 files, 4,704 LOC.',
    highlights: '• Time-series forecasting with exponential smoothing\n• Multi-factor risk scoring with Zustand store\n• Prediction API integration via usePredictions hook\n• AI explanation panel with factor visualization\n• Anomaly detection with z-score thresholds\n• Trend visualization with sparklines and forecast charts\n• 240 tests, 100% pass rate\n• Industrial-grade TC compliance certified',
    goal: 'Build predictive intelligence engine with forecasting, risk scoring, anomaly detection, and AI explanations',
    businessValue: 'Enables proactive decision-making with ML-powered predictions, risk-based lead prioritization, and early anomaly detection. No UI freezes, memory leaks, or streaming congestion.',
    learnings: '• Zustand selectors must avoid creating new objects to prevent infinite re-renders\n• Floating-point drift prevention critical for UI stability\n• SSE payload size limits require careful consideration\n• Performance testing at scale (50K) catches issues early'
  },
  56: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 13: Knowledge Graph & Agent Infrastructure complete. 8 features: Neo4j API, GraphExplorer, SimilarCompanies, GraphChatIntegration, RelationshipInsights, LeadDiscovery, ToolRegistry, AgentConfig. 344/344 tests passing (100%).',
    sprintNotes: 'Test Results: 344/344 passing (100%). QC Checkpoints: QC1 (184 tests - core graph), QC2 (204 tests - all graph components), QC Final (344 tests - full sprint). Files: 16 files, ~5,200 LOC.',
    highlights: '• Neo4j-compatible graph database service (in-memory)\n• Force-directed graph layout with SVG visualization\n• BFS shortest path finding algorithm\n• Jaccard similarity for entity matching\n• Natural language query detection with entity extraction\n• Graph-based lead discovery with confidence scoring\n• Tool Registry dashboard with metrics and filtering\n• Agent Configuration UI with start/stop controls\n• 344 tests, 100% pass rate',
    goal: 'Build knowledge graph infrastructure with Neo4j integration, graph visualization, chat integration, and agent management tools',
    businessValue: 'Enables relationship-driven insights, graph-based lead discovery, and AI agent management. Knowledge graph provides contextual understanding of entity relationships for better decision-making.',
    learnings: '• Force-directed layout requires iteration tuning (50 iterations optimal)\n• Self-referencing edges need special handling (loop rendering)\n• Query pattern ordering matters for NLU detection\n• Test assertions must account for duplicate text in dropdowns vs badges'
  },
  57: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 14: Advanced Search & Filtering complete. 7 features: Filter Chat Integration, Saved Searches/Filters, Visual Filter Builder, Export Filtered Results, Smart Filter Suggestions, Boolean Query Support, Filter Presets. All tests passing.',
    sprintNotes: 'Test Results: All tests passing. Full filtering infrastructure with chat integration, saved searches, visual builder, and smart suggestions.',
    highlights: '• Chat-integrated filter commands\n• Persistent saved searches/filters\n• Visual drag-and-drop filter builder\n• Filtered results export (CSV/JSON)\n• AI-powered smart filter suggestions\n• Full boolean query support (AND/OR/NOT)\n• Pre-built filter presets',
    goal: 'Build comprehensive search and filtering system with chat integration, visual builder, and smart suggestions',
    businessValue: 'Enables power users to quickly find and segment leads with complex queries. Natural language filtering via chat reduces learning curve.',
    learnings: '• Boolean query parsing requires careful operator precedence\n• Visual builder improves adoption over query syntax\n• Saved filters drive repeated engagement'
  },
  58: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 15: Workflow Automation Engine complete. 7 features: Workflow Builder UI, Scheduled Workflows, Condition Types, Action Types, Trigger Types, Workflow Execution History, Workflow Chat Integration. All tests passing.',
    sprintNotes: 'Test Results: All tests passing. Complete workflow automation with visual builder, scheduler, and chat integration.',
    highlights: '• Visual workflow builder with drag-and-drop\n• Cron-based scheduled workflows\n• 10+ condition types (field, time, status)\n• 15+ action types (email, update, notify)\n• Event/schedule/manual triggers\n• Full execution history with logs\n• Chat commands for workflow management',
    goal: 'Build workflow automation engine with visual builder, scheduling, and comprehensive trigger/action system',
    businessValue: 'Automates repetitive sales tasks, ensures timely follow-ups, and enables complex multi-step sequences without coding.',
    learnings: '• Execution history critical for debugging\n• Conditional branching adds significant complexity\n• Scheduler reliability requires careful error handling'
  },
  59: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 16: Team Collaboration & Access Control complete. 8 features: Role-Based Access Control, Team Workspaces, Lead Assignment, Notification System, Commenting on Leads, Activity Audit Log, Shared Templates, Collaboration Chat Integration. All tests passing.',
    sprintNotes: 'Test Results: All tests passing. Complete RBAC system with team workspaces, secure data access layer, and collaboration tools.',
    highlights: '• Fine-grained RBAC (Admin/Manager/Member/Viewer)\n• Team workspaces with isolation\n• Round-robin and manual lead assignment\n• Real-time notification system\n• Threaded comments on leads\n• Complete activity audit logging\n• Shared template library\n• Chat-based collaboration commands',
    goal: 'Build team collaboration infrastructure with role-based access control, workspaces, and real-time collaboration tools',
    businessValue: 'Enables secure multi-user access, team coordination, and compliance-ready audit trails. Workspace isolation protects data.',
    learnings: '• RBAC propagation through data access layer essential\n• Audit logging must be comprehensive for compliance\n• Real-time notifications improve team coordination'
  },
  60: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 17: Reporting & Analytics Designer complete. 7 features: Report Designer UI, Pivot Table Component, Report Chat Integration, Dashboard Sharing, Report Templates, Scheduled Reports, Custom Metrics/KPIs. All tests passing.',
    sprintNotes: 'Test Results: All tests passing. Complete reporting infrastructure with visual designer, pivot tables, and scheduled delivery.',
    highlights: '• Visual report designer with drag-and-drop\n• Interactive pivot table component\n• Chat commands for report generation\n• Shareable dashboard links with permissions\n• Pre-built report templates (sales, pipeline, activity)\n• Scheduled report delivery (email/slack)\n• Custom KPI definitions and tracking',
    goal: 'Build comprehensive reporting and analytics designer with visual builder, templates, and scheduled delivery',
    businessValue: 'Enables self-service reporting, reduces analyst bottleneck, and ensures stakeholders receive timely insights automatically.',
    learnings: '• Pivot table performance requires virtualization for large datasets\n• Template-based approach accelerates report creation\n• Scheduled delivery increases report consumption'
  },
  61: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 18: Mobile & PWA Experience complete. 6 features: PWA Service Worker, Offline Data Sync, Mobile Navigation, Mobile Chat Experience, Touch-Optimized Components, Offline Chat Queue. 149/149 tests passing (100%).',
    sprintNotes: 'Test Results: 149/149 passing (100%). Full PWA with service worker, IndexedDB offline sync, mobile-first navigation, and touch components. Build successful.',
    highlights: '• PWA Service Worker with cache strategies\n• IndexedDB offline data sync with conflict resolution\n• Mobile bottom navigation with gestures\n• Touch-optimized chat with voice input\n• TouchButton, TouchCard, TouchInput, TouchToggle, TouchSelect, BottomSheet\n• Offline chat queue with retry\n• SVG app icons (72-512px)\n• 149 tests, 100% pass rate',
    goal: 'Build mobile-first PWA experience with offline support, touch-optimized components, and native-like navigation',
    businessValue: 'Enables field sales to access CRM on mobile devices, works offline in areas with poor connectivity, and provides native-like experience without app store distribution.',
    learnings: '• Service worker cache strategies vary by resource type\n• IndexedDB sync requires careful conflict resolution\n• Touch targets need 44px minimum for usability\n• iOS safe areas require CSS environment variables'
  },
  62: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 19: Internationalization & Arabic Support complete. 8 features: i18n Framework Setup, English Strings Extraction, Arabic Translation, RTL Layout Support, RTL Chat Interface, Localized Date/Time/Numbers, Localized Email Templates, AI Responses in Arabic. 61/61 tests passing (100%).',
    sprintNotes: 'Test Results: 61/61 passing (100%). Full i18n with i18next, Arabic translations, RTL support, and locale-aware formatters. Build successful.',
    highlights: '• i18next framework with language detection\n• 4 translation namespaces (common, chat, dashboard, email)\n• Full Arabic translations with RTL\n• RTLProvider for direction management\n• Locale-aware date/time/number formatters\n• Arabic numeral conversion (٠-٩)\n• 5 bilingual email templates\n• AI Arabic response service with language detection\n• 61 tests, 100% pass rate',
    goal: 'Build complete internationalization infrastructure with Arabic language support, RTL layouts, and locale-aware formatting',
    businessValue: 'Opens MENA market with native Arabic experience, enables culturally-aware AI interactions, supports global expansion with i18n infrastructure.',
    learnings: '• Intl.ListFormat uses type parameter not style\n• RTL requires both CSS direction and DOM lang attribute\n• Arabic numerals need bidirectional conversion\n• i18next namespaces organize translations by domain'
  },
  63: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'Phase 20: Production Readiness & QA complete. 8 features: Chat E2E Test Suite, SIVA Tool Integration Tests, Security Audit, Performance Testing, Production Readiness Checklist, Accessibility Audit, Error Monitoring Enhancement, Documentation Completion. 260/260 QA tests passing (100%).',
    sprintNotes: 'Test Results: 260/260 Sprint 63 tests passing (100%). Full test suite: 3262/3265 tests (99.9%). QC Certification complete.',
    highlights: '• Chat E2E test suite (36 tests)\n• SIVA tool integration tests (36 tests)\n• Security audit (XSS, SQL injection, auth, CORS)\n• Performance benchmarks (data processing, caching)\n• Accessibility audit (WCAG 2.1 AA compliance)\n• Production readiness (health checks, circuit breaker)\n• Feature flag system\n• Error monitoring and logging\n• 260 QA tests, 100% pass rate',
    goal: 'Ensure production readiness through comprehensive QA, security audits, performance testing, and accessibility compliance',
    businessValue: 'Production-ready platform with validated security, performance benchmarks, and accessibility compliance. Confidence for enterprise deployment.',
    learnings: '• Color contrast for dark themes requires careful tuning\n• Circuit breaker pattern essential for resilience\n• Feature flags enable safe gradual rollouts\n• Comprehensive QA catches edge cases before production'
  },
  64: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 1: Unified OS API Layer complete. 9 features: OS API endpoints (/discovery, /enrich, /score, /rank, /outreach, /pipeline), shared response schema, integration tests. 20/20 tests passing (100%).',
    sprintNotes: 'Test Results: 20/20 passing (100%). All OS endpoints unified under /api/os/* namespace. ACID TEST: PASS. Files: 8 files (types.js, discovery.js, enrich.js, score.js, rank.js, outreach.js, pipeline.js, index.js).',
    highlights: '• Unified /api/os/* endpoint structure\n• Standard OS response schema (success, data, reason, confidence, profile, meta)\n• Discovery endpoint with multi-source support\n• Enrich endpoint with source priority\n• Score endpoint (Q/T/L/E scores)\n• Rank endpoint with configurable profiles\n• Outreach endpoint with tone/channel control\n• Pipeline endpoint for full orchestration\n• 20 tests, 100% pass rate',
    goal: 'Create unified OS API layer with consistent endpoints, response schema, and full pipeline orchestration',
    businessValue: 'Single entry point for all OS operations, standardized responses enable consistent client integration, pipeline mode automates discovery-to-outreach flow.',
    learnings: '• Router modularization improves maintainability\n• Standard response schema critical for client consistency\n• Pipeline orchestration simplifies complex workflows'
  },
  65: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 2: Multi-Tenant Isolation Layer complete. 10 features: Tenant context middleware, Tenant-Safe ORM, RLS policies, cross-tenant violation detection. 44/44 tests passing (100%).',
    sprintNotes: 'Test Results: 44/44 passing (100%). Complete tenant isolation with middleware + ORM + RLS. Files: tenantContext.js, tenantSafeORM.js, RLS migration.',
    highlights: '• Tenant context middleware (header/JWT/user extraction)\n• Tenant-Safe ORM (auto-injects tenant_id)\n• Row Level Security (RLS) policies for all tables\n• Cross-tenant violation detection and logging\n• Request-level tenant isolation\n• Support for super-admin cross-tenant access\n• Violation event emission for monitoring\n• 44 tests, 100% pass rate',
    goal: 'Implement comprehensive multi-tenant isolation with middleware, ORM, and database-level security',
    businessValue: 'Enterprise-grade tenant isolation ensures data security, compliance-ready architecture, zero data leakage between tenants.',
    learnings: '• RLS provides defense-in-depth\n• ORM auto-injection prevents developer errors\n• Violation logging critical for security audits'
  },
  66: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 3: Dedicated Ranking Engine complete. 9 features: RankingEngine class, 6 industry profiles, Q/T/L/E scoring, ranking explanations. 26/26 tests passing (100%).',
    sprintNotes: 'Test Results: 26/26 passing (100%). Industry-specific ranking profiles with explainability. Files: rankingEngine.js.',
    highlights: '• RankingEngine class with configurable options\n• 6 industry profiles (default, banking_employee, banking_corporate, insurance_individual, recruitment_hiring, saas_b2b)\n• Weights sum to 1.0 for all profiles\n• Tier assignment (HOT/WARM/COLD/DISQUALIFIED)\n• Position change tracking\n• Ranking explanations (strengths, weaknesses, why_not_first)\n• Profile-specific boosts (hiring signals, UAE presence)\n• Custom weight support\n• 26 tests, 100% pass rate',
    goal: 'Build dedicated ranking engine with industry-specific profiles and explainable rankings',
    businessValue: 'Industry-optimized ranking improves lead quality, explainability builds user trust, configurable profiles support diverse use cases.',
    learnings: '• Weight normalization essential for fairness\n• Explanations improve user adoption\n• Profile-specific boosts capture domain knowledge'
  },
  67: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 4: OS Settings Unification complete. 10 features: 6 settings tables, SettingsService, caching, API endpoints. 42/42 tests passing (100%).',
    sprintNotes: 'Test Results: 42/42 passing (100%). Centralized settings management with caching. Files: settingsService.js, settings.js (API), migration (6 tables).',
    highlights: '• os_settings table (key-value config store)\n• scoring_settings table (profile weights per tenant)\n• discovery_settings table (source priorities, thresholds)\n• outreach_settings table (channel/tone defaults)\n• vertical_settings table (industry configurations)\n• persona_settings table (target persona templates)\n• SettingsService with 5-minute cache\n• Value type parsing (string/number/boolean/json)\n• Settings API endpoints (GET/PUT)\n• 42 tests, 100% pass rate',
    goal: 'Unify all hardcoded configuration values into database-backed settings with tenant isolation',
    businessValue: 'Eliminates hardcoded values, enables per-tenant customization, supports runtime configuration changes without deployment.',
    learnings: '• Caching essential for performance\n• Type parsing enables flexible storage\n• Default fallbacks ensure reliability'
  },
  68: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 5: Entity Abstraction Layer complete. 9 features: Entity classes (Company/Individual/Hybrid), EntityService, CRUD operations, search, bulk ops. 43/43 tests passing (100%).',
    sprintNotes: 'Test Results: 43/43 passing (100%). Polymorphic entity model with full CRUD. Files: entityService.js, entities.js (API), migration (5 tables).',
    highlights: '• Entity base class (polymorphic)\n• CompanyEntity (domain, industry, UAE fields)\n• IndividualEntity (email, title, skills)\n• HybridEntity (company + contact pairs)\n• EntityService with CRUD operations\n• Multi-field search (ILIKE)\n• Bulk update operations\n• Enrichment queue management\n• Tier-based filtering\n• entity_signals, entity_relationships, entity_history, entity_tags tables\n• RLS for all tables\n• 43 tests, 100% pass rate',
    goal: 'Create unified entity model that handles companies, individuals, and hybrid entities polymorphically',
    businessValue: 'Supports B2B, B2C, and B2B2C use cases with single data model, simplifies client integration, enables sophisticated entity relationships.',
    learnings: '• Factory pattern simplifies entity creation\n• Polymorphic toJSON handles type differences\n• Relationship tables enable graph queries'
  },
  69: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 6: Orchestration Hardening complete. 10 features: Circuit breaker, retry logic, pipeline state machine, DLQ, health checks. 44/44 tests passing (100%).',
    sprintNotes: 'Test Results: 44/44 passing (100%). Enterprise-grade resilience with fail-safe patterns. Files: orchestrationService.js, migration (5 tables).',
    highlights: '• CircuitBreaker class (CLOSED/OPEN/HALF_OPEN states)\n• Configurable failure/success thresholds\n• retryWithBackoff (exponential + 30% jitter)\n• Pipeline state machine (PENDING/RUNNING/PAUSED/COMPLETED/FAILED/CANCELLED)\n• Step states (PENDING/RUNNING/COMPLETED/FAILED/SKIPPED)\n• Circuit breakers for all external services\n• Graceful degradation with fallback results\n• Dead letter queue for failed jobs\n• Pipeline state persistence\n• Health check endpoint\n• 44 tests, 100% pass rate',
    goal: 'Implement enterprise-grade orchestration with circuit breakers, retry logic, and graceful degradation',
    businessValue: 'Production-ready resilience, automatic failure recovery, zero data loss with DLQ, predictable behavior under stress.',
    learnings: '• Circuit breakers prevent cascade failures\n• Jitter essential for distributed systems\n• Fallbacks maintain UX during outages'
  },
  70: {
    status: 'Done',
    completedAt: '2025-11-23',
    outcomes: 'OS Hardening Phase 7: Vertical Engine Shell complete. 11 features: 12 verticals, scoring/discovery/outreach configs, UAE boost, recommendations, validation. 44/44 tests passing (100%).',
    sprintNotes: 'Test Results: 44/44 passing (100%). Industry-specific configuration engine. Files: verticalEngine.js, migration (4 tables).',
    highlights: '• 12 industry verticals (Banking Employee/Corporate, Insurance Individual/Corporate, Recruitment Hiring/Candidate, SaaS B2B/B2C, Real Estate Commercial/Residential, Healthcare Provider/Payer)\n• Per-vertical scoring profiles\n• Per-vertical discovery configs (sources, signals, keywords)\n• Per-vertical outreach configs (tone, channels, messages)\n• UAE boost configuration\n• UAE entity detection (location/emirate/country)\n• Vertical recommendations with scoring\n• Entity validation against vertical requirements\n• Custom vertical creation\n• Outreach template generation\n• 44 tests, 100% pass rate',
    goal: 'Build vertical engine with industry-specific configurations for all OS components',
    businessValue: 'Out-of-box support for 12 industry verticals, customizable configurations, UAE market optimization, intelligent vertical recommendations.',
    learnings: '• Industry-specific defaults accelerate onboarding\n• UAE boost captures regional market requirements\n• Recommendations reduce configuration burden'
  }
};

/**
 * Module Features data - Phase-level updates
 * Module Features DB is organized by Phases, not individual features
 */
const MODULE_FEATURES_DATA = {
  33: {
    phaseName: 'Phase 8: Opportunity Lifecycle Engine',
    status: 'Done',
    notes: 'Complete lifecycle state machine: 7 states, auto-transitions, 21+ intents, journey tracking, analytics. 296/296 tests passing (100%). Features: State Machine Design, Database Schema, State Engine, Persistence, Triggers, Auto-Transition, API (11 endpoints), Intent Mapper, Visualization, Smoke Test, QA Certification.',
    completedAt: '2025-11-18'
  },
  32: {
    phaseName: 'Phase 6: Prompt Engineering & Optimization',
    status: 'Done',
    notes: 'Complete prompt engineering system: 3 doctrine prompts (Research, Qualification, Strategy), A/B testing infrastructure, multi-step prompting with chain-of-thought, personalization engine (industry/company/contact), safety guardrails, analytics API. 75/75 tests passing (100%). QA Certified for production.',
    completedAt: '2025-11-18'
  },
  31: {
    phaseName: 'Phase 6: Prompt Engineering (Siva-Mode)',
    status: 'Done',
    notes: 'Complete voice template system: 23 templates, 3 DB tables, variable substitution, tone adjustment, context-aware generation. 15/15 tests passing (100%). Quality: 93/100. Features: Voice Template Design, Database, Core Templates, Variable Substitution, Tone Adjustment, Context-Aware Generation, Message Variants, API, Smoke Test, Testing Framework, Integration.',
    completedAt: '2025-01-18'
  },
  30: {
    phaseName: 'Phase 3: Centralized Agentic Hub Design',
    status: 'Done',
    notes: 'REST API complete: Express migration, authentication, input validation, standardized responses. 18/18 tests passing (100%). Production-ready deployment.',
    completedAt: '2025-01-18'
  },
  50: {
    phaseName: 'Phase 10: SIVA Agent Visualization',
    status: 'Done',
    notes: 'Complete SIVA visualization system: PerformanceDashboard, CollaborationGraph, ConfidenceIndicator, DecisionCard, ActivityFeed, FilterBar. 181/181 tests passing (100%). Full accessibility support with ARIA labels, keyboard navigation. Dark theme (2030 design language).',
    completedAt: '2025-11-22'
  },
  51: {
    phaseName: 'Phase 11: Analytics & Insights Dashboard',
    status: 'Done',
    notes: 'Complete analytics dashboard: AnalyticsDashboard, TimeSeriesChart, MetricCard, CohortAnalysis, ExportManager, DashboardTemplates. 163/163 tests passing (100%). Recharts integration, PDF/CSV export, pre-built templates. 419 total tests in full suite.',
    completedAt: '2025-11-22'
  },
  55: {
    phaseName: 'Phase 12: Predictive Intelligence Engine',
    status: 'Done',
    notes: 'Complete predictive intelligence: Time-Series Forecasting (exponential smoothing), Lead Risk Scoring (Zustand store), Prediction API (usePredictions hook), AI Explanation Panel (factor visualization), Anomaly Detection (z-score), Trend Visualization (sparklines/charts). 240/240 tests passing (100%). TC Compliance: Data Integrity, Performance Baseline (50K), SSE Payload Audit all PASSED.',
    completedAt: '2025-11-22'
  },
  56: {
    phaseName: 'Phase 13: Knowledge Graph & Agent Infrastructure',
    status: 'Done',
    notes: 'Complete knowledge graph infrastructure: Neo4j API (in-memory graph DB), GraphExplorer (force-directed layout, SVG), SimilarCompanies (Jaccard similarity), GraphChatIntegration (NLU query detection), RelationshipInsights (metrics panel), LeadDiscovery (graph-based scoring), ToolRegistry (tool management dashboard), AgentConfig (agent start/stop UI). 344/344 tests passing (100%). QC Certified.',
    completedAt: '2025-11-23'
  },
  57: {
    phaseName: 'Phase 14: Advanced Search & Filtering',
    status: 'Done',
    notes: 'Complete search/filter system: Filter Chat Integration, Saved Searches, Visual Filter Builder (drag-drop), Export Filtered Results, Smart Filter Suggestions (AI), Boolean Query Support (AND/OR/NOT), Filter Presets. All tests passing.',
    completedAt: '2025-11-23'
  },
  58: {
    phaseName: 'Phase 15: Workflow Automation Engine',
    status: 'Done',
    notes: 'Complete workflow automation: Workflow Builder UI (visual), Scheduled Workflows (cron), Condition Types (10+), Action Types (15+), Trigger Types (event/schedule/manual), Execution History, Workflow Chat Integration. All tests passing.',
    completedAt: '2025-11-23'
  },
  59: {
    phaseName: 'Phase 16: Team Collaboration & Access Control',
    status: 'Done',
    notes: 'Complete RBAC and collaboration: Role-Based Access Control (Admin/Manager/Member/Viewer), Team Workspaces, Lead Assignment (round-robin), Notification System, Commenting on Leads, Activity Audit Log, Shared Templates, Collaboration Chat Integration. All tests passing.',
    completedAt: '2025-11-23'
  },
  60: {
    phaseName: 'Phase 17: Reporting & Analytics Designer',
    status: 'Done',
    notes: 'Complete reporting infrastructure: Report Designer UI (visual), Pivot Table Component, Report Chat Integration, Dashboard Sharing, Report Templates, Scheduled Reports, Custom Metrics/KPIs. All tests passing.',
    completedAt: '2025-11-23'
  },
  61: {
    phaseName: 'Phase 18: Mobile & PWA Experience',
    status: 'Done',
    notes: 'Complete mobile PWA: PWA Service Worker (cache strategies), Offline Data Sync (IndexedDB), Mobile Navigation (bottom tabs, gestures), Mobile Chat Experience (voice input), Touch-Optimized Components (TouchButton, TouchCard, TouchInput, TouchToggle, TouchSelect, BottomSheet), Offline Chat Queue. 149/149 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  62: {
    phaseName: 'Phase 19: Internationalization & Arabic Support',
    status: 'Done',
    notes: 'Complete i18n infrastructure: i18n Framework Setup (i18next, react-i18next, language detection), English Strings Extraction (4 namespaces), Arabic Translation (full RTL support), RTL Layout Support (RTLProvider, direction management), RTL Chat Interface (bidirectional messaging), Localized Date/Time/Numbers (Intl formatters, Arabic numerals), Localized Email Templates (5 bilingual templates), AI Responses in Arabic (language detection, system prompts). 61/61 tests passing (100%). QC Certified.',
    completedAt: '2025-11-23'
  },
  63: {
    phaseName: 'Phase 20: Production Readiness & QA',
    status: 'Done',
    notes: 'Complete QA suite: Chat E2E Test Suite (message flow, NLU, offline), SIVA Tool Integration Tests (scoring, verification, intelligence, analytics), Security Audit (XSS, SQL injection, auth, CORS), Performance Testing (data processing, caching, concurrency), Production Readiness Checklist (env config, health checks, feature flags, circuit breaker), Accessibility Audit (WCAG 2.1 AA, ARIA), Error Monitoring Enhancement (logging, categorization), Documentation Completion. 260/260 QA tests passing (100%). Full suite: 3262/3265 (99.9%). QC Certified.',
    completedAt: '2025-11-23'
  },
  64: {
    phaseName: 'OS Hardening: Unified API Layer',
    status: 'Done',
    notes: 'Unified OS API Layer: /api/os/discovery, /api/os/enrich, /api/os/score, /api/os/rank, /api/os/outreach, /api/os/pipeline. Standard response schema (success, data, reason, confidence, profile, meta). ACID TEST: PASS. 20/20 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  65: {
    phaseName: 'OS Hardening: Multi-Tenant Isolation',
    status: 'Done',
    notes: 'Multi-Tenant Isolation Layer: Tenant context middleware (header/JWT/user extraction), Tenant-Safe ORM (auto tenant_id injection), Row Level Security (RLS) policies, Cross-tenant violation detection and logging. 44/44 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  66: {
    phaseName: 'OS Hardening: Ranking Engine',
    status: 'Done',
    notes: 'Dedicated Ranking Engine: RankingEngine class, 6 industry profiles (default, banking_employee, banking_corporate, insurance_individual, recruitment_hiring, saas_b2b), Q/T/L/E scoring, tier assignment, ranking explanations (why #1, why not #1). 26/26 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  67: {
    phaseName: 'OS Hardening: Settings Unification',
    status: 'Done',
    notes: 'OS Settings Unification: 6 settings tables (os_settings, scoring_settings, discovery_settings, outreach_settings, vertical_settings, persona_settings), SettingsService with 5-min cache, value type parsing, Settings API endpoints (GET/PUT). 42/42 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  68: {
    phaseName: 'OS Hardening: Entity Abstraction',
    status: 'Done',
    notes: 'Entity Abstraction Layer: Entity classes (Company/Individual/Hybrid), EntityService with CRUD/search/bulk operations, entity_signals, entity_relationships, entity_history, entity_tags tables. RLS for all tables. 43/43 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  69: {
    phaseName: 'OS Hardening: Orchestration',
    status: 'Done',
    notes: 'Orchestration Hardening: CircuitBreaker class (CLOSED/OPEN/HALF_OPEN), retryWithBackoff (exponential + jitter), Pipeline state machine, Dead letter queue, Health checks. Pipeline state persistence with pipeline_executions table. 44/44 tests passing (100%).',
    completedAt: '2025-11-23'
  },
  70: {
    phaseName: 'OS Hardening: Vertical Engine',
    status: 'Done',
    notes: 'Vertical Engine Shell: 12 industry verticals (Banking, Insurance, Recruitment, SaaS, Real Estate, Healthcare), per-vertical scoring/discovery/outreach configs, UAE boost, vertical recommendations, entity validation. 44/44 tests passing (100%).',
    completedAt: '2025-11-23'
  }
};

/**
 * Update Sprints database with full data
 */
async function updateSprint(sprintNumber, previousSprintNumber = null) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`UPDATING SPRINT ${sprintNumber}`);
  console.log('='.repeat(70));

  // Get sprint data
  const sprintData = SPRINT_DATA[sprintNumber];
  if (!sprintData) {
    console.error(`❌ No data configured for Sprint ${sprintNumber}`);
    console.log('Available sprints:', Object.keys(SPRINT_DATA).join(', '));
    return false;
  }

  // Get Git data
  console.log('📊 Extracting Git metadata...');
  const gitData = gitExtractor.getSprintGitData(sprintNumber, previousSprintNumber);
  gitExtractor.printGitData(sprintNumber, previousSprintNumber);

  // Find Sprint in Notion
  console.log(`\n🔍 Finding Sprint ${sprintNumber} in Notion...`);
  const sprintsResponse = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: {
      property: 'Sprint',
      title: {
        contains: `Sprint ${sprintNumber}`
      }
    }
  });

  if (sprintsResponse.results.length === 0) {
    console.error(`❌ Sprint ${sprintNumber} not found in Sprints database`);
    return false;
  }

  const sprint = sprintsResponse.results[0];
  console.log(`✅ Found Sprint ${sprintNumber}: ${sprint.id}`);

  // Build update with schema validation
  const desiredUpdates = {
    'Status': {
      select: { name: sprintData.status }
    },
    'Completed At': {
      date: { start: sprintData.completedAt }
    },
    'Outcomes': {
      rich_text: [{ text: { content: sprintData.outcomes } }]
    },
    'Sprint Notes': {
      rich_text: [{ text: { content: sprintData.sprintNotes } }]
    },
    'Highlights': {
      rich_text: [{ text: { content: sprintData.highlights } }]
    },
    'Goal': {
      rich_text: [{ text: { content: sprintData.goal } }]
    },
    'Business Value': {
      rich_text: [{ text: { content: sprintData.businessValue } }]
    },
    'Learnings': {
      rich_text: [{ text: { content: sprintData.learnings } }]
    },
    'Branch': {
      rich_text: [{ text: { content: gitData.branch } }]
    },
    'Commit': {
      rich_text: [{ text: { content: gitData.commit } }]
    },
    'Commits Count': {
      number: gitData.commitsCount
    },
    'Git Tag': {
      rich_text: [{ text: { content: gitData.gitTag } }]
    },
    'Commit Range': {
      rich_text: [{ text: { content: gitData.commitRange } }]
    },
    'Synced At': {
      date: { start: gitData.syncedAt }
    }
  };

  // Add files if present (files property might be special)
  if (gitData.changedFiles.length > 0) {
    const fileList = gitExtractor.formatFileList(gitData.changedFiles);
    // Files property might not support rich_text, skip if it causes issues
    // desiredUpdates['Files'] = { rich_text: [{ text: { content: fileList } }] };
  }

  // Use schema inspector to build safe update
  const safeUpdates = schemaInspector.buildSafeUpdate(DB_SPRINTS, desiredUpdates);

  console.log(`\n📝 Updating Sprint ${sprintNumber} with ${Object.keys(safeUpdates).length} properties...`);

  try {
    await notion.pages.update({
      page_id: sprint.id,
      properties: safeUpdates
    });

    console.log(`✅ Sprint ${sprintNumber} updated successfully`);
    console.log(`   • Status: ${sprintData.status}`);
    console.log(`   • Git Data: ${gitData.commitsCount} commits, ${gitData.filesCount} files`);
    console.log(`   • Branch: ${gitData.branch}`);
    console.log(`   • Commit: ${gitData.commitShort}`);

    return true;
  } catch (error) {
    console.error(`❌ Failed to update Sprint ${sprintNumber}:`, error.message);
    return false;
  }
}

/**
 * Update ALL Module Features for a specific sprint
 * Bulk updates all features in parallel for efficiency
 */
async function updateModuleFeatures(sprintNumber) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`UPDATING ALL MODULE FEATURES FOR SPRINT ${sprintNumber}`);
  console.log('='.repeat(70));

  try {
    // Query all features for this sprint
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: sprintNumber
        }
      }
    });

    console.log(`\n✅ Found ${featuresResponse.results.length} features for Sprint ${sprintNumber}`);

    if (featuresResponse.results.length === 0) {
      console.log(`⚠️  No features found for Sprint ${sprintNumber}`);
      return false;
    }

    // Update all features in parallel for efficiency
    const updatePromises = featuresResponse.results.map(async (feature) => {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      const currentStatus = feature.properties.Status?.select?.name || 'Unknown';
      const currentDone = feature.properties['Done?']?.checkbox || false;

      // Skip if already done
      if (currentStatus === 'Done' && currentDone) {
        console.log(`⏭️  Already done: ${name}`);
        return { success: true, skipped: true, name };
      }

      // Build update
      const desiredUpdates = {
        'Status': {
          select: { name: 'Done' }
        },
        'Completed At': {
          date: { start: '2025-01-18' }
        },
        'Done?': {
          checkbox: true
        }
      };

      // Use schema inspector for safe update
      const safeUpdates = schemaInspector.buildSafeUpdate(DB_MODULE_FEATURES, desiredUpdates);

      try {
        await notion.pages.update({
          page_id: feature.id,
          properties: safeUpdates
        });

        console.log(`✅ Updated: ${name}`);
        return { success: true, skipped: false, name };
      } catch (error) {
        console.error(`❌ Failed: ${name} - ${error.message}`);
        return { success: false, skipped: false, name };
      }
    });

    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);

    // Count results
    const updated = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n📊 Module Features Update Summary:`);
    console.log(`   • Updated: ${updated}`);
    console.log(`   • Skipped: ${skipped}`);
    console.log(`   • Failed: ${failed}`);

    return updated > 0 || skipped > 0;
  } catch (error) {
    console.error(`❌ Failed to update Module Features:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('='.repeat(70));
    console.log('COMPLETE NOTION UPDATE - SPRINTS & MODULE FEATURES');
    console.log('='.repeat(70));
    console.log('');

    // Validate environment
    if (!process.env.NOTION_API_KEY) {
      console.error('❌ NOTION_API_KEY not set in environment');
      console.log('Run: source .env && export NOTION_API_KEY=$NOTION_TOKEN');
      process.exit(1);
    }

    // Parse arguments
    const sprintNumber = parseInt(process.argv[2]) || 31;
    const previousSprintNumber = process.argv[3] ? parseInt(process.argv[3]) : null;

    console.log(`📋 Sprint: ${sprintNumber}`);
    if (previousSprintNumber) {
      console.log(`📋 Previous Sprint: ${previousSprintNumber}`);
    }
    console.log('');

    // Step 1: Inspect schemas
    console.log('🔍 Step 1: Inspecting database schemas...\n');
    await schemaInspector.inspectDatabase(dbIds.sprints_db_id, DB_SPRINTS);
    await schemaInspector.inspectDatabase(dbIds.module_features_db_id, DB_MODULE_FEATURES);

    // Print schemas for reference
    schemaInspector.printSchema(DB_SPRINTS);
    schemaInspector.printSchema(DB_MODULE_FEATURES);

    // Step 2: Update Sprints database
    console.log('\n🚀 Step 2: Updating Sprints database...');
    const sprintSuccess = await updateSprint(sprintNumber, previousSprintNumber);

    // Step 3: Update Module Features database
    console.log('\n🚀 Step 3: Updating Module Features database...');
    const featuresSuccess = await updateModuleFeatures(sprintNumber);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('UPDATE SUMMARY');
    console.log('='.repeat(70));
    console.log(`Sprint ${sprintNumber}: ${sprintSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Module Features: ${featuresSuccess ? '✅ SUCCESS' : '⚠️  PARTIAL/SKIPPED'}`);
    console.log('='.repeat(70));

    if (sprintSuccess) {
      console.log('\n✅ Notion update complete!');
      console.log(`\n📌 Next steps:`);
      console.log(`   • Verify updates in Notion`);
      console.log(`   • Check that all columns are filled`);
      console.log(`   • Review Git metadata accuracy`);
      process.exit(0);
    } else {
      console.log('\n❌ Notion update had issues - review errors above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updateSprint, updateModuleFeatures };
