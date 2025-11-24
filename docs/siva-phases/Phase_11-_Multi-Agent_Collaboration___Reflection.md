**Phase 11: Multi-Agent Collaboration & Reflection**

**Goal Check ✅**

*\"Implement multi-agent reasoning (DiscoveryAgent, ValidationAgent,
ScoringAgent, OutreachAgent, CriticAgent). Ensure reflection dialogue
stays within deterministic bounds and preserves Siva\'s logic.\"*

**This is the orchestration layer** - This is where specialized agents
work together with **checks and balances**, ensuring quality through
reflection while maintaining deterministic behavior.

**What This Phase Really Delivers**

**The Multi-Agent System**

┌─────────────────────────────────────────────────────────────┐

│ SIVA-AGENTIC-CORE ORCHESTRATOR │

├─────────────────────────────────────────────────────────────┤

│ │

│ ┌──────────────┐ │

│ │ COORDINATOR │ (Orchestrates the workflow) │

│ └──────┬───────┘ │

│ │ │

│ ├──────► DiscoveryAgent │

│ │ (Find UAE companies) │

│ │ │ │

│ │ ▼ │

│ ├──────► ValidationAgent │

│ │ (Cross-check facts) │

│ │ │ │

│ │ ▼ │

│ ├──────► ScoringAgent │

│ │ (Calculate Q-Score) │

│ │ │ │

│ │ ▼ │

│ ├──────► OutreachAgent │

│ │ (Generate message) │

│ │ │ │

│ │ ▼ │

│ └──────► CriticAgent │

│ (Review & reflect) │

│ │ │

│ ┌──────────────┴──────────────┐ │

│ │ │ │

│ ▼ ▼ │

│ \[APPROVE\] \[REVISE\] │

│ Continue Loop back │

│ (max 2 iterations) │

│ │

└─────────────────────────────────────────────────────────────┘

**1. Agent Definitions**

**DiscoveryAgent**

interface DiscoveryAgent {

name: \"DiscoveryAgent\",

role: \"Find and identify potential UAE companies\",

capabilities: \[

\"Search UAE news sources\",

\"Monitor job boards\",

\"Extract company signals\",

\"Deduplicate findings\"

\],

inputs: {

search_queries: string\[\],

date_range: { start: Date, end: Date },

sources: string\[\]

},

outputs: {

companies: Company\[\],

signals: Signal\[\],

confidence: number,

sources_used: string\[\]

},

constraints: {

max_companies_per_run: 50,

min_confidence_threshold: 0.6,

timeout_seconds: 300

},

tools: \[

\"SerpAPI\",

\"WebCrawler\",

\"EntityExtractor\"

\]

}

**Implementation:**

// server/agents/discoveryAgent.js

class DiscoveryAgent {

constructor() {

this.name = \"DiscoveryAgent\";

this.maxCompaniesPerRun = 50;

this.minConfidence = 0.6;

}

async discover(queries, sources, options = {}) {

const results = {

companies: \[\],

signals: \[\],

metadata: {

queries_executed: 0,

sources_searched: 0,

companies_found: 0,

duplicates_removed: 0,

confidence: 0

}

};

// Step 1: Execute searches

for (const query of queries) {

for (const source of sources) {

const searchResults = await this.searchSource(source, query);

results.companies.push(\...searchResults.companies);

results.signals.push(\...searchResults.signals);

results.metadata.queries_executed++;

}

results.metadata.sources_searched = sources.length;

}

// Step 2: Deduplicate by domain

const uniqueCompanies = this.deduplicateByDomain(results.companies);

results.metadata.duplicates_removed = results.companies.length -
uniqueCompanies.length;

results.companies = uniqueCompanies;

// Step 3: Filter by confidence

results.companies = results.companies.filter(c =\> c.confidence \>=
this.minConfidence);

// Step 4: Limit results

results.companies = results.companies.slice(0, this.maxCompaniesPerRun);

results.metadata.companies_found = results.companies.length;

// Step 5: Calculate overall confidence

results.metadata.confidence =
this.calculateAverageConfidence(results.companies);

return results;

}

async searchSource(source, query) {

// Implementation from Phase 1 (RADAR module)

const tool = this.getToolForSource(source);

const results = await tool.search(query);

return {

companies: results.companies,

signals: results.signals

};

}

deduplicateByDomain(companies) {

const seen = new Set();

return companies.filter(company =\> {

const domain = this.normalizeDomain(company.domain);

if (seen.has(domain)) return false;

seen.add(domain);

return true;

});

}

calculateAverageConfidence(companies) {

if (companies.length === 0) return 0;

const sum = companies.reduce((acc, c) =\> acc + c.confidence, 0);

return sum / companies.length;

}

}

**ValidationAgent**

interface ValidationAgent {

name: \"ValidationAgent\",

role: \"Cross-check facts and verify data quality\",

capabilities: \[

\"Cross-reference multiple sources\",

\"Detect conflicts in data\",

\"Compute field-level confidence\",

\"Flag suspicious entries\"

\],

inputs: {

company: Company,

facts: Fact\[\]

},

outputs: {

validated_company: Company,

fact_confidence: FactConfidence\[\],

conflicts: Conflict\[\],

validation_score: number

},

constraints: {

min_sources_for_high_confidence: 2,

max_conflicts_allowed: 3,

timeout_seconds: 60

},

tools: \[

\"FactCrossReferencer\",

\"ConflictDetector\",

\"ConfidenceCalculator\"

\]

}

**Implementation:**

// server/agents/validationAgent.js

class ValidationAgent {

constructor() {

this.name = \"ValidationAgent\";

this.minSourcesForHighConfidence = 2;

}

async validate(company, facts) {

const results = {

validated_company: { \...company },

fact_confidence: \[\],

conflicts: \[\],

validation_score: 0

};

// Step 1: Group facts by field

const factsByField = this.groupFactsByField(facts);

// Step 2: Validate each field

for (const \[field, fieldFacts\] of Object.entries(factsByField)) {

const validation = this.validateField(field, fieldFacts);

results.fact_confidence.push(validation);

if (validation.conflicts.length \> 0) {

results.conflicts.push(\...validation.conflicts);

}

// Update company with validated value

results.validated_company\[field\] = validation.consensus_value;

}

// Step 3: Calculate overall validation score

results.validation_score =
this.calculateValidationScore(results.fact_confidence);

// Step 4: Flag if too many conflicts

if (results.conflicts.length \> 3) {

results.validated_company.validation_status = \'NEEDS_REVIEW\';

results.validated_company.review_reason = \`\${results.conflicts.length}
conflicts detected\`;

} else {

results.validated_company.validation_status = \'VALIDATED\';

}

return results;

}

validateField(field, facts) {

// Implementation from Phase 2 (Validation logic)

const uniqueValues = \[\...new Set(facts.map(f =\> f.value))\];

if (uniqueValues.length === 1) {

// No conflict, all sources agree

return {

field,

consensus_value: uniqueValues\[0\],

confidence: facts.length \>= this.minSourcesForHighConfidence ? 0.95 :
0.75,

sources: facts.map(f =\> f.source),

conflicts: \[\]

};

}

// Conflict detected

const consensus = this.resolveMajorityVote(facts);

return {

field,

consensus_value: consensus.value,

confidence: consensus.confidence,

sources: consensus.sources,

conflicts: uniqueValues.map(value =\> ({

field,

conflicting_value: value,

sources: facts.filter(f =\> f.value === value).map(f =\> f.source)

}))

};

}

resolveMajorityVote(facts) {

// Majority voting with source authority weighting

const valueCounts = {};

for (const fact of facts) {

const key = JSON.stringify(fact.value);

if (!valueCounts\[key\]) {

valueCounts\[key\] = {

value: fact.value,

count: 0,

authority: 0,

sources: \[\]

};

}

valueCounts\[key\].count++;

valueCounts\[key\].authority += this.getSourceAuthority(fact.source);

valueCounts\[key\].sources.push(fact.source);

}

// Pick value with highest authority

const winner = Object.values(valueCounts).sort((a, b) =\> b.authority -
a.authority)\[0\];

return {

value: winner.value,

confidence: Math.min(0.9, winner.authority / facts.length),

sources: winner.sources

};

}

getSourceAuthority(source) {

const authorities = {

\'company_website\': 1.0,

\'linkedin\': 0.9,

\'news\': 0.8,

\'job_boards\': 0.7

};

return authorities\[source\] \|\| 0.5;

}

calculateValidationScore(factConfidences) {

if (factConfidences.length === 0) return 0;

const avgConfidence = factConfidences.reduce((sum, fc) =\> sum +
fc.confidence, 0) / factConfidences.length;

return Math.round(avgConfidence \* 100);

}

}

**ScoringAgent**

interface ScoringAgent {

name: \"ScoringAgent\",

role: \"Calculate Q-Score using quantitative formula\",

capabilities: \[

\"Calculate base quality\",

\"Apply signal strength multipliers\",

\"Compute reachability\",

\"Apply edge cases\",

\"Generate explanation\"

\],

inputs: {

company: Company,

signals: Signal\[\],

contact: Person \| null

},

outputs: {

q_score: number,

breakdown: ScoreBreakdown,

confidence: number,

decision: \'PROCEED\' \| \'SKIP\',

explanation: Explanation

},

constraints: {

min_score_threshold: 70,

max_score: 100,

timeout_seconds: 30

},

tools: \[

\"QuantitativeFormulaEngine\",

\"EdgeCaseRuleEngine\",

\"ExplanationGenerator\"

\]

}

**Implementation:**

// server/agents/scoringAgent.js

class ScoringAgent {

constructor() {

this.name = \"ScoringAgent\";

this.threshold = 70;

this.formulaEngine = new QuantitativeFormulaEngine(); // From Phase 7

}

async score(company, signals, contact) {

// Step 1: Calculate base quality (from Phase 7)

const baseQuality = this.formulaEngine.calculateBaseQuality(company);

// Step 2: Calculate signal strength (from Phase 7)

const signalStrength =
this.formulaEngine.calculateSignalStrength(company, signals);

// Step 3: Calculate reachability (from Phase 7)

const reachability = this.formulaEngine.calculateReachability(company,
contact);

// Step 4: Calculate raw score

let rawScore = baseQuality \* signalStrength \* reachability;

// Step 5: Apply edge cases (from Phase 7)

const edgeCaseResult = this.formulaEngine.applyEdgeCases(company,
rawScore);

// Step 6: Cap and round

const finalScore = Math.min(Math.round(edgeCaseResult.score), 100);

// Step 7: Generate explanation (from Phase 9)

const explanation = this.generateExplanation({

baseQuality,

signalStrength,

reachability,

rawScore,

edgeCases: edgeCaseResult.edge_cases,

finalScore

});

// Step 8: Calculate confidence (from Phase 7)

const confidence = this.formulaEngine.calculateConfidence(company, {

baseQuality,

signalStrength,

reachability,

edgeCases: edgeCaseResult.edge_cases

});

return {

q_score: finalScore,

breakdown: {

base_quality: baseQuality,

signal_strength: signalStrength,

reachability: reachability,

raw_score: rawScore,

edge_cases: edgeCaseResult.edge_cases

},

confidence: confidence,

decision: finalScore \>= this.threshold ? \'PROCEED\' : \'SKIP\',

explanation: explanation

};

}

generateExplanation(components) {

// Implementation from Phase 9

return {

summary: \`Score \${components.finalScore}:
\${this.getSummaryText(components)}\`,

breakdown: \[

{

component: \'base_quality\',

value: components.baseQuality,

explanation: \'Company fundamentals\'

},

{

component: \'signal_strength\',

value: components.signalStrength,

explanation: \'Hiring velocity + timing + news\'

},

{

component: \'reachability\',

value: components.reachability,

explanation: \'Contact availability + email quality\'

}

\],

confidence: components.confidence

};

}

}

**OutreachAgent**

interface OutreachAgent {

name: \"OutreachAgent\",

role: \"Generate personalized outreach messages\",

capabilities: \[

\"Select appropriate template\",

\"Generate opening context\",

\"Personalize message\",

\"Check doctrine compliance\"

\],

inputs: {

company: Company,

person: Person,

signals: Signal\[\],

lifecycle_state: string

},

outputs: {

message: {

subject: string,

body: string,

cta: string

},

template_used: string,

doctrine_compliance: DoctrineCheck,

confidence: number

},

constraints: {

max_message_length: 500,

must_reference_signal: true,

timeout_seconds: 45

},

tools: \[

\"PromptManager\",

\"LLM (GPT-4)\",

\"DoctrineValidator\"

\]

}

**Implementation:**

// server/agents/outreachAgent.js

class OutreachAgent {

constructor() {

this.name = \"OutreachAgent\";

this.promptManager = new PromptManager(); // From Phase 6

this.llm = new OpenAIClient();

}

async generateOutreach(company, person, signals, lifecycleState) {

// Step 1: Select template based on lifecycle state

const template = this.selectTemplate(lifecycleState, signals);

// Step 2: Generate opening context (research summary)

const openingContext = await this.generateOpeningContext(company,
signals);

// Step 3: Build full prompt

const prompt = this.promptManager.renderPrompt(template.id, {

company_name: company.name,

contact_first_name: person.first_name,

opening_context: openingContext,

signal_headline: signals\[0\]?.headline \|\| \'\',

job_function: signals\[0\]?.job_function \|\| \'team\'

});

// Step 4: Call LLM

const llmOutput = await this.llm.generate(prompt, {

temperature: 0.3, // Low temperature for consistency

max_tokens: 500

});

// Step 5: Validate doctrine compliance

const doctrineCheck = this.validateDoctrine(llmOutput);

if (!doctrineCheck.passed) {

// Retry once with corrected prompt

const correctedPrompt = this.addDoctrineEnforcement(prompt,
doctrineCheck.violations);

const retryOutput = await this.llm.generate(correctedPrompt);

const retryCheck = this.validateDoctrine(retryOutput);

return {

message: this.parseMessage(retryOutput),

template_used: template.id,

doctrine_compliance: retryCheck,

confidence: retryCheck.passed ? 0.85 : 0.60,

retries: 1

};

}

return {

message: this.parseMessage(llmOutput),

template_used: template.id,

doctrine_compliance: doctrineCheck,

confidence: 0.95,

retries: 0

};

}

selectTemplate(lifecycleState, signals) {

// Implementation from Phase 6 + Phase 8

const templates = {

\'COLD\': {

id: \'initial_hiring_signal\',

objective: \'Get initial response\'

},

\'OUTREACH_SENT\': {

id: \'follow_up_day_7\',

objective: \'Re-engage\'

},

\'ENGAGED\': {

id: \'meeting_request\',

objective: \'Schedule call\'

}

};

return templates\[lifecycleState\] \|\| templates\[\'COLD\'\];

}

async generateOpeningContext(company, signals) {

// Use LLM to generate research-based opening (2-3 sentences)

const prompt =
this.promptManager.getPrompt(\'opening_context_generation\');

const context = await this.llm.generate(prompt, {

company_name: company.name,

recent_news: signals.map(s =\> s.headline).join(\', \'),

job_postings: signals.filter(s =\> s.type === \'hiring\').length

});

return context.trim();

}

validateDoctrine(output) {

// Implementation from Phase 6

const violations = \[\];

// Rule 1: Must reference specific signal

if (!output.match(/\\b(hiring\|expansion\|funding\|relocation)\\b/i)) {

violations.push({

rule: \'Must reference specific signal\',

severity: \'high\'

});

}

// Rule 2: No generic openings

if (output.includes(\'I hope this finds you well\')) {

violations.push({

rule: \'No generic openings\',

severity: \'high\'

});

}

// Rule 3: No pricing mentioned

if (output.match(/\\\$\|AED\|price\|cost\|fee\|rate/i)) {

violations.push({

rule: \'No pricing mentioned\',

severity: \'critical\'

});

}

return {

passed: violations.length === 0,

violations: violations,

score: violations.length === 0 ? 1.0 : 1.0 - (violations.length \* 0.2)

};

}

parseMessage(llmOutput) {

// Extract subject and body from LLM output

const lines = llmOutput.split(\'\\n\').filter(l =\> l.trim());

const subjectLine = lines.find(l =\> l.startsWith(\'Subject:\'));

const subject = subjectLine ? subjectLine.replace(\'Subject:\',
\'\').trim() : \'Follow-up\';

const bodyStart = lines.findIndex(l =\> !l.startsWith(\'Subject:\'));

const body = lines.slice(bodyStart).join(\'\\n\\n\');

return {

subject,

body,

cta: this.extractCTA(body)

};

}

extractCTA(body) {

// Find the call-to-action (usually last paragraph)

const ctaPatterns = \[

/worth a .\*?\\?/i,

/interested in .\*?\\?/i,

/would you .\*?\\?/i

\];

for (const pattern of ctaPatterns) {

const match = body.match(pattern);

if (match) return match\[0\];

}

return \'Let me know if you\'d like to discuss.\';

}

}

**CriticAgent (Reflection Layer)**

interface CriticAgent {

name: \"CriticAgent\",

role: \"Review outputs and provide feedback for improvement\",

capabilities: \[

\"Evaluate quality of outputs\",

\"Detect logical inconsistencies\",

\"Suggest improvements\",

\"Decide approve vs revise\"

\],

inputs: {

agent_output: any,

agent_name: string,

iteration: number

},

outputs: {

decision: \'APPROVE\' \| \'REVISE\' \| \'ESCALATE\',

quality_score: number,

issues: Issue\[\],

suggestions: Suggestion\[\],

revised_output?: any

},

constraints: {

max_iterations: 2, // Prevent infinite loops

min_quality_threshold: 0.75,

timeout_seconds: 30

},

tools: \[

\"QualityEvaluator\",

\"LogicChecker\",

\"SivaLogicValidator\"

\]

}

**Implementation:**

// server/agents/criticAgent.js

class CriticAgent {

constructor() {

this.name = \"CriticAgent\";

this.maxIterations = 2;

this.minQualityThreshold = 0.75;

}

async critique(agentOutput, agentName, iteration = 0) {

// Prevent infinite loops

if (iteration \>= this.maxIterations) {

return {

decision: \'APPROVE\',

quality_score: agentOutput.confidence \|\| 0.7,

issues: \[\],

suggestions: \[\],

note: \'Max iterations reached, approving to prevent loop\'

};

}

// Route to specific critique method

switch (agentName) {

case \'DiscoveryAgent\':

return this.critiqueDiscovery(agentOutput, iteration);

case \'ValidationAgent\':

return this.critiqueValidation(agentOutput, iteration);

case \'ScoringAgent\':

return this.critiqueScoring(agentOutput, iteration);

case \'OutreachAgent\':

return this.critiqueOutreach(agentOutput, iteration);

default:

return { decision: \'APPROVE\', quality_score: 1.0, issues: \[\],
suggestions: \[\] };

}

}

critiqueDiscovery(output, iteration) {

const issues = \[\];

const suggestions = \[\];

// Check 1: Sufficient companies found

if (output.companies.length \< 5) {

issues.push({

severity: \'medium\',

issue: \`Only \${output.companies.length} companies found (target:
10+)\`,

field: \'companies\'

});

suggestions.push({

suggestion: \'Broaden search queries or add more sources\'

});

}

// Check 2: Confidence too low

if (output.metadata.confidence \< 0.6) {

issues.push({

severity: \'high\',

issue: \`Average confidence \${output.metadata.confidence.toFixed(2)}
below threshold (0.6)\`,

field: \'confidence\'

});

suggestions.push({

suggestion: \'Filter out low-confidence results or improve extraction
logic\'

});

}

// Check 3: Too many duplicates

const dupeRate = output.metadata.duplicates_removed /
(output.metadata.companies_found + output.metadata.duplicates_removed);

if (dupeRate \> 0.3) {

issues.push({

severity: \'low\',

issue: \`High duplicate rate (\${(dupeRate \* 100).toFixed(0)}%)\`,

field: \'duplicates\'

});

suggestions.push({

suggestion: \'Improve deduplication logic or reduce overlapping
sources\'

});

}

const qualityScore = 1.0 - (issues.length \* 0.15);

return {

decision: qualityScore \>= this.minQualityThreshold ? \'APPROVE\' :
\'REVISE\',

quality_score: qualityScore,

issues: issues,

suggestions: suggestions

};

}

critiqueValidation(output, iteration) {

const issues = \[\];

const suggestions = \[\];

// Check 1: Too many conflicts

if (output.conflicts.length \> 3) {

issues.push({

severity: \'high\',

issue: \`\${output.conflicts.length} conflicts detected (max: 3)\`,

field: \'conflicts\'

});

suggestions.push({

suggestion: \'Escalate to human review or fetch additional sources\'

});

}

// Check 2: Low validation score

if (output.validation_score \< 70) {

issues.push({

severity: \'medium\',

issue: \`Validation score \${output.validation_score} below 70\`,

field: \'validation_score\'

});

suggestions.push({

suggestion: \'More sources needed for higher confidence\'

});

}

const qualityScore = output.validation_score / 100;

return {

decision: qualityScore \>= this.minQualityThreshold ? \'APPROVE\' :
\'ESCALATE\',

quality_score: qualityScore,

issues: issues,

suggestions: suggestions,

note: issues.length \> 0 ? \'Needs human review\' : null

};

}

critiqueScoring(output, iteration) {

const issues = \[\];

const suggestions = \[\];

// Check 1: Confidence too low for high score

if (output.q_score \>= 80 && output.confidence \< 0.7) {

issues.push({

severity: \'high\',

issue: \`High score (\${output.q_score}) with low confidence
(\${output.confidence.toFixed(2)})\`,

field: \'confidence\'

});

suggestions.push({

suggestion: \'Flag for human review before proceeding with outreach\'

});

}

// Check 2: Edge cases triggered but not explained

if (output.breakdown.edge_cases.length \> 0) {

const hasExplanation = output.explanation.breakdown.some(

b =\> b.component === \'edge_cases\'

);

if (!hasExplanation) {

issues.push({

severity: \'low\',

issue: \'Edge cases applied but not explained\',

field: \'explanation\'

});

suggestions.push({

suggestion: \'Add edge case explanation to breakdown\'

});

}

}

// Check 3: Score-confidence mismatch

const expectedConfidence = output.q_score \>= 85 ? 0.8 : 0.6;

if (output.confidence \< expectedConfidence) {

issues.push({

severity: \'medium\',

issue: \`Confidence \${output.confidence.toFixed(2)} below expected
\${expectedConfidence} for score \${output.q_score}\`,

field: \'confidence\'

});

}

const qualityScore = output.confidence;

return {

decision: issues.some(i =\> i.severity === \'high\') ? \'ESCALATE\' :
\'APPROVE\',

quality_score: qualityScore,

issues: issues,

suggestions: suggestions

};

}

critiqueOutreach(output, iteration) {

const issues = \[\];

const suggestions = \[\];

// Check 1: Doctrine violations

if (!output.doctrine_compliance.passed) {

const criticalViolations = output.doctrine_compliance.violations.filter(

v =\> v.severity === \'critical\'

);

if (criticalViolations.length \> 0) {

issues.push({

severity: \'critical\',

issue: \`\${criticalViolations.length} critical doctrine violations\`,

field: \'doctrine\'

});

suggestions.push({

suggestion: \'Regenerate message with stricter enforcement\'

});

return {

decision: \'REVISE\',

quality_score: 0.3,

issues: issues,

suggestions: suggestions

};

}

}

// Check 2: Message length

const bodyLength = output.message.body.length;

if (bodyLength \> 600) {

issues.push({

severity: \'medium\',

issue: \`Message too long (\${bodyLength} chars, target: 400-500)\`,

field: \'body\'

});

suggestions.push({

suggestion: \'Shorten opening or benefits paragraph\'

});

}

// Check 3: CTA clarity

if (!output.message.cta.includes(\'?\')) {

issues.push({

severity: \'low\',

issue: \'CTA is not a question\',

field: \'cta\'

});

suggestions.push({

suggestion: \'Rephrase CTA as a question for better engagement\'

});

}

// Check 4: Personalization

if (!output.message.body.includes(\'your\') &&
!output.message.body.includes(\'you\\\'re\')) {

issues.push({

severity: \'medium\',

issue: \'Message lacks personalization\',

field: \'personalization\'

});

suggestions.push({

suggestion: \'Add more company-specific context\'

});

}

const qualityScore = output.doctrine_compliance.score;

return {

decision: qualityScore \>= 0.9 ? \'APPROVE\' : \'REVISE\',

quality_score: qualityScore,

issues: issues,

suggestions: suggestions

};

}

}

**2. Orchestration Flow**

**Master Orchestrator**

// server/agents/orchestrator.js

class AgentOrchestrator {

constructor() {

this.discoveryAgent = new DiscoveryAgent();

this.validationAgent = new ValidationAgent();

this.scoringAgent = new ScoringAgent();

this.outreachAgent = new OutreachAgent();

this.criticAgent = new CriticAgent();

this.maxReflectionIterations = 2;

}

/\*\*

\* Main orchestration flow: Discovery → Validation → Scoring → Outreach

\* With reflection at each step

\*/

async processCompany(input) {

const context = {

run_id: generateUUID(),

started_at: new Date(),

steps: \[\]

};

try {

// STEP 1: Discovery

const discovery = await this.runWithReflection(

\'DiscoveryAgent\',

() =\> this.discoveryAgent.discover(input.queries, input.sources),

context

);

if (!discovery \|\| discovery.companies.length === 0) {

return this.abortRun(context, \'No companies discovered\');

}

// Process first company (can be batched later)

const company = discovery.companies\[0\];

// STEP 2: Validation

const validation = await this.runWithReflection(

\'ValidationAgent\',

() =\> this.validationAgent.validate(company, discovery.signals),

context

);

if (validation.validated_company.validation_status === \'NEEDS_REVIEW\')
{

return this.escalateToHuman(context, validation, \'Validation conflicts
detected\');

}

// STEP 3: Scoring

const scoring = await this.runWithReflection(

\'ScoringAgent\',

() =\> this.scoringAgent.score(

validation.validated_company,

discovery.signals,

null // Contact not yet found

),

context

);

if (scoring.decision === \'SKIP\') {

return this.skipCompany(context, scoring, \'Score below threshold\');

}

if (scoring.confidence \< 0.6) {

return this.escalateToHuman(context, scoring, \'Low confidence score\');

}

// STEP 4: Enrichment (find contact) - simplified here

const contact = await this.findContact(validation.validated_company);

if (!contact) {

return this.skipCompany(context, scoring, \'No contact found\');

}

// STEP 5: Outreach

const outreach = await this.runWithReflection(

\'OutreachAgent\',

() =\> this.outreachAgent.generateOutreach(

validation.validated_company,

contact,

discovery.signals,

\'COLD\'

),

context

);

// FINAL: Return complete package

return {

status: \'SUCCESS\',

run_id: context.run_id,

company: validation.validated_company,

scoring: scoring,

outreach: outreach,

context: context

};

} catch (error) {

return this.handleError(context, error);

}

}

/\*\*

\* Run agent with reflection loop

\*/

async runWithReflection(agentName, agentFunction, context) {

let iteration = 0;

let output = null;

let critique = null;

while (iteration \< this.maxReflectionIterations) {

// Step 1: Run agent

output = await agentFunction();

// Step 2: Critic reviews

critique = await this.criticAgent.critique(output, agentName,
iteration);

// Step 3: Log step

context.steps.push({

agent: agentName,

iteration: iteration,

output_summary: this.summarizeOutput(output),

critique: critique,

timestamp: new Date()

});

// Step 4: Decision

if (critique.decision === \'APPROVE\') {

console.log(\`✅ \${agentName} approved (iteration \${iteration})\`);

return output;

}

if (critique.decision === \'ESCALATE\') {

console.log(\`⚠️ \${agentName} escalated (iteration \${iteration})\`);

context.escalation = {

agent: agentName,

reason: critique.issues,

output: output

};

return output; // Return for human review

}

if (critique.decision === \'REVISE\') {

console.log(\`🔄 \${agentName} needs revision (iteration
\${iteration})\`);

// Apply suggestions and retry

if (agentName === \'OutreachAgent\') {

// For outreach, we can regenerate with additional constraints

output = await this.retryWithFeedback(agentFunction,
critique.suggestions);

} else {

// For other agents, just retry (data unlikely to change)

iteration++;

continue;

}

}

iteration++;

}

// Max iterations reached, return last output

console.log(\`⏰ \${agentName} max iterations reached, returning last
output\`);

return output;

}

async retryWithFeedback(agentFunction, suggestions) {

// This would enhance the prompt with feedback

// Simplified here - in reality, you\'d pass suggestions to agent

return await agentFunction();

}

summarizeOutput(output) {

if (Array.isArray(output.companies)) {

return \`Found \${output.companies.length} companies\`;

}

if (output.q_score) {

return \`Q-Score: \${output.q_score}\`;

}

if (output.message) {

return \`Message generated (\${output.message.body.length} chars)\`;

}

return \'Output generated\';

}

abortRun(context, reason) {

return {

status: \'ABORTED\',

run_id: context.run_id,

reason: reason,

context: context

};

}

escalateToHuman(context, data, reason) {

return {

status: \'NEEDS_REVIEW\',

run_id: context.run_id,

reason: reason,

data: data,

context: context

};

}

skipCompany(context, data, reason) {

return {

status: \'SKIPPED\',

run_id: context.run_id,

reason: reason,

data: data,

context: context

};

}

handleError(context, error) {

console.error(\'Orchestrator error:\', error);

return {

status: \'ERROR\',

run_id: context.run_id,

error: error.message,

context: context

};

}

async findContact(company) {

// Simplified - would call enrichment service

return {

id: generateUUID(),

first_name: \'Sara\',

last_name: \'Ahmed\',

title: \'HR Director\',

email: \'sara.ahmed\@example.ae\'

};

}

}

**3. Reflection Protocol**

**Deterministic Bounds**

\#\# Reflection Protocol Rules

\#\#\# Rule 1: Maximum Iterations

\- Each agent can be critiqued at most 2 times

\- After 2 iterations, APPROVE regardless of quality

\- Reason: Prevent infinite loops

\#\#\# Rule 2: Escalation Threshold

\- If CriticAgent detects critical issues → ESCALATE (human review)

\- If quality_score \< 0.5 → ESCALATE

\- If conflicts \> 3 → ESCALATE

\#\#\# Rule 3: Revision Scope

\- Only OutreachAgent can be revised (regenerate message)

\- Other agents cannot change their input data, so revision = retry

\- Limit retries to 1 per agent

\#\#\# Rule 4: Siva Logic Preservation

\- CriticAgent cannot override Siva\'s persona rules

\- Doctrine violations → always REVISE or REJECT

\- Quality issues → suggest improvements but don\'t enforce

\#\#\# Rule 5: Time Bounds

\- Total orchestration timeout: 5 minutes

\- Per-agent timeout: 60 seconds

\- If timeout → APPROVE and flag for review

\#\#\# Rule 6: Feedback Constraints

\- Suggestions must be actionable (not vague)

\- Issues must reference specific fields

\- Severity: critical \> high \> medium \> low

**4. Flow Diagrams**

**Happy Path (All Agents Approve)**

┌──────────────────────────────────────────────────────────┐

│ HAPPY PATH FLOW │

├──────────────────────────────────────────────────────────┤

│ │

│ 1. DiscoveryAgent │

│ ├─► Run: Find 15 UAE companies │

│ ├─► Critic: ✅ APPROVE (confidence 0.82) │

│ └─► Pass to ValidationAgent │

│ │

│ 2. ValidationAgent │

│ ├─► Run: Validate company facts │

│ ├─► Critic: ✅ APPROVE (validation_score 88) │

│ └─► Pass to ScoringAgent │

│ │

│ 3. ScoringAgent │

│ ├─► Run: Calculate Q-Score = 87 │

│ ├─► Critic: ✅ APPROVE (confidence 0.95) │

│ └─► Pass to OutreachAgent │

│ │

│ 4. OutreachAgent │

│ ├─► Run: Generate outreach message │

│ ├─► Critic: ✅ APPROVE (doctrine passed) │

│ └─► Return final output │

│ │

│ Result: SUCCESS ✅ │

│ Time: 3 minutes 12 seconds │

│ All agents passed first iteration │

│ │

└──────────────────────────────────────────────────────────┘

**Revision Path (Outreach Needs Improvement)**

┌──────────────────────────────────────────────────────────┐

│ REVISION PATH FLOW │

├──────────────────────────────────────────────────────────┤

│ │

│ 1-3. Discovery → Validation → Scoring │

│ (All approved ✅) │

│ │

│ 4. OutreachAgent (Iteration 0) │

│ ├─► Run: Generate message │

│ ├─► Output: \"I hope this finds you well\...\" │

│ └─► Critic: 🔄 REVISE │

│ └─► Issue: Generic opening (doctrine violation) │

│ │

│ 5. OutreachAgent (Iteration 1) │

│ ├─► Run: Regenerate with stricter enforcement │

│ ├─► Output: \"I noticed Amazon UAE recently\...\" │

│ └─► Critic: ✅ APPROVE │

│ └─► Doctrine passed, personalized │

│ │

│ Result: SUCCESS ✅ │

│ Time: 3 minutes 45 seconds │

│ 1 revision required (OutreachAgent) │

│ │

└──────────────────────────────────────────────────────────┘

**Escalation Path (Validation Conflicts)**

┌──────────────────────────────────────────────────────────┐

│ ESCALATION PATH FLOW │

├──────────────────────────────────────────────────────────┤

│ │

│ 1. DiscoveryAgent │

│ └─► Approved ✅ │

│ │

│ 2. ValidationAgent │

│ ├─► Run: Cross-check facts │

│ ├─► Output: 5 conflicts detected │

│ │ - Employee count: 120 (LinkedIn) vs 80 (news) │

│ │ - Industry: Tech vs Retail │

│ │ - Location: Dubai vs Abu Dhabi │

│ └─► Critic: ⚠️ ESCALATE │

│ └─► Too many conflicts (threshold: 3) │

│ │

│ Result: NEEDS_REVIEW ⚠️ │

│ Time: 2 minutes 5 seconds │

│ Flagged for human review before proceeding │

│ │

│ Human Action Required: │

│ - Review conflicting sources │

│ - Manually select correct values │

│ - Resume workflow or skip company │

│ │

└──────────────────────────────────────────────────────────┘

**5. Siva Logic Preservation**

**How Reflection Preserves Siva\'s Methodology**

\#\# Siva Logic Validation

\#\#\# Persona Enforcement

CriticAgent checks every output against Siva\'s core principles:

1\. \*\*Relationship-first approach\*\*

\- ✅ Position as \"point of contact\" (not product pitch)

\- ❌ Never mention pricing/features

2\. \*\*Research-based outreach\*\*

\- ✅ Reference specific company signal

\- ❌ Generic templates

3\. \*\*UAE market expertise\*\*

\- ✅ Understand local context (free zones, Ramadan, etc.)

\- ✅ Prioritize .ae domains and UAE addresses

4\. \*\*Quality over quantity\*\*

\- ✅ Score companies rigorously (threshold 70)

\- ✅ Escalate low-confidence cases

5\. \*\*Professional but conversational\*\*

\- ✅ Use contractions (\"you\'re\" not \"you are\")

\- ❌ No corporate jargon

\#\#\# Doctrine Compliance Matrix

\| Rule \| Enforced By \| Violation Action \|

\|\-\-\-\-\--\|\-\-\-\-\-\-\-\-\-\-\-\--\|\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\--\|

\| Reference specific signal \| CriticAgent (OutreachAgent review) \|
REVISE \|

\| No generic openings \| CriticAgent (Doctrine validator) \| REVISE \|

\| No pricing mentioned \| CriticAgent (Critical violation) \| REJECT →
Regenerate \|

\| Position as POC \| PromptManager (Template enforcement) \| REVISE \|

\| 15-min call CTA \| PromptManager (Template structure) \| REVISE \|

\| UAE presence required \| ScoringAgent (Base quality) \| SKIP company
\|

\| Confidence threshold \| CriticAgent (Scoring review) \| ESCALATE \|

\#\#\# How Reflection Improves Without Breaking Logic

\*\*Example: OutreachAgent generates message\*\*

Iteration 0:

Subject: Quick Question About Your Company Body: I hope this finds you
well. We offer comprehensive employee banking solutions\...

CriticAgent detects:

\- ❌ Generic opening

\- ❌ \"Comprehensive solutions\" (marketing speak)

\- ❌ No specific signal referenced

Decision: REVISE

Iteration 1:

Subject: Re: Amazon UAE\'s Engineering Team Expansion Body: I noticed
Amazon UAE is hiring 47 engineering roles across your Dubai tech hub
this quarter.

As you\'re scaling your engineering team, your new hires will likely
face the Emirates ID wait-time challenge when opening bank accounts\...

CriticAgent detects:

\- ✅ Specific signal referenced

\- ✅ Company-specific context

\- ✅ \"Point of contact\" positioning

\- ✅ Low-friction CTA

Decision: APPROVE

\*\*Key Point:\*\* Reflection improves quality while respecting Siva\'s
rules.

**6. Database Schema for Orchestration**

\-- Store orchestration runs

CREATE TABLE agent_runs (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

run_type TEXT NOT NULL, \-- \'discovery\', \'full_pipeline\',
\'outreach_only\'

status TEXT NOT NULL, \-- \'running\', \'success\', \'needs_review\',
\'error\'

\-- Input

input JSONB NOT NULL,

\-- Output

companies_processed INTEGER DEFAULT 0,

companies_approved INTEGER DEFAULT 0,

companies_skipped INTEGER DEFAULT 0,

companies_escalated INTEGER DEFAULT 0,

\-- Timing

started_at TIMESTAMPTZ DEFAULT NOW(),

finished_at TIMESTAMPTZ,

duration_seconds INTEGER,

\-- Context

context JSONB, \-- All step logs

\-- Errors

error_message TEXT,

created_at TIMESTAMPTZ DEFAULT NOW()

);

\-- Store individual agent executions

CREATE TABLE agent_executions (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

run_id UUID REFERENCES agent_runs(id),

agent_name TEXT NOT NULL,

iteration INTEGER DEFAULT 0,

\-- Input/Output

input JSONB,

output JSONB,

\-- Critique

critique JSONB,

decision TEXT, \-- \'APPROVE\', \'REVISE\', \'ESCALATE\'

quality_score NUMERIC(3,2),

\-- Timing

started_at TIMESTAMPTZ DEFAULT NOW(),

finished_at TIMESTAMPTZ,

duration_ms INTEGER,

created_at TIMESTAMPTZ DEFAULT NOW()

);

CREATE INDEX idx_executions_run ON agent_executions(run_id);

CREATE INDEX idx_executions_agent ON agent_executions(agent_name);

CREATE INDEX idx_executions_decision ON agent_executions(decision);

\-- Store reflection feedback

CREATE TABLE reflection_feedback (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

execution_id UUID REFERENCES agent_executions(id),

issue_severity TEXT, \-- \'critical\', \'high\', \'medium\', \'low\'

issue_description TEXT,

suggestion TEXT,

created_at TIMESTAMPTZ DEFAULT NOW()

);

**Enhanced Deliverable for Phase 11**

\# multi_agent_collaboration.md Structure

\#\# 1. Agent Definitions (5 agents)

For each agent:

\- Name, role, capabilities

\- Input/output interfaces

\- Constraints (timeouts, thresholds)

\- Tools required

\- Implementation pseudocode

\#\# 2. Orchestration Flow

\- Master orchestrator logic

\- runWithReflection() pattern

\- Error handling strategy

\- Escalation paths

\#\# 3. Reflection Protocol

\- Deterministic bounds (max iterations: 2)

\- Escalation thresholds

\- Revision scoping rules

\- Time limits

\- Feedback constraints

\#\# 4. Flow Diagrams (3 paths)

\- Happy path (all approve)

\- Revision path (1-2 revisions)

\- Escalation path (needs human review)

\#\# 5. Siva Logic Preservation

\- Persona enforcement checklist

\- Doctrine compliance matrix

\- How reflection improves without breaking rules

\- Example: Outreach iteration

\#\# 6. CriticAgent Implementation

\- Critique methods per agent

\- Quality scoring formulas

\- Issue detection rules

\- Suggestion generation

\#\# 7. Database Schema

\- agent_runs table

\- agent_executions table

\- reflection_feedback table

\#\# 8. Integration Points

\- How to trigger orchestrator

\- How to handle escalations

\- How to monitor runs

\- How to debug failures

\#\# 9. Testing Strategy

\- Unit tests (per agent)

\- Integration tests (full pipeline)

\- Reflection loop tests (max iterations)

\- Performance benchmarks

\#\# 10. Monitoring & Observability

\- Agent execution times

\- Revision rates (per agent)

\- Escalation rates

\- Quality score trends

**Critical Decisions for Phase 11**

**Decision 1: Reflection Depth**

-   \[ \] Shallow (only CriticAgent checks outputs)

-   \[x\] **Medium (CriticAgent + 2 revision iterations)**

-   \[ \] Deep (Multi-agent debate, consensus voting)

**My vote: Medium** (right balance for solo dev)

**Decision 2: Agent Specialization**

-   \[ \] Minimal (3 agents: Discovery, Scoring, Outreach)

-   \[x\] **Balanced (5 agents as outlined)**

-   \[ \] Extensive (10+ agents with narrow focus)

**My vote: Balanced** (sufficient specialization without complexity)

**Decision 3: Reflection Automation**

-   \[ \] Fully manual (human reviews all outputs)

-   \[x\] **Hybrid (auto-approve if high quality, escalate if issues)**

-   \[ \] Fully automated (always auto-approve after max iterations)

**My vote: Hybrid** (safe, maintains quality)

**Decision 4: Inter-Agent Communication**

-   \[ \] Synchronous only (blocking calls)

-   \[x\] **Synchronous with async option** (orchestrator decides)

-   \[ \] Fully asynchronous (event-driven)

**My vote: Synchronous with async option** (simpler for v1, can scale
later)

**Realistic Timeline for Phase 11**

**Week 1: Agent Implementations**

-   Build 5 agent classes

-   Unit test each agent

-   Integration stubs

**Week 2: Orchestrator & Reflection**

-   Build master orchestrator

-   Implement runWithReflection()

-   Build CriticAgent

**Week 3: Integration & Testing**

-   E2E testing (full pipeline)

-   Reflection loop testing

-   Performance tuning

**Week 4: Monitoring & Deployment**

-   Database schema

-   Monitoring dashboard

-   Deploy to staging

**Total: 4 weeks**

**What Success Looks Like**

After Phase 11:

✅ **5 specialized agents** (Discovery, Validation, Scoring, Outreach,
Critic) ✅ **Coordinated orchestration** (agents hand off work
seamlessly) ✅ **Reflection loops** (CriticAgent improves quality, max 2
iterations) ✅ **Deterministic behavior** (no infinite loops, predictable
flow) ✅ **Siva logic preserved** (doctrine enforced, persona maintained)
✅ **Escalation system** (human review when needed) ✅ **Full audit
trail** (every step logged for debugging)

**🎉 SIVA-AGENTIC-CORE COMPLETE!**

You\'ve now designed all 11 phases:

1.  ✅ Cognitive Extraction Logic

2.  ✅ Verifiable Enrichment Backbone

3.  ✅ Deterministic Knowledge Ingestion

4.  ✅ Agent Communication Protocol

5.  ✅ Tool Definitions

6.  ✅ Prompt Engineering (Siva-Mode)

7.  ✅ Quantitative Intelligence Layer

8.  ✅ Opportunity Lifecycle Engine

9.  ✅ Explainability & Transparency Layer

10. ✅ Feedback & Reinforcement Analytics

11. ✅ Multi-Agent Collaboration & Reflection

**Next step:** Implementation! Or would you like me to create a **Master
Implementation Roadmap** that sequences all 11 phases with dependencies
and milestones? 🚀
