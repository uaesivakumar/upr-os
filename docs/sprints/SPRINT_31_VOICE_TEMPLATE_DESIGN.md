# Sprint 31: Voice Template System Design
## Phase 6 - Prompt Engineering (Siva-Mode)

**Status**: In Progress
**Sprint**: 31
**Estimated Time**: 20 hours

---

## Overview

The Voice Template System enables AI-powered generation of personalized outreach messages for Emirates NBD sales. It uses pre-defined voice templates with variable substitution, tone adjustment, and context-aware generation.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Outreach Generator API                     │
│                  POST /generate-outreach                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Voice Template Engine                           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Template   │  │   Variable   │  │  Tone Adjuster  │  │
│  │   Selector   │──│ Substitution │──│                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│         │                                      │            │
│         ▼                                      ▼            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Context Analyzer                            │  │
│  │  - Company Quality Score                              │  │
│  │  - Contact Tier                                       │  │
│  │  - Timing Score                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Voice Template Database                         │
│  - Core Templates (Introduction, Value Prop, Pain, CTA)    │
│  - Message Variants (Email, LinkedIn, Follow-up)           │
│  - Tone Variants (Formal, Professional, Casual)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Voice Template Structure

### Template Types

1. **Introduction Templates**
   - Purpose: Opening lines that establish context
   - Variables: `{first_name}`, `{company_name}`, `{industry}`
   - Tone Variants: Formal, Professional, Casual

2. **Value Proposition Templates**
   - Purpose: Communicate Emirates NBD's value
   - Variables: `{product_name}`, `{benefit}`, `{company_size}`
   - Context: Adjusted based on company quality score

3. **Pain Point Templates**
   - Purpose: Address customer challenges
   - Variables: `{pain_point}`, `{solution}`, `{roi}`
   - Context: Based on industry and company signals

4. **Call-to-Action Templates**
   - Purpose: Drive next steps
   - Variables: `{meeting_time}`, `{action}`, `{urgency}`
   - Variants: Soft CTA, Direct CTA, Time-bound CTA

---

## 2. Variable Substitution System

### Variable Syntax
- Standard: `{variable_name}`
- Optional: `{?variable_name}` - Removed if not provided
- Conditional: `{variable_name|default_value}` - Uses default if empty

### Variable Categories

**Company Variables**:
- `{company_name}` - Company name
- `{industry}` - Industry sector
- `{company_size}` - Small/Medium/Enterprise
- `{domain}` - Company website

**Contact Variables**:
- `{first_name}` - Contact first name
- `{last_name}` - Contact last name
- `{title}` - Job title
- `{department}` - Department

**Product Variables**:
- `{product_name}` - Banking product name
- `{benefit}` - Key benefit
- `{feature}` - Specific feature

**Timing Variables**:
- `{quarter}` - Fiscal quarter
- `{month}` - Current month
- `{urgency}` - Time-based urgency

---

## 3. Tone Adjustment Logic

### Tone Types

1. **Formal**
   - Use cases: Enterprise clients, C-suite contacts
   - Characteristics: Professional language, no contractions
   - Example: "I would like to discuss" vs "I'd like to discuss"

2. **Professional**
   - Use cases: Mid-market companies, VP-level contacts
   - Characteristics: Balance of warmth and professionalism
   - Example: Standard business communication

3. **Casual**
   - Use cases: Startups, founder-led companies
   - Characteristics: Conversational, friendly
   - Example: "Let's chat about" vs "I propose we discuss"

### Tone Selection Rules

```javascript
if (contact_tier === 'STRATEGIC' && company_size === 'enterprise') {
  tone = 'formal';
} else if (contact_tier === 'PRIORITY' && company_quality > 80) {
  tone = 'professional';
} else if (company_size === 'startup' || license_type === 'Free Zone') {
  tone = 'casual';
} else {
  tone = 'professional'; // default
}
```

---

## 4. Context-Aware Generation

### Context Inputs

**From CompanyQualityTool**:
- Quality score (0-100)
- Tier classification
- UAE signals
- Industry

**From ContactTierTool**:
- Contact tier (STRATEGIC/PRIORITY/STANDARD)
- Target titles
- Seniority level

**From TimingScoreTool**:
- Timing score (0-100)
- Best outreach time
- Calendar context

**From BankingProductMatchTool**:
- Recommended products
- Fit scores
- Product benefits

### Context Application

**High Quality Company (score > 80)**:
- Emphasize premium products
- Use formal/professional tone
- Highlight exclusivity

**Mid Quality Company (score 50-80)**:
- Focus on ROI and efficiency
- Use professional tone
- Emphasize proven results

**Growth Company (startup/scaleup)**:
- Highlight flexibility and support
- Use casual/professional tone
- Emphasize partnership

---

## 5. Message Variants

### Email Format
- Subject line generation
- Multi-paragraph structure
- Signature block
- CTA button/link

### LinkedIn Message Format
- Character limit: 300
- Personalized opening
- Single value prop
- Direct CTA

### Follow-up Format
- References previous interaction
- Adds new value/insight
- Softer CTA
- Multiple follow-up stages (1st, 2nd, 3rd)

---

## 6. Database Schema

### voice_templates Table
```sql
CREATE TABLE voice_templates (
  id SERIAL PRIMARY KEY,
  template_type VARCHAR(50) NOT NULL,  -- introduction, value_prop, pain_point, cta
  category VARCHAR(50),                 -- email, linkedin, followup
  tone VARCHAR(20),                     -- formal, professional, casual
  template_text TEXT NOT NULL,
  variables JSONB,                      -- Array of required variables
  conditions JSONB,                     -- When to use this template
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### generated_messages Table
```sql
CREATE TABLE generated_messages (
  id SERIAL PRIMARY KEY,
  company_id VARCHAR(255),
  contact_id VARCHAR(255),
  message_type VARCHAR(50),             -- email, linkedin, followup_1, etc.
  template_ids JSONB,                   -- Array of template IDs used
  generated_text TEXT NOT NULL,
  variables_used JSONB,
  tone VARCHAR(20),
  quality_score INTEGER,                -- Internal quality rating
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. API Design

### POST /generate-outreach

**Request**:
```json
{
  "message_type": "email",              // email, linkedin, followup_1
  "company": {
    "company_name": "TechCorp UAE",
    "domain": "techcorp.ae",
    "industry": "Technology",
    "size_bucket": "midsize",
    "quality_score": 85
  },
  "contact": {
    "first_name": "Ahmed",
    "last_name": "Al-Mansoori",
    "title": "Chief Financial Officer",
    "tier": "STRATEGIC"
  },
  "context": {
    "timing_score": 78,
    "recommended_products": ["Business Current Account", "Trade Finance"],
    "pain_points": ["cash flow management", "international payments"]
  },
  "tone": "professional"                // Optional: auto-detect if not provided
}
```

**Response**:
```json
{
  "success": true,
  "message": {
    "subject": "Streamline Cash Flow for TechCorp UAE",
    "body": "Dear Ahmed,\n\nI noticed TechCorp UAE's growth in the technology sector...",
    "tone": "professional",
    "message_type": "email",
    "templates_used": [
      {"type": "introduction", "id": 123},
      {"type": "value_prop", "id": 456},
      {"type": "cta", "id": 789}
    ],
    "quality_score": 87
  },
  "metadata": {
    "generated_at": "2025-01-18T12:00:00Z",
    "variables_substituted": 12,
    "context_applied": true
  }
}
```

---

## 8. Quality Metrics

### Template Quality Score (0-100)

**Calculated based on**:
- Variable coverage (all required variables provided)
- Context relevance (matches company/contact profile)
- Tone consistency (appropriate for recipient)
- Length appropriateness (not too short/long)
- Personalization level (generic vs highly personalized)

**Formula**:
```
quality_score = (
  variable_coverage * 0.25 +
  context_relevance * 0.30 +
  tone_consistency * 0.20 +
  length_appropriateness * 0.15 +
  personalization_level * 0.10
)
```

---

## 9. Testing Strategy

### Unit Tests
- Variable substitution logic
- Tone adjustment transformations
- Template selection algorithms

### Integration Tests
- Full message generation pipeline
- Database CRUD operations
- API endpoint responses

### Quality Tests
- Generated message quality scoring
- Tone consistency validation
- Variable coverage checks

### Smoke Tests (Critical)
- All template types generate successfully
- All message variants work
- All tone adjustments apply correctly

---

## 10. Implementation Phases

### Phase 1: Foundation (Tasks 1-4)
- ✅ Design document (this file)
- [ ] Database schema & migrations
- [ ] Core templates creation
- [ ] Variable substitution engine

### Phase 2: Intelligence (Tasks 5-6)
- [ ] Tone adjustment logic
- [ ] Context-aware generation

### Phase 3: Variants (Task 7)
- [ ] Email format templates
- [ ] LinkedIn message templates
- [ ] Follow-up templates

### Phase 4: API & Testing (Tasks 8-10)
- [ ] Outreach Generator API
- [ ] Smoke tests
- [ ] Testing framework

### Phase 5: Integration (Task 11)
- [ ] End-to-end integration
- [ ] Phase 6 completion
- [ ] Documentation

---

## Dependencies

- PostgreSQL database (existing)
- Agent Hub (for company/contact context)
- CompanyQualityTool, ContactTierTool, TimingScoreTool, BankingProductMatchTool

---

## Success Criteria

1. ✅ All 11 features implemented
2. ✅ Voice templates smoke test passing
3. ✅ Template testing framework operational
4. ✅ POST /generate-outreach API functional
5. ✅ Quality score > 80 for generated messages
6. ✅ All tone variants working correctly
7. ✅ Context-aware generation validated

---

## Next Steps

1. Implement database schema (Task 2)
2. Create core voice templates (Task 3)
3. Build variable substitution system (Task 4)
4. Proceed with remaining tasks sequentially
