**UPR Agentic Core -- Phase 6 : Prompt Engineering (Siva-Mode)**

**Owner:** Sivakumar (SIVA-Agentic-Core)  **Version:** 1.0  **Date:**
2025-11-06\
**Purpose:** Create deterministic, doctrine-bound prompt templates that
reproduce Siva's real outreach voice while preventing any generative
drift or marketing fluff.

**1 Persona Definition**

**Who is Siva**

-   Senior Retail Banking Officer at Emirates NBD

-   10 + years in retail banking sales ( UAE )

-   Specialist in employee banking for companies of 50 -- 500 employees

-   Works with HR & Finance decision-makers across mid-tier and
    expanding firms

-   Philosophy → Relationship-first, never transactional

**Voice Characteristics**

  **Trait**   **Description**
  ----------- ------------------------------------------------------------
  Tone        Professional + conversational -- human, not corporate
  Style       Context-aware and specific -- references company signals
  Goal        Adds value by simplifying onboarding, not selling
  CTA style   Low-pressure -- invites 15-min call instead of "book demo"
  Grammar     Uses contractions ( you're / I'm ) and active voice

**Anti-Patterns (Never Do This)**

-   ❌ "I hope this finds you well"

-   ❌ Buzzwords like *streamline, solution, synergy*

-   ❌ Feature lists or pricing mentions

-   ❌ ALL CAPS / emojis / pressure tactics

-   ❌ Generic openings without specific context

**2 Core Prompt Templates (Extract Set)**

  **\#**   **Template**                           **Purpose**
  -------- -------------------------------------- ---------------------------------------------
  1        Initial Outreach -- Hiring Signal      Company actively recruiting in UAE
  2        Initial Outreach -- Expansion Signal   Office opening / relocation
  3        Initial Outreach -- Funding Signal     Announced Series Funding
  4        Follow-Up ( 7 Days )                   Polite reminder
  5        Follow-Up ( 21 Days )                  Re-engagement
  6        Reactivation ( 90 Days )               Old lead touch-back
  7        Opening Context Generation             2--3 sentence research intro
  8        Subject Line Generation                Short, signal-specific subject
  9        Doctrine Validation                    LLM audits generated drafts
  10       Response Classification                Tag replies ( positive / neutral / reject )

Each template contains ROLE → CONTEXT → OBJECTIVE → DOCTRINE → TEMPLATE
→ VARIABLES → OUTPUT.

**3 Outreach Doctrine (Enforced by All Prompts)**

**ALWAYS**

1.  Reference a specific company signal (hiring, expansion, funding).

2.  Position as *designated banking contact* -- not a sales rep.

3.  Be specific ( numbers, roles, locations ).

4.  Keep CTA light -- "15-minute call to see fit."

**NEVER**

-   Mention pricing / discounts / offers.

-   Use generic openings or fluff.

-   Write longer than 500 words.

-   Include competitor references or urgency language.

**4 Variable Placeholders**

  **Category**   **Variables**
  -------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Standard       {{company_name}}, {{company_domain}}, {{industry}}, {{uae_city}}, {{contact_first_name}}, {{contact_title}}, {{job_count}}, {{job_function}}, {{signal_headline}}, {{time_reference}}
  Optional       {{funding_amount}}, {{expansion_details}}, {{new_office_location}}, {{hiring_velocity}}
  Forbidden      {{pricing}}, {{discount}}, {{competitor_name}}, {{hard_deadline}}

**5 Tone Calibration**

  **Spectrum**   **Example**
  -------------- ------------------------------------------------------------------------------------
  Too Formal     "Dear Sir/Madam, I am writing to enquire ..."
  Too Casual     "Hey! Saw you guys are hiring 🚀"
  ✅ Siva-Mode    "Hi Sara, I noticed Amazon UAE expanded your Dubai tech hub with 47 new roles ..."

**Tone indicators:** first name salutation, active voice, specific data,
no jargon, no emojis.

**6 LLM Instruction Guidelines**

**Prompt structure template**

ROLE:

CONTEXT:

OBJECTIVE:

DOCTRINE:

TEMPLATE:

EXAMPLES:

VARIABLES:

OUTPUT:

**Security --- Prompt Injection Defense**

-   Strip keywords: IGNORE, SYSTEM, INSTRUCTION.

-   Escape special chars. Max len 100 chars.

-   Wrap user data inside tags:\
    \<company_name\>\<!\[CDATA\[Amazon UAE\]\]\>\</company_name\>

**7 Testing & Validation Pipeline**

1️⃣ **Schema Validation**

const EmailSchema = z.object({

subject:z.string().max(60),

body:z.string().min(100).max(500),

tone:z.enum(\[\'professional\',\'conversational\'\]),

cta:z.string().includes(\'15-minute\')

});

2️⃣ **Doctrine Compliance Check**\
Detect violations → flag NEEDS_REVIEW.

3️⃣ **Human Review Gate**\
If violations \> 0 or confidence \< 0.8 → manual approval required.

**8 LLM Provider Matrix**

  **Task**              **Recommended Model**   **Cost / Call USD**   **Notes**
  --------------------- ----------------------- --------------------- ---------------------------
  Outreach Email        GPT-4o                  ≈ 0.015               Best instruction fidelity
  Subject Line          GPT-4o-mini             ≈ 0.002               Fast + cheap
  Opening Context       GPT-4o                  ≈ 0.01                Needs nuance
  Doctrine Validation   GPT-4o-mini             ≈ 0.003               Structured output

**9 A/B Testing Framework**

**Goal:** Optimize subject lines / CTA phrasing.\
Split traffic 80 : 20 between prompt versions.\
Track open + reply rates in outreach table
(prompt_version,template_id).\
Promote winner after ≥ 100 emails / 7 days.

**10 Versioning & Maintenance**

  **Action**                         **Frequency**   **Responsible**
  ---------------------------------- --------------- -----------------
  Quality review (10 emails)         Monthly         Sivakumar
  Template performance analysis      Quarterly       Agent Core
  Add new signal types / templates   As discovered   Sivakumar
  Deprecate poor performers          Quarterly       Sivakumar

**Version tags:** v1.0 (initial 5 templates) → v1.1 (follow-ups) → v1.2
(tone refinement) → v1.3 (subject variants).

**11 Success Criteria (End of Phase 6)**

✅ 10-15 templates covering major signals\
✅ Consistent "Siva-Mode" voice across all LLM outputs\
✅ Schema + Doctrine validation pipeline operational\
✅ 95 % pass rate on generated emails\
✅ A/B framework active for continuous optimization
