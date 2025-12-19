/**
 * SILENT VALIDATION - PHASE 1: Scenario Seeding
 *
 * SCOPE LOCKED:
 *   Vertical: Banking
 *   Sub-Vertical: Employee Banking
 *   Region: UAE
 *
 * Creates 35 independent SalesScenarios for Employee Banking UAE
 * Each scenario has: Persona, Context, Golden Path, Kill Path
 *
 * DO NOT EDIT AFTER CREATION - Scenarios are immutable for validation
 */

import { createScenario, PATH_TYPES, SUCCESS_CONDITIONS, HARD_OUTCOMES } from '../../os/sales-bench/index.js';
import { createScenarioRecord } from '../../os/sales-bench/storage/scenario-store.js';
import { createBuyerBot, BOT_CATEGORIES } from '../../os/sales-bench/index.js';

// ============================================================================
// SCOPE LOCK - DO NOT CHANGE
// ============================================================================
const SCOPE = Object.freeze({
  vertical: 'banking',
  sub_vertical: 'employee_banking',
  region: 'UAE',
  validation_id: `silent_validation_${Date.now()}`,
  created_at: new Date().toISOString(),
  frozen: true,
});

console.log('='.repeat(70));
console.log('SILENT VALIDATION - PHASE 1: SCENARIO SEEDING');
console.log('='.repeat(70));
console.log('');
console.log('SCOPE LOCKED:');
console.log(`  Vertical: ${SCOPE.vertical}`);
console.log(`  Sub-Vertical: ${SCOPE.sub_vertical}`);
console.log(`  Region: ${SCOPE.region}`);
console.log(`  Validation ID: ${SCOPE.validation_id}`);
console.log('');

// ============================================================================
// BUYER BOT IDS - Pre-created for scenarios
// ============================================================================
const BUYER_BOTS = {
  skeptical_hr: 'bot_skeptical_hr_eb_uae',
  busy_payroll: 'bot_busy_payroll_eb_uae',
  compliance_officer: 'bot_compliance_eb_uae',
  price_sensitive: 'bot_price_sensitive_eb_uae',
  decision_influencer: 'bot_influencer_eb_uae',
};

// ============================================================================
// EMPLOYEE BANKING UAE SCENARIOS (35 total)
// Each represents a REAL conversation type, not idealized
// ============================================================================

const EB_SCENARIOS = [
  // ========== GROUP 1: SKEPTICAL HR PERSONAS (7 scenarios) ==========
  {
    id: 'EB-UAE-001',
    name: 'Skeptical HR Director - Large Corp Payroll Migration',
    entry_intent: 'migrate_payroll_account',
    buyer_bot_id: BUYER_BOTS.skeptical_hr,
    persona_description: 'Risk-averse HR Director with existing competitor relationship, needs board approval',
    context: { company_size: '2000+', current_bank: 'ADCB', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'price_objection' },
  },
  {
    id: 'EB-UAE-002',
    name: 'Skeptical HR Manager - SME First Bank Account',
    entry_intent: 'open_wps_account',
    buyer_bot_id: BUYER_BOTS.skeptical_hr,
    persona_description: 'New to banking, price sensitive, confused by WPS requirements',
    context: { company_size: '15-50', current_bank: 'none', urgency: 'high' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'compliance_gap' },
  },
  {
    id: 'EB-UAE-003',
    name: 'Skeptical CFO - Cost Reduction Focus',
    entry_intent: 'reduce_banking_costs',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Numbers-driven CFO, suspicious of bank fees, short attention span',
    context: { company_size: '200-500', current_bank: 'ENBD', urgency: 'medium' },
    constraints: { regulatory: false, pricing_fixed: true, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'roi_failure' },
  },
  {
    id: 'EB-UAE-004',
    name: 'Skeptical Operations Head - Integration Concerns',
    entry_intent: 'integrate_payroll_system',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Technical stakeholder with IT veto power, worried about disruption',
    context: { company_size: '500-1000', current_bank: 'FAB', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'technical_gap' },
  },
  {
    id: 'EB-UAE-005',
    name: 'Skeptical CEO - Personal Banking Bundle',
    entry_intent: 'corporate_personal_bundle',
    buyer_bot_id: BUYER_BOTS.skeptical_hr,
    persona_description: 'Busy CEO/Owner, wants personal benefits, distrusts banks',
    context: { company_size: '50-100', current_bank: 'RAKBank', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'aggressive_pitch' },
  },
  {
    id: 'EB-UAE-006',
    name: 'Skeptical Finance Manager - Audit Concerns',
    entry_intent: 'improve_audit_compliance',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Detail-oriented, compliance-focused, risk-averse',
    context: { company_size: '100-200', current_bank: 'Mashreq', urgency: 'medium' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'audit_documentation_gap' },
  },
  {
    id: 'EB-UAE-007',
    name: 'Skeptical HR - Bad Past Experience',
    entry_intent: 'switch_payroll_provider',
    buyer_bot_id: BUYER_BOTS.skeptical_hr,
    persona_description: 'Burned by previous bank, defensive, needs reassurance',
    context: { company_size: '30-75', current_bank: 'CBD', urgency: 'high' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'dismissive_attitude' },
  },

  // ========== GROUP 2: BUSY PAYROLL MANAGER PERSONAS (7 scenarios) ==========
  {
    id: 'EB-UAE-008',
    name: 'Busy Payroll Manager - Multi-Branch Setup',
    entry_intent: 'multi_branch_payroll',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Time-poor, practical, hates complexity',
    context: { company_size: '300-600', current_bank: 'ADIB', urgency: 'medium' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'long_winded_pitch' },
  },
  {
    id: 'EB-UAE-009',
    name: 'Busy Payroll Manager - Month-End Pressure',
    entry_intent: 'emergency_payroll_backup',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Under deadline, irritable, needs immediate help',
    context: { company_size: '150-300', current_bank: 'ENBD', urgency: 'critical' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'sales_during_crisis' },
  },
  {
    id: 'EB-UAE-010',
    name: 'Busy Payroll Manager - Free Zone Company',
    entry_intent: 'difc_payroll_setup',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Free zone experienced, knows regulations, value-focused',
    context: { company_size: '50-150', current_bank: 'FAB', urgency: 'low' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'freezone_ignorance' },
  },
  {
    id: 'EB-UAE-011',
    name: 'Busy Payroll Manager - Construction Company',
    entry_intent: 'bulk_worker_payroll',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Blue-collar workforce, cash advance needs, high turnover',
    context: { company_size: '500-2000', current_bank: 'CBD', urgency: 'medium' },
    constraints: { regulatory: true, pricing_fixed: true, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'volume_pricing_gap' },
  },
  {
    id: 'EB-UAE-012',
    name: 'Busy Payroll Manager - Hospitality Chain',
    entry_intent: 'hospitality_payroll',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Multi-location, tip distribution needs, seasonal variations',
    context: { company_size: '200-800', current_bank: 'Mashreq', urgency: 'high' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'hospitality_ignorance' },
  },
  {
    id: 'EB-UAE-013',
    name: 'Busy Payroll Manager - Healthcare Facility',
    entry_intent: 'healthcare_payroll',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Compliance strict, shift differential needs, benefits integration',
    context: { company_size: '100-400', current_bank: 'ENBD', urgency: 'medium' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'dha_compliance_gap' },
  },
  {
    id: 'EB-UAE-014',
    name: 'Busy Payroll Manager - Retail Chain',
    entry_intent: 'retail_commission_payroll',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'High turnover, commission calculations, multiple pay frequencies',
    context: { company_size: '300-1000', current_bank: 'RAKBank', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'switching_cost_rejection' },
  },

  // ========== GROUP 3: COMPLIANCE-FOCUSED PERSONAS (7 scenarios) ==========
  {
    id: 'EB-UAE-015',
    name: 'Compliance Officer - WPS Audit Prep',
    entry_intent: 'wps_audit_preparation',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Regulatory expert, documentation obsessed, zero tolerance for gaps',
    context: { company_size: '200-500', current_bank: 'ADCB', urgency: 'high' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'wps_documentation_gap' },
  },
  {
    id: 'EB-UAE-016',
    name: 'Legal Counsel - Contract Review',
    entry_intent: 'vendor_contract_review',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Contract-focused, liability concerned, slow decision maker',
    context: { company_size: '100-300', current_bank: 'FAB', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'pressure_for_quick_decision' },
  },
  {
    id: 'EB-UAE-017',
    name: 'Compliance Manager - Data Privacy Concerns',
    entry_intent: 'data_privacy_review',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'GDPR aware, data localization concerns, security focused',
    context: { company_size: '150-400', current_bank: 'ENBD', urgency: 'medium' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'data_protection_unclear' },
  },
  {
    id: 'EB-UAE-018',
    name: 'Risk Manager - Business Continuity',
    entry_intent: 'business_continuity_review',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Disaster recovery focused, redundancy requirements, SLA obsessed',
    context: { company_size: '300-800', current_bank: 'Mashreq', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'vague_dr_answers' },
  },
  {
    id: 'EB-UAE-019',
    name: 'Internal Auditor - Process Review',
    entry_intent: 'payroll_process_audit',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Process-oriented, control-focused, evidence-based',
    context: { company_size: '500-1500', current_bank: 'ADIB', urgency: 'medium' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'control_documentation_gap' },
  },
  {
    id: 'EB-UAE-020',
    name: 'Government Relations - Ministry Requirements',
    entry_intent: 'emiratization_compliance',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Regulatory liaison, ministry relationships, documentation expert',
    context: { company_size: '1000-3000', current_bank: 'FAB', urgency: 'high' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'emiratization_gap' },
  },
  {
    id: 'EB-UAE-021',
    name: 'External Auditor Prep - Big 4 Audit',
    entry_intent: 'big4_audit_preparation',
    buyer_bot_id: BUYER_BOTS.compliance_officer,
    persona_description: 'Big 4 relationship, materiality focused, time pressured',
    context: { company_size: '400-1000', current_bank: 'ENBD', urgency: 'critical' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'no_big4_experience' },
  },

  // ========== GROUP 4: PRICE-SENSITIVE PERSONAS (7 scenarios) ==========
  {
    id: 'EB-UAE-022',
    name: 'Cost-Conscious Startup - Series A',
    entry_intent: 'startup_corporate_banking',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Burn rate conscious, scaling rapidly, wants flexibility',
    context: { company_size: '20-80', current_bank: 'none', urgency: 'high' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'rigid_pricing' },
  },
  {
    id: 'EB-UAE-023',
    name: 'Family Business - Fee Negotiation',
    entry_intent: 'fee_negotiation',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Long-term oriented, relationship focused, price negotiator',
    context: { company_size: '50-200', current_bank: 'Mashreq_30yrs', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'criticize_current_bank' },
  },
  {
    id: 'EB-UAE-024',
    name: 'Procurement Manager - RFP Process',
    entry_intent: 'rfp_banking_services',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Process-driven, three quotes minimum, committee decision',
    context: { company_size: '300-700', current_bank: 'ADCB', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'bypass_procurement' },
  },
  {
    id: 'EB-UAE-025',
    name: 'Budget Owner - Annual Planning',
    entry_intent: 'annual_budget_planning',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Budget cycle focused, ROI required, board presentation needed',
    context: { company_size: '200-500', current_bank: 'FAB', urgency: 'medium' },
    constraints: { regulatory: false, pricing_fixed: true, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'no_roi_justification' },
  },
  {
    id: 'EB-UAE-026',
    name: 'Cash-Strapped SME - Survival Mode',
    entry_intent: 'minimum_wps_compliance',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Cash flow issues, basic needs only, skeptical of banks',
    context: { company_size: '10-30', current_bank: 'CBD', urgency: 'high' },
    constraints: { regulatory: true, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'premium_positioning' },
  },
  {
    id: 'EB-UAE-027',
    name: 'Multinational Subsidiary - Global Mandate',
    entry_intent: 'local_banking_supplement',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Global bank relationship, limited local authority, HQ compliance',
    context: { company_size: '100-500', current_bank: 'HSBC_global', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'attack_global_bank' },
  },
  {
    id: 'EB-UAE-028',
    name: 'Negotiator - Playing Banks Against Each Other',
    entry_intent: 'competitive_quote',
    buyer_bot_id: BUYER_BOTS.price_sensitive,
    persona_description: 'Using competition, no loyalty, price-only focus',
    context: { company_size: '150-400', current_bank: 'multiple_quotes', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'race_to_bottom' },
  },

  // ========== GROUP 5: DECISION INFLUENCERS (7 scenarios) ==========
  {
    id: 'EB-UAE-029',
    name: 'IT Director - System Integration Gatekeeper',
    entry_intent: 'erp_banking_integration',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Technical veto power, security focused, integration expert',
    context: { company_size: '300-800', current_bank: 'ENBD', urgency: 'medium' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.BLOCK, trigger: 'technical_incompetence' },
  },
  {
    id: 'EB-UAE-030',
    name: 'Employee Council Rep - Staff Satisfaction',
    entry_intent: 'employee_banking_benefits',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Staff advocate, service focused, complaint collector',
    context: { company_size: '200-600', current_bank: 'ADIB', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'ignore_employee_experience' },
  },
  {
    id: 'EB-UAE-031',
    name: 'Board Member - Strategic Initiative',
    entry_intent: 'strategic_banking_partnership',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Strategic focus, limited operational interest, network connected',
    context: { company_size: '500-2000', current_bank: 'FAB', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'too_tactical' },
  },
  {
    id: 'EB-UAE-032',
    name: 'External Consultant - Bank Selection Project',
    entry_intent: 'vendor_evaluation',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Objective evaluator, framework user, client-focused',
    context: { company_size: '400-1200', current_bank: 'multiple_review', urgency: 'medium' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'incomplete_information' },
  },
  {
    id: 'EB-UAE-033',
    name: 'Accountant - Daily Operations',
    entry_intent: 'payroll_portal_improvement',
    buyer_bot_id: BUYER_BOTS.busy_payroll,
    persona_description: 'Operational user, efficiency focused, training needs',
    context: { company_size: '100-300', current_bank: 'Mashreq', urgency: 'low' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.QUALIFIED_HANDOFF, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'complex_no_training' },
  },
  {
    id: 'EB-UAE-034',
    name: 'New HR Director - Making Their Mark',
    entry_intent: 'hr_transformation_banking',
    buyer_bot_id: BUYER_BOTS.decision_influencer,
    persona_description: 'Change agent, proving value, quick wins needed',
    context: { company_size: '200-500', current_bank: 'RAKBank', urgency: 'high' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: true, competitor_mention: false },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'long_implementation' },
  },
  {
    id: 'EB-UAE-035',
    name: 'Retiring Manager - Handover Situation',
    entry_intent: 'payroll_handover_review',
    buyer_bot_id: BUYER_BOTS.skeptical_hr,
    persona_description: 'Legacy focused, knowledge transfer, risk-averse on changes',
    context: { company_size: '150-400', current_bank: 'ADCB_15yrs', urgency: 'none' },
    constraints: { regulatory: false, pricing_fixed: false, time_pressure: false, competitor_mention: true },
    golden: { success: SUCCESS_CONDITIONS.NEXT_STEP_COMMITTED, outcome: HARD_OUTCOMES.PASS },
    kill: { success: SUCCESS_CONDITIONS.CORRECT_REFUSAL, outcome: HARD_OUTCOMES.FAIL, trigger: 'dismiss_legacy' },
  },
];

// ============================================================================
// EXECUTION
// ============================================================================

async function seedScenarios() {
  console.log(`Creating ${EB_SCENARIOS.length} Employee Banking UAE scenarios...`);
  console.log(`Each scenario gets Golden + Kill path = ${EB_SCENARIOS.length * 2} total`);
  console.log('');

  const results = {
    created: 0,
    failed: 0,
    scenarios: [],
  };

  for (const scenarioData of EB_SCENARIOS) {
    try {
      // Create Golden Path scenario
      const goldenScenario = createScenario({
        vertical: SCOPE.vertical,
        sub_vertical: SCOPE.sub_vertical,
        region: SCOPE.region,
        entry_intent: scenarioData.entry_intent,
        buyer_bot_id: scenarioData.buyer_bot_id,
        path_type: PATH_TYPES.GOLDEN,
        success_condition: scenarioData.golden.success,
        expected_outcome: scenarioData.golden.outcome,
        constraints: scenarioData.constraints,
        tolerances: { max_turns: 10, max_latency_ms: 5000, max_cost_usd: 0.10 },
      });

      // Create Kill Path scenario
      const killScenario = createScenario({
        vertical: SCOPE.vertical,
        sub_vertical: SCOPE.sub_vertical,
        region: SCOPE.region,
        entry_intent: `${scenarioData.entry_intent}_kill`,
        buyer_bot_id: scenarioData.buyer_bot_id,
        path_type: PATH_TYPES.KILL,
        success_condition: scenarioData.kill.success,
        expected_outcome: scenarioData.kill.outcome,
        constraints: { ...scenarioData.constraints, failure_trigger: scenarioData.kill.trigger },
        tolerances: { max_turns: 10, max_latency_ms: 5000, max_cost_usd: 0.10 },
      });

      results.scenarios.push({
        id: scenarioData.id,
        name: scenarioData.name,
        persona: scenarioData.persona_description,
        golden: {
          scenario_id: goldenScenario.scenario_id,
          hash: goldenScenario.hash,
          expected_outcome: goldenScenario.expected_outcome,
        },
        kill: {
          scenario_id: killScenario.scenario_id,
          hash: killScenario.hash,
          expected_outcome: killScenario.expected_outcome,
          trigger: scenarioData.kill.trigger,
        },
      });

      results.created += 2;
      console.log(`  [+] ${scenarioData.id}: ${scenarioData.name}`);
      console.log(`      Golden: ${scenarioData.golden.outcome} | Kill: ${scenarioData.kill.outcome} (${scenarioData.kill.trigger})`);

    } catch (error) {
      results.failed++;
      console.error(`  [!] ${scenarioData.id}: FAILED - ${error.message}`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('PHASE 1 COMPLETE - SCENARIOS FROZEN');
  console.log('='.repeat(70));
  console.log(`Total scenarios created: ${results.created}`);
  console.log(`  Golden paths: ${results.scenarios.length}`);
  console.log(`  Kill paths: ${results.scenarios.length}`);
  console.log(`Failed: ${results.failed}`);
  console.log('');
  console.log('⚠️  DO NOT EDIT THESE SCENARIOS');
  console.log('⚠️  Garbage in is okay. Changing inputs after seeing outputs is cheating.');
  console.log('');

  // Output scenario manifest for tracking
  const manifest = {
    scope: SCOPE,
    scenario_count: results.created,
    golden_count: results.scenarios.length,
    kill_count: results.scenarios.length,
    personas: {
      skeptical_hr: results.scenarios.filter(s => s.id.match(/EB-UAE-00[1-7]/)).length,
      busy_payroll: results.scenarios.filter(s => s.id.match(/EB-UAE-0(0[89]|1[0-4])/)).length,
      compliance: results.scenarios.filter(s => s.id.match(/EB-UAE-0(1[5-9]|2[01])/)).length,
      price_sensitive: results.scenarios.filter(s => s.id.match(/EB-UAE-02[2-8]/)).length,
      influencer: results.scenarios.filter(s => s.id.match(/EB-UAE-0(29|3[0-5])/)).length,
    },
    scenarios: results.scenarios,
    frozen_at: new Date().toISOString(),
  };

  // Save manifest to file
  const fs = await import('fs');
  const manifestPath = `/Users/skc/Projects/UPR/upr-os/scripts/validation/manifest_${SCOPE.validation_id}.json`;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`MANIFEST saved to: ${manifestPath}`);
  console.log('');

  return results;
}

// Run
seedScenarios().catch(console.error);
