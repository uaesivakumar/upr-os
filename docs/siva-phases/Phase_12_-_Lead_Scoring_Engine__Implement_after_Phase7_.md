**🎯 Lead Score: The REAL Logic**

**Core Principle**

Lead Score = f(company_size, title_seniority, data_availability,
department_fit)

NOT related to company quality at all!

The \"best\" lead depends on:

1\. Company size (what works at 50-person company fails at 5,000-person
company)

2\. Title appropriateness for that size

3\. How many other contacts we found (scarcity premium)

4\. Department fit (HR \> Finance/Talent Management, unless no HR found)

**📊 Complete Lead Score Formula**

function calculateLeadScore(person, company, allContactsForCompany) {

// Step 1: Base score from title-size fit

const titleSizeScore = calculateTitleSizeScore(person.title,
company.uae_employees);

// Step 2: Data scarcity adjustment

const scarcityBonus = calculateScarcityBonus(person,
allContactsForCompany);

// Step 3: Department fit penalty

const departmentPenalty = calculateDepartmentPenalty(person,
allContactsForCompany);

// Step 4: Calculate final score

let leadScore = titleSizeScore \* scarcityBonus \* departmentPenalty;

// Step 5: Cap at 100

leadScore = Math.min(leadScore, 100);

// Step 6: Round

leadScore = Math.round(leadScore);

return {

lead_score: leadScore,

breakdown: {

title_size_score: Math.round(titleSizeScore),

scarcity_bonus: scarcityBonus.toFixed(2),

department_penalty: departmentPenalty.toFixed(2),

display: leadScore \>= 75 ? \'SHOW\' : \'HIDE\'

},

reasoning: generateLeadScoreReasoning(person, company,
allContactsForCompany, leadScore)

};

}

**1. Title-Size Score (Core Component)**

**The Inverted Seniority Matrix**

function calculateTitleSizeScore(title, uaeEmployees) {

const titleNorm = title.toLowerCase();

// Extract title level

const level = extractTitleLevel(titleNorm);

const function_type = extractFunction(titleNorm);

// Route to appropriate scoring table

if (uaeEmployees \>= 5000) {

return scoreLargeCompany(level, function_type);

} else if (uaeEmployees \>= 500) {

return scoreMediumLargeCompany(level, function_type);

} else {

return scoreSmallMediumCompany(level, function_type);

}

}

**Large Companies (5,000+ UAE employees)**

**Philosophy:** Specialists/coordinators are accessible, directors are
unreachable

function scoreLargeCompany(level, function_type) {

// HR Function

if (function_type === \'HR\' \|\| function_type === \'People
Operations\') {

if (level === \'specialist\') {

// HR Coordinator, HR Generalist, Onboarding Specialist, Payroll
Specialist

return 95; // ✅ BEST - hands-on, accessible, decision influence

}

if (level === \'manager\') {

// HR Manager, People Manager, Talent Acquisition Manager

return 75; // ⚠️ GOOD - can engage but might delegate

}

if (level === \'director\' \|\| level === \'head\') {

// HR Director, Head of HR, Head of People

return 35; // ❌ POOR - too senior, won\'t engage on tactical banking

}

if (level === \'vp\' \|\| level === \'c-level\') {

// VP HR, CHRO

return 20; // ❌ WORST - impossible to reach

}

}

// Finance Function (only if HR roles exist)

if (function_type === \'Finance\') {

if (level === \'specialist\' \|\| level === \'manager\') {

return 50; // ⚠️ Acceptable alternative if they handle payroll

}

if (level === \'director\' \|\| level === \'c-level\') {

return 25; // ❌ POOR - wrong dept + too senior

}

}

// Talent Management / Talent Acquisition (wrong focus)

if (function_type === \'Talent\') {

return 40; // ❌ POOR - focused on hiring, not banking

}

// Admin / Operations

if (function_type === \'Admin\' \|\| function_type === \'Operations\') {

if (level === \'manager\' \|\| level === \'specialist\') {

return 70; // ⚠️ GOOD - might handle employee services

}

if (level === \'director\') {

return 40; // ❌ POOR - too senior

}

}

return 30; // Default: other departments/roles

}

**Example Scores (Large Company):**

Amazon UAE (8,000 employees):

├─ HR Director → 35 (too senior)

├─ HR Manager → 75 (good)

├─ HR Coordinator → 95 ✅ BEST

├─ Payroll Specialist → 95 ✅ BEST

├─ Onboarding Specialist → 95 ✅ BEST

├─ Finance Manager → 50 (wrong dept)

└─ Talent Acquisition Lead → 40 (wrong focus)

**Medium-Large Companies (500-4,999 UAE employees)**

**Philosophy:** Managers/Directors are accessible, specialists good but
less priority

function scoreMediumLargeCompany(level, function_type) {

// HR Function

if (function_type === \'HR\' \|\| function_type === \'People
Operations\') {

if (level === \'director\' \|\| level === \'head\') {

// HR Director, Head of HR

return 90; // ✅ BEST - decision maker + accessible

}

if (level === \'manager\') {

// HR Manager, People Manager

return 85; // ✅ EXCELLENT - hands-on + authority

}

if (level === \'specialist\') {

// HR Coordinator, Payroll Specialist

return 75; // ⚠️ GOOD - accessible but less authority

}

if (level === \'vp\' \|\| level === \'c-level\') {

// VP HR, CHRO

return 50; // ⚠️ Might work but prefer director level

}

}

// Finance Function

if (function_type === \'Finance\') {

if (level === \'director\') {

return 70; // ⚠️ GOOD if they handle payroll

}

if (level === \'manager\') {

return 65; // ⚠️ Acceptable

}

}

// Admin / Operations

if (function_type === \'Admin\' \|\| function_type === \'Operations\') {

if (level === \'director\' \|\| level === \'manager\') {

return 80; // ✅ EXCELLENT - often handles employee services

}

}

// Talent Management

if (function_type === \'Talent\') {

return 50; // ⚠️ Not ideal but workable

}

return 40; // Default

}

**Example Scores (Medium-Large Company):**

Careem UAE (1,200 employees):

├─ HR Director → 90 ✅ BEST

├─ HR Manager → 85 ✅ EXCELLENT

├─ Payroll Specialist → 75 (good but less priority)

├─ Finance Director → 70 (acceptable)

└─ Talent Manager → 50 (not ideal)

**Small-Medium Companies (\<500 UAE employees)**

**Philosophy:** Directors/founders are decision makers, specialists
might lack authority

function scoreSmallMediumCompany(level, function_type) {

// For small companies, focus on decision makers

// Founders / C-level (small company exception!)

if (level === \'founder\' \|\| level === \'owner\' \|\| level ===
\'c-level\') {

return 95; // ✅ BEST - decision maker

}

// Directors (ideal sweet spot)

if (level === \'director\' \|\| level === \'head\') {

if (function_type === \'HR\' \|\| function_type === \'Admin\' \|\|
function_type === \'Operations\') {

return 90; // ✅ EXCELLENT - authority + accessible

}

if (function_type === \'Finance\') {

return 80; // ✅ GOOD - can work

}

}

// Managers

if (level === \'manager\') {

if (function_type === \'HR\' \|\| function_type === \'Admin\') {

return 85; // ✅ EXCELLENT

}

if (function_type === \'Finance\' \|\| function_type === \'Operations\')
{

return 75; // ⚠️ GOOD

}

}

// Specialists (less priority in small companies)

if (level === \'specialist\') {

return 65; // ⚠️ OK - might lack authority to decide

}

return 50; // Default

}

**Example Scores (Small-Medium Company):**

TechStartup UAE (80 employees):

├─ Founder/CEO → 95 ✅ BEST

├─ HR Director → 90 ✅ EXCELLENT

├─ Office Manager → 85 ✅ EXCELLENT (often handles HR in small cos)

├─ Admin Manager → 85 ✅ EXCELLENT

├─ HR Coordinator → 65 (less authority)

└─ Finance Manager → 75 (good)

**2. Data Scarcity Bonus (Critical!)**

**Philosophy:** If we only found 1-2 contacts, boost their scores. If we
found 20+, we can be picky.

function calculateScarcityBonus(person, allContacts) {

const totalContacts = allContacts.length;

const hrContacts = allContacts.filter(c =\>

extractFunction(c.title.toLowerCase()) === \'HR\'

).length;

// Critical case: Very few contacts found (0-2 total)

if (totalContacts \<= 2) {

// This is likely a limited UAE presence (Crowdstrike, Palantir
scenario)

// BOOST the score significantly for whatever we found

return 1.5; // 50% boost

}

// Limited contacts (3-5 total)

if (totalContacts \<= 5) {

// Still scarce, give decent boost

return 1.3; // 30% boost

}

// Moderate contacts (6-10)

if (totalContacts \<= 10) {

// Some options but not many

return 1.1; // 10% boost

}

// Many contacts (11-20)

if (totalContacts \<= 20) {

// Good options available, neutral

return 1.0; // No adjustment

}

// Too many contacts (20+)

if (totalContacts \> 20) {

// We can be very picky, slightly reduce scores to filter

return 0.95; // 5% reduction

}

return 1.0; // Default

}

**Example:**

// Crowdstrike UAE - Only found 1 contact

allContacts = \[

{ name: \"John Smith\", title: \"Regional Director\", function:
\"Sales\" }

\];

scarcityBonus = calculateScarcityBonus(person, allContacts); // 1.5x

// His base score might be 60 (director, wrong dept, small company)

// With scarcity bonus: 60 × 1.5 = 90 ✅ SHOW (only option, boost it!)

// Amazon UAE - Found 25 HR contacts

allContacts = \[ /\* 25 HR people \*/ \];

scarcityBonus = calculateScarcityBonus(person, allContacts); // 0.95x

// HR Director base score: 35

// With scarcity penalty: 35 × 0.95 = 33 ❌ HIDE (we have better options)

// HR Coordinator base score: 95

// With scarcity penalty: 95 × 0.95 = 90 ✅ SHOW (still best option)

**3. Department Fit Penalty**

**Philosophy:** If 3+ HR roles found, penalize Finance/Talent
Management. If \<3 HR found, don\'t penalize.

function calculateDepartmentPenalty(person, allContacts) {

const hrContacts = allContacts.filter(c =\> {

const func = extractFunction(c.title.toLowerCase());

return func === \'HR\' \|\| func === \'People Operations\';

}).length;

const personFunction = extractFunction(person.title.toLowerCase());

// If this person IS HR → no penalty

if (personFunction === \'HR\' \|\| personFunction === \'People
Operations\') {

return 1.0; // No penalty

}

// If person is Finance/Talent and we found 3+ HR contacts → penalize

if (hrContacts \>= 3) {

if (personFunction === \'Finance\') {

return 0.7; // 30% penalty (HR is better dept)

}

if (personFunction === \'Talent\') {

return 0.6; // 40% penalty (wrong focus)

}

}

// If \<3 HR contacts found → NO penalty (we need all options)

if (hrContacts \< 3) {

return 1.0; // No penalty - take what we can get

}

// Other departments (Admin/Operations) → smaller penalty

if (personFunction === \'Admin\' \|\| personFunction === \'Operations\')
{

if (hrContacts \>= 3) {

return 0.85; // 15% penalty (HR preferred but these are OK)

}

}

return 1.0; // Default: no penalty

}

**Example:**

// Amazon UAE - Found 8 HR contacts

allContacts = \[

{ title: \"HR Director\" },

{ title: \"HR Manager\" },

{ title: \"HR Coordinator\" },

{ title: \"Payroll Specialist\" },

{ title: \"Onboarding Specialist\" },

{ title: \"HR Generalist\" },

{ title: \"HR Business Partner\" },

{ title: \"Talent Acquisition Manager\" }, // This is \"Talent\"
function

{ title: \"Finance Manager\" }

\];

// Scoring Finance Manager:

basScore = 50 (Finance function in large company)

scarcityBonus = 1.0 (10 total contacts)

departmentPenalty = 0.7 (8 HR found, Finance penalized)

leadScore = 50 × 1.0 × 0.7 = 35 ❌ HIDE

// Scoring HR Coordinator:

baseScore = 95 (specialist in large company)

scarcityBonus = 1.0

departmentPenalty = 1.0 (is HR, no penalty)

leadScore = 95 × 1.0 × 1.0 = 95 ✅ SHOW

// Crowdstrike UAE - Found only 1 Finance contact, 0 HR

allContacts = \[

{ title: \"Finance Manager\" }

\];

// Scoring Finance Manager:

baseScore = 50 (Finance in medium company)

scarcityBonus = 1.5 (only 1 contact!)

departmentPenalty = 1.0 (no HR found, no penalty)

leadScore = 50 × 1.5 × 1.0 = 75 ✅ SHOW (only option!)

**4. Helper Functions**

function extractTitleLevel(titleNorm) {

// C-level

if (titleNorm.match(/\\b(ceo\|cfo\|coo\|chro\|chief)\\b/)) {

return \'c-level\';

}

// VP

if (titleNorm.match(/\\b(vp\|vice president)\\b/)) {

return \'vp\';

}

// Founder/Owner

if (titleNorm.match(/\\b(founder\|owner\|co-founder)\\b/)) {

return \'founder\';

}

// Director/Head

if (titleNorm.match(/\\b(director\|head of)\\b/)) {

return \'director\';

}

// Manager

if (titleNorm.match(/\\b(manager\|lead)\\b/)) {

return \'manager\';

}

// Specialist/Coordinator/Generalist/Officer

if
(titleNorm.match(/\\b(specialist\|coordinator\|generalist\|officer\|associate\|assistant)\\b/))
{

return \'specialist\';

}

return \'unknown\';

}

function extractFunction(titleNorm) {

// HR / People Operations

if (titleNorm.match(/\\b(hr\|human resources\|people operations\|people
& culture)\\b/)) {

// But NOT if it\'s Talent Acquisition focus

if (titleNorm.match(/\\b(talent
acquisition\|recruitment\|recruiter)\\b/)) {

return \'Talent\';

}

return \'HR\';

}

// Payroll (specific HR function, treat as HR)

if
(titleNorm.match(/\\b(payroll\|compensation\|benefits\|onboarding)\\b/))
{

return \'HR\'; // Specialists in these areas are great

}

// Finance

if (titleNorm.match(/\\b(finance\|financial\|accounting\|treasury)\\b/))
{

return \'Finance\';

}

// Admin / Operations

if (titleNorm.match(/\\b(admin\|administration\|operations\|office
manager)\\b/)) {

return \'Admin\';

}

// Talent Management (separate from HR)

if (titleNorm.match(/\\b(talent\|recruitment\|recruiter\|talent
acquisition)\\b/)) {

return \'Talent\';

}

return \'Other\';

}

**5. Complete Example Scenarios**

**Scenario 1: Amazon UAE (8,000 employees, 15 HR contacts found)**

const company = {

name: \"Amazon UAE\",

uae_employees: 8000

};

const allContacts = \[

{ title: \"VP HR, MENA\" },

{ title: \"HR Director\" },

{ title: \"HR Manager\" },

{ title: \"HR Manager - Operations\" },

{ title: \"Senior HR Manager\" },

{ title: \"HR Business Partner\" },

{ title: \"HR Coordinator\" },

{ title: \"HR Generalist\" },

{ title: \"Payroll Specialist\" },

{ title: \"Onboarding Specialist\" },

{ title: \"Compensation & Benefits Analyst\" },

{ title: \"HR Assistant\" },

{ title: \"Talent Acquisition Manager\" },

{ title: \"Finance Manager\" },

{ title: \"Operations Director\" }

\];

// Lead Scores:

calculateLeadScore({ title: \"VP HR, MENA\" }, company, allContacts);

// → baseScore: 20, scarcity: 1.0, deptPenalty: 1.0 = 20 ❌ HIDE

calculateLeadScore({ title: \"HR Director\" }, company, allContacts);

// → baseScore: 35, scarcity: 1.0, deptPenalty: 1.0 = 35 ❌ HIDE

calculateLeadScore({ title: \"HR Manager\" }, company, allContacts);

// → baseScore: 75, scarcity: 1.0, deptPenalty: 1.0 = 75 ✅ SHOW
(threshold)

calculateLeadScore({ title: \"HR Coordinator\" }, company, allContacts);

// → baseScore: 95, scarcity: 1.0, deptPenalty: 1.0 = 95 ✅ SHOW (BEST)

calculateLeadScore({ title: \"Payroll Specialist\" }, company,
allContacts);

// → baseScore: 95, scarcity: 1.0, deptPenalty: 1.0 = 95 ✅ SHOW (BEST)

calculateLeadScore({ title: \"Finance Manager\" }, company,
allContacts);

// → baseScore: 50, scarcity: 1.0, deptPenalty: 0.7 = 35 ❌ HIDE

calculateLeadScore({ title: \"Talent Acquisition Manager\" }, company,
allContacts);

// → baseScore: 40, scarcity: 1.0, deptPenalty: 0.6 = 24 ❌ HIDE

**Result:** Show 7 leads (HR Managers + Specialists), hide 8 leads (too
senior or wrong dept)

**Scenario 2: Crowdstrike UAE (50 employees, 1 contact found)**

const company = {

name: \"Crowdstrike UAE\",

uae_employees: 50

};

const allContacts = \[

{ title: \"Regional Director, Middle East\" }

\];

calculateLeadScore({ title: \"Regional Director, Middle East\" },
company, allContacts);

// → baseScore: 60 (director in small company, unknown dept)

// → scarcity: 1.5 (only 1 contact!)

// → deptPenalty: 1.0 (no HR found, no penalty)

// → leadScore: 60 × 1.5 × 1.0 = 90 ✅ SHOW (only option, boosted!)

**Result:** Show the only contact we found, even if not perfect

**Scenario 3: Careem (1,200 employees, 5 HR contacts found)**

const company = {

name: \"Careem\",

uae_employees: 1200

};

const allContacts = \[

{ title: \"HR Director\" },

{ title: \"HR Manager\" },

{ title: \"HR Manager - UAE\" },

{ title: \"Payroll Specialist\" },

{ title: \"Finance Manager\" }

\];

calculateLeadScore({ title: \"HR Director\" }, company, allContacts);

// → baseScore: 90, scarcity: 1.3 (only 5 contacts), deptPenalty: 1.0 =
117 → cap at 100 ✅ SHOW

calculateLeadScore({ title: \"HR Manager\" }, company, allContacts);

// → baseScore: 85, scarcity: 1.3, deptPenalty: 1.0 = 110 → cap at 100 ✅
SHOW

calculateLeadScore({ title: \"Payroll Specialist\" }, company,
allContacts);

// → baseScore: 75, scarcity: 1.3, deptPenalty: 1.0 = 97 ✅ SHOW

calculateLeadScore({ title: \"Finance Manager\" }, company,
allContacts);

// → baseScore: 65, scarcity: 1.3, deptPenalty: 0.7 (5 HR found) = 59 ❌
HIDE

**Result:** Show 3 HR leads, hide Finance (we have HR options)

**6. Display Logic**

function shouldDisplayLead(leadScore) {

return leadScore \>= 75;

}

function sortLeadsByScore(leads) {

return leads

.map(lead =\> ({

\...lead,

lead_score: calculateLeadScore(lead.person, lead.company,
lead.allContacts).lead_score

}))

.filter(lead =\> lead.lead_score \>= 75) // Only show ≥75

.sort((a, b) =\> b.lead_score - a.lead_score); // Highest first

}

**Dashboard Display:**

// GET /api/leads

const leads = await sortLeadsByScore(allLeads);

return {

total_found: allLeads.length,

displayed: leads.length,

hidden: allLeads.length - leads.length,

leads: leads // Sorted by lead_score desc

};

**7. Update to Phase 7 (Scoring)**

You now have **TWO scores**:

// Phase 7: Company Quality Score (Q-Score)

const companyScore = calculateQScore(company); // 0-100

// Used for: \"Is this company worth pursuing?\"

// Phase 12 (NEW): Lead Score

const leadScore = calculateLeadScore(person, company, allContacts); //
0-100

// Used for: \"Should we show this lead? In what order?\"

**Both are needed:**

\-- Table structure

CREATE TABLE leads (

id UUID PRIMARY KEY,

company_id UUID REFERENCES entities_company(id),

person_id UUID REFERENCES entities_person(id),

\-- Two separate scores

company_q\_score INTEGER, \-- From Phase 7 (company quality)

lead_score INTEGER, \-- From Phase 12 (lead quality)

\-- Display logic

display_to_user BOOLEAN GENERATED ALWAYS AS (lead_score \>= 75) STORED,

created_at TIMESTAMPTZ DEFAULT NOW()

);

CREATE INDEX idx_leads_score ON leads(lead_score DESC) WHERE lead_score
\>= 75;

**🎯 Add to Roadmap: Phase 12 - Lead Scoring**

**Insert after Phase 7 (Quantitative Intelligence Layer)**

**Week 12.5: Phase 12 - Lead Scoring Engine**

**Goal:** Score individual leads (person + company combination) for
display priority

**Deliverables:**

-   ✅ Lead scoring formula (title-size-scarcity-department)

-   ✅ Title level extraction (specialist/manager/director/vp/c-level)

-   ✅ Function extraction (HR/Finance/Talent/Admin)

-   ✅ Scarcity bonus calculator

-   ✅ Department fit penalty

-   ✅ Display threshold (≥75)

**Success Criteria:**

-   Large companies: Specialists score higher than Directors ✅

-   Small companies: Directors score higher than Specialists ✅

-   Scarce data: Only available leads get boosted ✅

-   3+ HR found: Finance/Talent penalized ✅

**Testing:**

npm run test:lead-scoring \-- \--scenarios=amazon,crowdstrike,careem
