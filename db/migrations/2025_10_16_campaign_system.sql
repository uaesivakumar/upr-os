-- Migration: Campaign System for Intelligent Multi-Campaign Email Platform
-- Date: 2025-10-16
-- Purpose: Transform UPR into intelligent 56-campaign UAE banking outreach system

-- =====================================================
-- 1. CREATE CAMPAIGN CATEGORY ENUM
-- =====================================================
CREATE TYPE campaign_category AS ENUM (
  'transaction_banking',
  'credit_cards',
  'personal_loans',
  'mortgages',
  'investments',
  'insurance',
  'digital_banking',
  'premium_services',
  'business_banking',
  'loyalty_rewards',
  'lifestyle_benefits',
  'education_finance'
);

-- =====================================================
-- 2. CREATE CAMPAIGN TYPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic Info
  name TEXT NOT NULL UNIQUE,
  category campaign_category NOT NULL,
  description TEXT NOT NULL,

  -- Psychology & Conversion Strategy (JSONB for flexibility)
  psychology JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example structure: {
  --   "triggers": ["urgency", "social_proof", "exclusivity"],
  --   "pain_points": ["cash_flow", "missed_opportunities"],
  --   "desires": ["status", "convenience", "savings"]
  -- }

  -- Email Structure
  structure_type TEXT NOT NULL DEFAULT 'value_first',
  -- Options: 'value_first', 'problem_solution', 'story_driven', 'data_driven'

  tone TEXT NOT NULL DEFAULT 'professional',
  -- Options: 'professional', 'friendly', 'urgent', 'consultative', 'aspirational'

  -- Conversion Strategy
  conversion_driver TEXT NOT NULL,
  -- Examples: 'limited_time', 'exclusive_access', 'cost_savings', 'risk_mitigation'

  ideal_cta TEXT NOT NULL,
  -- Example: "Book 15-min call this week", "Download comparison sheet"

  -- Targeting & Personalization
  target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {
  --   "industries": ["oil_gas", "construction"],
  --   "job_titles": ["CFO", "HR Director"],
  --   "company_sizes": ["500-1000", "1000+"],
  --   "lifecycle_stages": ["onboarding", "growth"]
  -- }

  personalization_vars JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Example: ["company_name", "employee_count", "industry", "recent_funding"]

  -- Performance Tracking
  avg_open_rate DECIMAL(5,2) DEFAULT 0.0,
  avg_response_rate DECIMAL(5,2) DEFAULT 0.0,
  total_sent INTEGER DEFAULT 0,

  -- Metadata
  status TEXT NOT NULL DEFAULT 'active',
  -- Options: 'active', 'testing', 'archived'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 3. UPDATE TEMPLATES TABLE
-- =====================================================
-- Add campaign_type_id to templates table
ALTER TABLE templates ADD COLUMN IF NOT EXISTS campaign_type_id UUID REFERENCES campaign_types(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS templates_campaign_type_idx ON templates(campaign_type_id);

-- =====================================================
-- 4. CREATE CAMPAIGN PERFORMANCE TRACKING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  campaign_type_id UUID NOT NULL REFERENCES campaign_types(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,

  -- Performance Metrics
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,

  -- Lead Context
  lead_id UUID,
  lead_industry TEXT,
  lead_size TEXT,
  lead_score INTEGER,

  -- A/B Testing Fields
  variant TEXT DEFAULT 'A',
  -- Options: 'A', 'B', 'C' for split testing

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_perf_campaign_idx ON campaign_performance(campaign_type_id);
CREATE INDEX IF NOT EXISTS campaign_perf_sent_at_idx ON campaign_performance(sent_at DESC);

-- =====================================================
-- 5. SEED CAMPAIGN TYPES (56 Campaigns for UAE Banking)
-- =====================================================

-- CATEGORY: Transaction Banking (8 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Day-1 Salary Accounts for New Joiners',
  'transaction_banking',
  'Welcome new employees with instant salary account setup for companies onboarding talent',
  '{"triggers": ["urgency", "convenience"], "pain_points": ["onboarding_delays", "manual_processes"], "desires": ["efficiency", "employee_satisfaction"]}'::jsonb,
  'problem_solution',
  'professional',
  'time_savings',
  'Schedule 15-min demo this week',
  '{"industries": ["all"], "job_titles": ["HR Director", "CFO", "Operations Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "new_hires_per_month", "current_bank", "onboarding_timeline"]'::jsonb
),
(
  'Bulk Salary Processing for HR',
  'transaction_banking',
  'Streamline monthly salary disbursement with automated bulk processing for HR teams',
  '{"triggers": ["efficiency", "reliability"], "pain_points": ["manual_errors", "time_consuming"], "desires": ["automation", "accuracy"]}'::jsonb,
  'value_first',
  'professional',
  'cost_savings',
  'Get pricing for your team size',
  '{"industries": ["all"], "job_titles": ["HR Manager", "Payroll Manager", "Finance Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["stable", "growth"]}'::jsonb,
  '["company_name", "employee_count", "current_processing_time", "error_rate"]'::jsonb
),
(
  'Multi-Currency Accounts for International Teams',
  'transaction_banking',
  'Enable seamless multi-currency salary payments for companies with global workforce',
  '{"triggers": ["global_presence", "exclusivity"], "pain_points": ["currency_conversion_fees", "complex_transfers"], "desires": ["simplicity", "cost_reduction"]}'::jsonb,
  'data_driven',
  'consultative',
  'cost_savings',
  'Download FX comparison sheet',
  '{"industries": ["technology", "consulting", "oil_gas"], "job_titles": ["CFO", "Finance Director"], "company_sizes": ["200+"], "lifecycle_stages": ["international_expansion"]}'::jsonb,
  '["company_name", "countries_operating", "monthly_fx_volume", "current_bank"]'::jsonb
),
(
  'Zero-Balance Accounts for Cost Optimization',
  'transaction_banking',
  'Maximize interest earnings with zero-balance sweep accounts for treasury management',
  '{"triggers": ["financial_optimization", "smart_money"], "pain_points": ["idle_cash", "missed_interest"], "desires": ["maximized_returns", "efficiency"]}'::jsonb,
  'data_driven',
  'professional',
  'roi_calculation',
  'Calculate your potential earnings',
  '{"industries": ["real_estate", "construction", "manufacturing"], "job_titles": ["CFO", "Treasurer", "Finance Director"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "scaling"]}'::jsonb,
  '["company_name", "avg_account_balance", "current_interest_rate", "idle_cash_amount"]'::jsonb
),
(
  'Corporate Expense Cards for Employee Spending',
  'transaction_banking',
  'Control and track employee expenses with smart corporate cards and real-time reporting',
  '{"triggers": ["control", "visibility"], "pain_points": ["expense_fraud", "delayed_reporting"], "desires": ["transparency", "control"]}'::jsonb,
  'problem_solution',
  'professional',
  'risk_mitigation',
  'Book demo for expense tracking',
  '{"industries": ["all"], "job_titles": ["CFO", "Finance Manager", "Operations Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "employee_count", "monthly_expenses", "current_expense_system"]'::jsonb
),
(
  'Instant Virtual Accounts for Collections',
  'transaction_banking',
  'Automate receivables with unique virtual accounts for each customer/vendor',
  '{"triggers": ["automation", "efficiency"], "pain_points": ["reconciliation_delays", "payment_tracking"], "desires": ["real_time_tracking", "automation"]}'::jsonb,
  'value_first',
  'professional',
  'time_savings',
  'See demo of auto-reconciliation',
  '{"industries": ["ecommerce", "real_estate", "education"], "job_titles": ["CFO", "Accounts Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "monthly_transactions", "reconciliation_time", "customer_count"]'::jsonb
),
(
  'Cash Management Services for Treasury',
  'transaction_banking',
  'Optimize liquidity with advanced cash pooling and forecasting for treasury teams',
  '{"triggers": ["sophistication", "control"], "pain_points": ["cash_flow_uncertainty", "fragmented_accounts"], "desires": ["visibility", "optimization"]}'::jsonb,
  'consultative',
  'professional',
  'expert_consultation',
  'Schedule treasury consultation',
  '{"industries": ["conglomerates", "oil_gas", "real_estate"], "job_titles": ["CFO", "Treasurer", "Group Finance Director"], "company_sizes": ["1000+"], "lifecycle_stages": ["mature", "complex"]}'::jsonb,
  '["company_name", "subsidiary_count", "total_liquidity", "current_treasury_system"]'::jsonb
),
(
  'Trade Finance Solutions for Importers/Exporters',
  'transaction_banking',
  'Secure international trade with letters of credit and supply chain financing',
  '{"triggers": ["security", "global_growth"], "pain_points": ["payment_risk", "working_capital_gaps"], "desires": ["trade_security", "capital_access"]}'::jsonb,
  'problem_solution',
  'consultative',
  'risk_mitigation',
  'Discuss your next import deal',
  '{"industries": ["trading", "manufacturing", "oil_gas"], "job_titles": ["CFO", "Trade Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["international_expansion"]}'::jsonb,
  '["company_name", "annual_trade_volume", "trade_countries", "current_bank"]'::jsonb
);

-- CATEGORY: Credit Cards (6 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Premium Corporate Cards for Executives',
  'credit_cards',
  'Elevate executive travel with premium cards offering lounge access and concierge',
  '{"triggers": ["status", "exclusivity"], "pain_points": ["travel_hassles", "limited_benefits"], "desires": ["prestige", "convenience"]}'::jsonb,
  'aspirational',
  'aspirational',
  'exclusive_access',
  'Request executive card portfolio',
  '{"industries": ["finance", "oil_gas", "technology"], "job_titles": ["CEO", "CFO", "MD"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "scaling"]}'::jsonb,
  '["company_name", "exec_count", "annual_travel_spend", "current_card_provider"]'::jsonb
),
(
  'Business Cashback Cards for SMEs',
  'credit_cards',
  'Earn cashback on all business expenses - fuel, dining, supplies, travel',
  '{"triggers": ["rewards", "savings"], "pain_points": ["no_rewards", "high_costs"], "desires": ["cashback", "value"]}'::jsonb,
  'value_first',
  'friendly',
  'cashback_rewards',
  'Calculate your monthly cashback',
  '{"industries": ["retail", "hospitality", "services"], "job_titles": ["Business Owner", "Finance Manager"], "company_sizes": ["10-100"], "lifecycle_stages": ["startup", "growth"]}'::jsonb,
  '["company_name", "monthly_spend", "spend_categories", "current_card"]'::jsonb
),
(
  'Fuel Cards for Fleet Management',
  'credit_cards',
  'Control fuel costs with dedicated fleet cards and detailed reporting',
  '{"triggers": ["control", "savings"], "pain_points": ["fuel_fraud", "expense_tracking"], "desires": ["cost_control", "transparency"]}'::jsonb,
  'problem_solution',
  'professional',
  'cost_savings',
  'Get fleet card pricing',
  '{"industries": ["logistics", "construction", "oil_gas"], "job_titles": ["Fleet Manager", "Operations Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["growth", "mature"]}'::jsonb,
  '["company_name", "fleet_size", "monthly_fuel_spend", "current_system"]'::jsonb
),
(
  'Travel Cards with Zero FX Markup',
  'credit_cards',
  'Save on international business travel with zero foreign exchange markup',
  '{"triggers": ["savings", "transparency"], "pain_points": ["hidden_fx_fees", "unfavorable_rates"], "desires": ["cost_savings", "transparency"]}'::jsonb,
  'data_driven',
  'professional',
  'cost_comparison',
  'Compare FX rates vs your bank',
  '{"industries": ["consulting", "technology", "trading"], "job_titles": ["Finance Manager", "Travel Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["international_expansion"]}'::jsonb,
  '["company_name", "annual_intl_spend", "destination_countries", "current_fx_costs"]'::jsonb
),
(
  'Virtual Cards for Online Subscriptions',
  'credit_cards',
  'Manage SaaS and online subscriptions with disposable virtual cards',
  '{"triggers": ["security", "control"], "pain_points": ["subscription_sprawl", "card_fraud"], "desires": ["security", "organization"]}'::jsonb,
  'problem_solution',
  'friendly',
  'security_peace_of_mind',
  'Try virtual cards free',
  '{"industries": ["technology", "marketing", "consulting"], "job_titles": ["IT Manager", "Operations Manager"], "company_sizes": ["20-200"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "saas_count", "monthly_subscription_cost", "security_concerns"]'::jsonb
),
(
  'Charge Cards with Extended Credit Terms',
  'credit_cards',
  'Access 45-60 day credit terms for better cash flow management',
  '{"triggers": ["flexibility", "cash_flow"], "pain_points": ["short_credit_terms", "working_capital_constraints"], "desires": ["flexibility", "breathing_room"]}'::jsonb,
  'value_first',
  'consultative',
  'cash_flow_improvement',
  'Discuss extended credit terms',
  '{"industries": ["manufacturing", "trading", "construction"], "job_titles": ["CFO", "Finance Director"], "company_sizes": ["200+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "monthly_spend", "current_credit_terms", "working_capital_needs"]'::jsonb
);

-- CATEGORY: Personal Loans (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Employee Salary Advance Program',
  'personal_loans',
  'Offer employees instant salary advances as a retention and wellness benefit',
  '{"triggers": ["employee_welfare", "retention"], "pain_points": ["employee_financial_stress", "high_turnover"], "desires": ["employee_satisfaction", "retention"]}'::jsonb,
  'value_first',
  'friendly',
  'employee_benefit',
  'Learn about implementation',
  '{"industries": ["retail", "hospitality", "healthcare"], "job_titles": ["HR Director", "CFO"], "company_sizes": ["100+"], "lifecycle_stages": ["growth", "stable"]}'::jsonb,
  '["company_name", "employee_count", "turnover_rate", "current_benefits"]'::jsonb
),
(
  'Staff Education Loans Partnership',
  'personal_loans',
  'Partner with banks to offer subsidized education loans for employee development',
  '{"triggers": ["development", "loyalty"], "pain_points": ["skill_gaps", "talent_retention"], "desires": ["skilled_workforce", "loyalty"]}'::jsonb,
  'story_driven',
  'aspirational',
  'talent_development',
  'Explore education partnership',
  '{"industries": ["technology", "consulting", "finance"], "job_titles": ["HR Director", "L&D Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "employee_count", "training_budget", "skill_development_needs"]'::jsonb
),
(
  'Bulk Personal Loan Facility for Staff',
  'personal_loans',
  'Provide employees with preferential loan rates through corporate tie-ups',
  '{"triggers": ["exclusive_access", "savings"], "pain_points": ["high_interest_rates", "limited_access"], "desires": ["employee_satisfaction", "financial_wellness"]}'::jsonb,
  'value_first',
  'friendly',
  'exclusive_rates',
  'Get rate quote for your staff',
  '{"industries": ["all"], "job_titles": ["HR Director", "CFO"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "stable"]}'::jsonb,
  '["company_name", "employee_count", "avg_salary", "current_bank_partner"]'::jsonb
),
(
  'Emergency Loan Program for Blue-Collar Workers',
  'personal_loans',
  'Support blue-collar workforce with quick emergency loans during crises',
  '{"triggers": ["compassion", "responsibility"], "pain_points": ["employee_emergencies", "predatory_lending"], "desires": ["employee_welfare", "ethical_employment"]}'::jsonb,
  'story_driven',
  'compassionate',
  'social_responsibility',
  'Discuss emergency loan setup',
  '{"industries": ["construction", "manufacturing", "logistics"], "job_titles": ["HR Director", "Operations Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "growth"]}'::jsonb,
  '["company_name", "blue_collar_count", "emergency_cases_per_year", "current_support_system"]'::jsonb
),
(
  'Home Purchase Assistance for Senior Staff',
  'personal_loans',
  'Attract senior talent with home down-payment assistance programs',
  '{"triggers": ["retention", "attraction"], "pain_points": ["talent_competition", "high_housing_costs"], "desires": ["top_talent", "loyalty"]}'::jsonb,
  'aspirational',
  'consultative',
  'talent_attraction',
  'Schedule housing benefit consultation',
  '{"industries": ["finance", "oil_gas", "technology"], "job_titles": ["CFO", "HR Director", "CEO"], "company_sizes": ["500+"], "lifecycle_stages": ["scaling", "mature"]}'::jsonb,
  '["company_name", "senior_staff_count", "housing_market", "retention_challenges"]'::jsonb
);

-- CATEGORY: Mortgages (4 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Corporate Housing Loans for Relocating Staff',
  'mortgages',
  'Simplify relocation with fast-track mortgages for employees moving to UAE',
  '{"triggers": ["convenience", "speed"], "pain_points": ["relocation_stress", "slow_approvals"], "desires": ["smooth_relocation", "employee_satisfaction"]}'::jsonb,
  'problem_solution',
  'professional',
  'speed_convenience',
  'Get pre-approval timeline',
  '{"industries": ["oil_gas", "consulting", "finance"], "job_titles": ["HR Director", "Relocation Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["international_expansion"]}'::jsonb,
  '["company_name", "relocations_per_year", "destination_cities", "current_relocation_partner"]'::jsonb
),
(
  'Bulk Mortgage Facility for Employee Housing',
  'mortgages',
  'Offer employees preferential mortgage rates through corporate partnerships',
  '{"triggers": ["exclusive_benefit", "savings"], "pain_points": ["high_mortgage_rates", "difficult_approvals"], "desires": ["employee_satisfaction", "retention"]}'::jsonb,
  'value_first',
  'friendly',
  'exclusive_rates',
  'Request corporate rate sheet',
  '{"industries": ["all"], "job_titles": ["HR Director", "CFO"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "stable"]}'::jsonb,
  '["company_name", "employee_count", "housing_interest", "current_mortgage_partner"]'::jsonb
),
(
  'Construction Finance for Staff Housing Projects',
  'mortgages',
  'Finance employee housing colonies or staff accommodation projects',
  '{"triggers": ["investment", "loyalty"], "pain_points": ["housing_shortages", "rising_rents"], "desires": ["asset_building", "employee_loyalty"]}'::jsonb,
  'consultative',
  'professional',
  'investment_opportunity',
  'Discuss project financing',
  '{"industries": ["oil_gas", "manufacturing", "utilities"], "job_titles": ["CFO", "Real Estate Manager"], "company_sizes": ["1000+"], "lifecycle_stages": ["mature", "expansion"]}'::jsonb,
  '["company_name", "employee_count", "housing_budget", "land_availability"]'::jsonb
),
(
  'Refinancing Solutions for Existing Mortgagees',
  'mortgages',
  'Help employees save with lower refinancing rates on existing mortgages',
  '{"triggers": ["savings", "financial_wellness"], "pain_points": ["high_interest_burden", "financial_stress"], "desires": ["cost_savings", "employee_welfare"]}'::jsonb,
  'data_driven',
  'friendly',
  'cost_savings',
  'Calculate refinancing savings',
  '{"industries": ["all"], "job_titles": ["HR Director", "Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "mature"]}'::jsonb,
  '["company_name", "employees_with_mortgages", "avg_interest_rate", "potential_savings"]'::jsonb
);

-- CATEGORY: Investments (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Group Investment Plans for Employees',
  'investments',
  'Offer employees group investment plans with preferential rates and guaranteed returns',
  '{"triggers": ["security", "future_planning"], "pain_points": ["retirement_uncertainty", "low_returns"], "desires": ["financial_security", "peace_of_mind"]}'::jsonb,
  'value_first',
  'aspirational',
  'guaranteed_returns',
  'Request investment plan details',
  '{"industries": ["all"], "job_titles": ["HR Director", "CFO"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "mature"]}'::jsonb,
  '["company_name", "employee_count", "avg_salary", "current_investment_offering"]'::jsonb
),
(
  'Treasury Investment Products for Corporates',
  'investments',
  'Maximize returns on idle corporate funds with structured investment products',
  '{"triggers": ["optimization", "returns"], "pain_points": ["idle_cash", "low_interest"], "desires": ["maximized_returns", "liquidity"]}'::jsonb,
  'data_driven',
  'consultative',
  'roi_calculation',
  'Schedule treasury review',
  '{"industries": ["real_estate", "manufacturing", "trading"], "job_titles": ["CFO", "Treasurer"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "scaling"]}'::jsonb,
  '["company_name", "idle_cash_balance", "current_roi", "liquidity_needs"]'::jsonb
),
(
  'ESOP Funding and Management',
  'investments',
  'Implement employee stock ownership plans with financing and management support',
  '{"triggers": ["ownership", "alignment"], "pain_points": ["talent_retention", "alignment_issues"], "desires": ["employee_ownership", "long_term_commitment"]}'::jsonb,
  'consultative',
  'professional',
  'strategic_alignment',
  'Explore ESOP setup',
  '{"industries": ["technology", "startups", "consulting"], "job_titles": ["CEO", "CFO", "HR Director"], "company_sizes": ["50-500"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "employee_count", "valuation", "retention_challenges"]'::jsonb
),
(
  'Provident Fund Management Services',
  'investments',
  'Outsource provident fund administration with guaranteed returns and compliance',
  '{"triggers": ["compliance", "security"], "pain_points": ["regulatory_burden", "fund_management"], "desires": ["compliance", "employee_satisfaction"]}'::jsonb,
  'problem_solution',
  'professional',
  'compliance_assurance',
  'Get compliance audit report',
  '{"industries": ["manufacturing", "healthcare", "education"], "job_titles": ["CFO", "HR Director"], "company_sizes": ["200+"], "lifecycle_stages": ["mature", "stable"]}'::jsonb,
  '["company_name", "employee_count", "current_pf_system", "compliance_concerns"]'::jsonb
),
(
  'Offshore Investment Accounts for Expat Staff',
  'investments',
  'Enable expat employees to invest in home country markets with offshore accounts',
  '{"triggers": ["global_access", "home_ties"], "pain_points": ["limited_investment_options", "currency_restrictions"], "desires": ["global_access", "home_investment"]}'::jsonb,
  'value_first',
  'consultative',
  'global_access',
  'Learn about offshore accounts',
  '{"industries": ["oil_gas", "consulting", "technology"], "job_titles": ["HR Director", "Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["international_workforce"]}'::jsonb,
  '["company_name", "expat_count", "nationalities", "investment_interest"]'::jsonb
);

-- CATEGORY: Insurance (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Group Health Insurance Upgrade',
  'insurance',
  'Enhance employee health coverage with premium group insurance at corporate rates',
  '{"triggers": ["employee_welfare", "security"], "pain_points": ["rising_healthcare_costs", "inadequate_coverage"], "desires": ["comprehensive_coverage", "employee_satisfaction"]}'::jsonb,
  'value_first',
  'professional',
  'enhanced_benefits',
  'Get custom insurance quote',
  '{"industries": ["all"], "job_titles": ["HR Director", "Benefits Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["growth", "stable"]}'::jsonb,
  '["company_name", "employee_count", "current_premium", "coverage_gaps"]'::jsonb
),
(
  'Life Insurance Tied to Home Loans',
  'insurance',
  'Protect employees and families with mortgage-linked life insurance',
  '{"triggers": ["protection", "responsibility"], "pain_points": ["mortgage_risk", "family_security"], "desires": ["peace_of_mind", "protection"]}'::jsonb,
  'story_driven',
  'compassionate',
  'family_protection',
  'Calculate coverage needed',
  '{"industries": ["all"], "job_titles": ["HR Director", "Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "mature"]}'::jsonb,
  '["company_name", "employees_with_mortgages", "avg_loan_size", "current_insurance"]'::jsonb
),
(
  'Key Person Insurance for Leadership',
  'insurance',
  'Protect your business with key person insurance for critical executives',
  '{"triggers": ["risk_mitigation", "business_continuity"], "pain_points": ["succession_risk", "knowledge_loss"], "desires": ["business_protection", "continuity"]}'::jsonb,
  'problem_solution',
  'consultative',
  'risk_mitigation',
  'Discuss key person coverage',
  '{"industries": ["all"], "job_titles": ["CEO", "CFO", "Board Member"], "company_sizes": ["100+"], "lifecycle_stages": ["growth", "mature"]}'::jsonb,
  '["company_name", "key_person_count", "annual_revenue", "current_coverage"]'::jsonb
),
(
  'Cyber Insurance for Digital Businesses',
  'insurance',
  'Safeguard against cyber threats with comprehensive data breach insurance',
  '{"triggers": ["security", "modern_risk"], "pain_points": ["cyber_threats", "data_breach_costs"], "desires": ["protection", "compliance"]}'::jsonb,
  'problem_solution',
  'professional',
  'risk_mitigation',
  'Get cyber risk assessment',
  '{"industries": ["technology", "ecommerce", "finance"], "job_titles": ["CTO", "CFO", "Risk Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["digital_transformation"]}'::jsonb,
  '["company_name", "digital_revenue", "customer_data_volume", "security_incidents"]'::jsonb
),
(
  'Trade Credit Insurance for Exporters',
  'insurance',
  'Protect against non-payment risk in international trade transactions',
  '{"triggers": ["security", "growth_enabler"], "pain_points": ["payment_default_risk", "cash_flow_uncertainty"], "desires": ["risk_mitigation", "confident_growth"]}'::jsonb,
  'consultative',
  'professional',
  'risk_mitigation',
  'Review your trade exposure',
  '{"industries": ["trading", "manufacturing", "oil_gas"], "job_titles": ["CFO", "Trade Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["international_expansion"]}'::jsonb,
  '["company_name", "annual_export_value", "customer_countries", "bad_debt_history"]'::jsonb
);

-- CATEGORY: Digital Banking (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'AI-Powered Expense Management Platform',
  'digital_banking',
  'Automate expense reporting and approval with AI-powered receipt scanning',
  '{"triggers": ["automation", "efficiency"], "pain_points": ["manual_expense_reports", "delayed_approvals"], "desires": ["automation", "time_savings"]}'::jsonb,
  'value_first',
  'friendly',
  'time_savings',
  'Book live demo',
  '{"industries": ["consulting", "sales", "services"], "job_titles": ["Finance Manager", "Operations Manager"], "company_sizes": ["20-500"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "employee_count", "monthly_expense_reports", "current_system"]'::jsonb
),
(
  'API Banking Integration for Fintechs',
  'digital_banking',
  'Embed banking services into your platform with open API integration',
  '{"triggers": ["innovation", "integration"], "pain_points": ["fragmented_systems", "manual_processes"], "desires": ["seamless_integration", "automation"]}'::jsonb,
  'consultative',
  'professional',
  'technical_enablement',
  'Request API documentation',
  '{"industries": ["fintech", "technology", "ecommerce"], "job_titles": ["CTO", "Product Manager"], "company_sizes": ["10-200"], "lifecycle_stages": ["product_development"]}'::jsonb,
  '["company_name", "platform_users", "integration_needs", "technical_stack"]'::jsonb
),
(
  'Mobile Banking App for Employee Self-Service',
  'digital_banking',
  'Empower employees with mobile app for salary, loans, and account management',
  '{"triggers": ["convenience", "empowerment"], "pain_points": ["branch_dependency", "limited_access"], "desires": ["self_service", "24_7_access"]}'::jsonb,
  'value_first',
  'friendly',
  'convenience',
  'Try mobile app demo',
  '{"industries": ["all"], "job_titles": ["HR Director", "IT Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["digital_transformation"]}'::jsonb,
  '["company_name", "employee_count", "mobile_adoption", "current_digital_services"]'::jsonb
),
(
  'Instant Account Opening via Video KYC',
  'digital_banking',
  'Onboard new employees instantly with video KYC and digital account opening',
  '{"triggers": ["speed", "convenience"], "pain_points": ["slow_onboarding", "paperwork"], "desires": ["instant_access", "digital_first"]}'::jsonb,
  'problem_solution',
  'friendly',
  'speed_convenience',
  'See video KYC in action',
  '{"industries": ["all"], "job_titles": ["HR Manager", "Operations Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["growth", "scaling"]}'::jsonb,
  '["company_name", "new_hires_per_month", "onboarding_timeline", "current_kyc_process"]'::jsonb
),
(
  'Real-Time Payment Rails Integration',
  'digital_banking',
  'Enable instant payments to vendors and employees with real-time payment systems',
  '{"triggers": ["speed", "efficiency"], "pain_points": ["payment_delays", "vendor_complaints"], "desires": ["instant_payments", "vendor_satisfaction"]}'::jsonb,
  'data_driven',
  'professional',
  'efficiency_gains',
  'Calculate time savings',
  '{"industries": ["ecommerce", "logistics", "retail"], "job_titles": ["CFO", "Payments Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["digital_transformation"]}'::jsonb,
  '["company_name", "monthly_payment_volume", "avg_payment_delay", "vendor_count"]'::jsonb
);

-- CATEGORY: Premium Services (4 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Dedicated Relationship Manager for CFOs',
  'premium_services',
  'Access personalized banking with a dedicated RM for treasury and financial needs',
  '{"triggers": ["exclusivity", "personalization"], "pain_points": ["generic_service", "delayed_responses"], "desires": ["white_glove_service", "priority_access"]}'::jsonb,
  'aspirational',
  'consultative',
  'exclusive_access',
  'Request RM introduction',
  '{"industries": ["all"], "job_titles": ["CFO", "Finance Director"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "scaling"]}'::jsonb,
  '["company_name", "banking_relationship_value", "current_service_level", "pain_points"]'::jsonb
),
(
  'Concierge Services for Executive Banking',
  'premium_services',
  'Premium lifestyle concierge for executives - travel, dining, entertainment',
  '{"triggers": ["status", "exclusivity"], "pain_points": ["time_constraints", "access_to_experiences"], "desires": ["prestige", "convenience"]}'::jsonb,
  'aspirational',
  'aspirational',
  'lifestyle_enhancement',
  'Explore concierge services',
  '{"industries": ["finance", "oil_gas", "real_estate"], "job_titles": ["CEO", "MD", "Board Member"], "company_sizes": ["500+"], "lifecycle_stages": ["mature", "luxury_segment"]}'::jsonb,
  '["company_name", "exec_count", "travel_frequency", "lifestyle_interests"]'::jsonb
),
(
  'Priority Airport Lounge Access Program',
  'premium_services',
  'Enhance business travel with unlimited lounge access for traveling executives',
  '{"triggers": ["comfort", "status"], "pain_points": ["travel_stress", "airport_delays"], "desires": ["comfort", "productivity"]}'::jsonb,
  'value_first',
  'aspirational',
  'travel_comfort',
  'Get lounge membership details',
  '{"industries": ["consulting", "sales", "oil_gas"], "job_titles": ["Sales Director", "Consultant", "Executive"], "company_sizes": ["100+"], "lifecycle_stages": ["international_operations"]}'::jsonb,
  '["company_name", "frequent_travelers", "annual_travel_days", "current_lounge_access"]'::jsonb
),
(
  'Golf and Lifestyle Club Memberships',
  'premium_services',
  'Exclusive access to premium golf clubs and lifestyle venues for networking',
  '{"triggers": ["networking", "exclusivity"], "pain_points": ["limited_networking_venues", "high_membership_costs"], "desires": ["prestige", "business_networking"]}'::jsonb,
  'aspirational',
  'aspirational',
  'networking_opportunities',
  'Request club membership info',
  '{"industries": ["finance", "real_estate", "consulting"], "job_titles": ["CEO", "MD", "Partner"], "company_sizes": ["200+"], "lifecycle_stages": ["mature", "premium_segment"]}'::jsonb,
  '["company_name", "exec_count", "networking_needs", "current_memberships"]'::jsonb
);

-- CATEGORY: Business Banking (4 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Working Capital Loans for Growth',
  'business_banking',
  'Fund expansion and inventory with flexible working capital financing',
  '{"triggers": ["growth", "opportunity"], "pain_points": ["cash_flow_gaps", "missed_opportunities"], "desires": ["growth_capital", "flexibility"]}'::jsonb,
  'value_first',
  'consultative',
  'growth_enablement',
  'Discuss financing options',
  '{"industries": ["retail", "manufacturing", "trading"], "job_titles": ["CFO", "Business Owner"], "company_sizes": ["50-500"], "lifecycle_stages": ["growth", "expansion"]}'::jsonb,
  '["company_name", "annual_revenue", "growth_rate", "capital_needs"]'::jsonb
),
(
  'Invoice Financing for Immediate Cash',
  'business_banking',
  'Convert unpaid invoices to immediate cash with invoice discounting',
  '{"triggers": ["liquidity", "speed"], "pain_points": ["payment_delays", "cash_crunch"], "desires": ["immediate_cash", "cash_flow_stability"]}'::jsonb,
  'problem_solution',
  'professional',
  'immediate_liquidity',
  'Get invoice financing quote',
  '{"industries": ["services", "manufacturing", "trading"], "job_titles": ["CFO", "Finance Manager"], "company_sizes": ["20-500"], "lifecycle_stages": ["growth", "cash_flow_issues"]}'::jsonb,
  '["company_name", "outstanding_invoices", "avg_payment_terms", "cash_flow_gap"]'::jsonb
),
(
  'Equipment Financing for Upgrades',
  'business_banking',
  'Acquire machinery and equipment without upfront capital outlay',
  '{"triggers": ["modernization", "competitiveness"], "pain_points": ["outdated_equipment", "capital_constraints"], "desires": ["modernization", "preserved_capital"]}'::jsonb,
  'value_first',
  'professional',
  'asset_acquisition',
  'Calculate equipment financing',
  '{"industries": ["manufacturing", "construction", "healthcare"], "job_titles": ["CFO", "Operations Director"], "company_sizes": ["50+"], "lifecycle_stages": ["modernization", "expansion"]}'::jsonb,
  '["company_name", "equipment_needs", "budget", "current_financing"]'::jsonb
),
(
  'Overdraft Facilities for Cash Flow',
  'business_banking',
  'Ensure smooth operations with pre-approved overdraft credit lines',
  '{"triggers": ["security", "flexibility"], "pain_points": ["cash_flow_volatility", "emergency_needs"], "desires": ["financial_cushion", "peace_of_mind"]}'::jsonb,
  'problem_solution',
  'professional',
  'financial_security',
  'Request overdraft terms',
  '{"industries": ["all"], "job_titles": ["CFO", "Finance Manager"], "company_sizes": ["20+"], "lifecycle_stages": ["growth", "stable"]}'::jsonb,
  '["company_name", "monthly_revenue", "cash_flow_volatility", "current_credit_facilities"]'::jsonb
);

-- CATEGORY: Loyalty & Rewards (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Employee Rewards Points Program',
  'loyalty_rewards',
  'Boost engagement with banking-linked rewards points for employees',
  '{"triggers": ["recognition", "rewards"], "pain_points": ["low_engagement", "retention"], "desires": ["employee_motivation", "loyalty"]}'::jsonb,
  'value_first',
  'friendly',
  'engagement_boost',
  'Launch rewards program',
  '{"industries": ["retail", "hospitality", "services"], "job_titles": ["HR Director", "Engagement Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["growth", "stable"]}'::jsonb,
  '["company_name", "employee_count", "engagement_score", "current_rewards"]'::jsonb
),
(
  'Cashback on Payroll Processing',
  'loyalty_rewards',
  'Earn cashback on every salary processed through our payroll platform',
  '{"triggers": ["rewards", "value"], "pain_points": ["payroll_costs", "no_incentives"], "desires": ["cost_recovery", "rewards"]}'::jsonb,
  'value_first',
  'friendly',
  'cashback_rewards',
  'Calculate annual cashback',
  '{"industries": ["all"], "job_titles": ["CFO", "HR Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["stable", "growth"]}'::jsonb,
  '["company_name", "employee_count", "monthly_payroll_value", "current_processor"]'::jsonb
),
(
  'Travel Miles on Business Spending',
  'loyalty_rewards',
  'Convert business expenses into travel miles for company or personal use',
  '{"triggers": ["rewards", "travel"], "pain_points": ["unrewarded_spending", "high_travel_costs"], "desires": ["travel_rewards", "cost_savings"]}'::jsonb,
  'value_first',
  'aspirational',
  'travel_rewards',
  'See miles earning potential',
  '{"industries": ["consulting", "sales", "services"], "job_titles": ["Finance Manager", "Travel Manager"], "company_sizes": ["50+"], "lifecycle_stages": ["high_travel_activity"]}'::jsonb,
  '["company_name", "monthly_spend", "travel_frequency", "current_rewards"]'::jsonb
),
(
  'Partner Discounts Network Access',
  'loyalty_rewards',
  'Give employees access to exclusive discounts at 500+ UAE partner merchants',
  '{"triggers": ["value", "exclusive_access"], "pain_points": ["cost_of_living", "limited_benefits"], "desires": ["savings", "employee_satisfaction"]}'::jsonb,
  'value_first',
  'friendly',
  'exclusive_savings',
  'View partner network',
  '{"industries": ["all"], "job_titles": ["HR Director", "Benefits Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["stable", "growth"]}'::jsonb,
  '["company_name", "employee_count", "current_benefits", "cost_of_living_concerns"]'::jsonb
),
(
  'Redemption Flexibility - Cash or Gifts',
  'loyalty_rewards',
  'Redeem reward points as cash, gift cards, or merchandise - employee choice',
  '{"triggers": ["flexibility", "choice"], "pain_points": ["limited_redemption_options", "unused_points"], "desires": ["flexibility", "value_realization"]}'::jsonb,
  'value_first',
  'friendly',
  'flexible_rewards',
  'Explore redemption options',
  '{"industries": ["all"], "job_titles": ["HR Director", "Engagement Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "mature"]}'::jsonb,
  '["company_name", "employee_count", "current_rewards_program", "redemption_preferences"]'::jsonb
);

-- CATEGORY: Lifestyle & Benefits (5 campaigns)
INSERT INTO campaign_types (name, category, description, psychology, structure_type, tone, conversion_driver, ideal_cta, target_audience, personalization_vars) VALUES
(
  'Gym and Wellness Memberships',
  'lifestyle_benefits',
  'Partner with banks to offer subsidized gym and wellness memberships to staff',
  '{"triggers": ["health", "wellness"], "pain_points": ["employee_health", "healthcare_costs"], "desires": ["healthy_workforce", "reduced_absenteeism"]}'::jsonb,
  'value_first',
  'friendly',
  'employee_wellness',
  'Get wellness program quote',
  '{"industries": ["all"], "job_titles": ["HR Director", "Wellness Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["employee_wellness_focus"]}'::jsonb,
  '["company_name", "employee_count", "health_concerns", "current_wellness_offerings"]'::jsonb
),
(
  'Family Banking Packages',
  'lifestyle_benefits',
  'Extend banking benefits to employee families with special family accounts',
  '{"triggers": ["family_care", "comprehensive_benefit"], "pain_points": ["limited_family_benefits", "fragmented_banking"], "desires": ["family_welfare", "loyalty"]}'::jsonb,
  'story_driven',
  'friendly',
  'family_care',
  'Learn about family packages',
  '{"industries": ["all"], "job_titles": ["HR Director", "Benefits Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "mature"]}'::jsonb,
  '["company_name", "employee_count", "family_demographics", "current_family_benefits"]'::jsonb
),
(
  'School Fee Payment Plans',
  'lifestyle_benefits',
  'Help employees manage education costs with interest-free school fee installments',
  '{"triggers": ["financial_relief", "family_support"], "pain_points": ["school_fee_burden", "cash_flow_stress"], "desires": ["employee_relief", "retention"]}'::jsonb,
  'problem_solution',
  'compassionate',
  'financial_relief',
  'Discuss fee payment options',
  '{"industries": ["all"], "job_titles": ["HR Director", "Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["family_workforce"]}'::jsonb,
  '["company_name", "employees_with_kids", "avg_school_fees", "current_support"]'::jsonb
),
(
  'Holiday Package Financing',
  'lifestyle_benefits',
  'Enable employees to take dream vacations with low-interest holiday financing',
  '{"triggers": ["lifestyle_enhancement", "work_life_balance"], "pain_points": ["travel_costs", "limited_vacation"], "desires": ["employee_happiness", "work_life_balance"]}'::jsonb,
  'aspirational',
  'friendly',
  'lifestyle_enhancement',
  'Explore holiday financing',
  '{"industries": ["hospitality", "retail", "services"], "job_titles": ["HR Director", "Benefits Manager"], "company_sizes": ["100+"], "lifecycle_stages": ["employee_satisfaction_focus"]}'::jsonb,
  '["company_name", "employee_count", "leave_patterns", "travel_interest"]'::jsonb
),
(
  'Car Purchase Assistance Program',
  'lifestyle_benefits',
  'Support employees with preferential auto loans through corporate partnerships',
  '{"triggers": ["aspiration", "convenience"], "pain_points": ["transportation_costs", "limited_mobility"], "desires": ["employee_convenience", "satisfaction"]}'::jsonb,
  'value_first',
  'friendly',
  'lifestyle_upgrade',
  'Get auto loan rates',
  '{"industries": ["all"], "job_titles": ["HR Director", "Finance Manager"], "company_sizes": ["200+"], "lifecycle_stages": ["stable", "growth"]}'::jsonb,
  '["company_name", "employee_count", "transportation_needs", "current_auto_loan_partner"]'::jsonb
);

-- =====================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS campaign_types_category_idx ON campaign_types(category);
CREATE INDEX IF NOT EXISTS campaign_types_status_idx ON campaign_types(status);
CREATE INDEX IF NOT EXISTS campaign_types_name_idx ON campaign_types(name);

-- =====================================================
-- 7. ADD UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_types_updated_at
BEFORE UPDATE ON campaign_types
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Total campaigns seeded: 56
-- Categories: 12
-- Ready for intelligent campaign matching and AI-driven personalization
