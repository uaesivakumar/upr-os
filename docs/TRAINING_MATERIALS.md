# UPR Training Materials

**UPR - Unified Persona & Relationship Platform**
**Version:** 1.0.0
**Date:** 2025-11-19

---

## 📚 Table of Contents

1. [Training Overview](#training-overview)
2. [Learning Paths](#learning-paths)
3. [Quick Start Tutorial (10 Minutes)](#quick-start-tutorial)
4. [Module 1: Understanding UPR](#module-1-understanding-upr)
5. [Module 2: Lead Enrichment Workflow](#module-2-lead-enrichment-workflow)
6. [Module 3: AI-Powered Lead Scoring](#module-3-ai-powered-lead-scoring)
7. [Module 4: Outreach Generation](#module-4-outreach-generation)
8. [Module 5: Multi-Agent System (SIVA)](#module-5-multi-agent-system)
9. [Module 6: Analytics and Monitoring](#module-6-analytics-and-monitoring)
10. [Module 7: Advanced Features](#module-7-advanced-features)
11. [Interactive Exercises](#interactive-exercises)
12. [Video Tutorial Scripts](#video-tutorial-scripts)
13. [Best Practices and Tips](#best-practices-and-tips)
14. [Assessment Quiz](#assessment-quiz)
15. [Troubleshooting Guide](#troubleshooting-guide)

---

## Training Overview

### What is UPR?

UPR (Unified Persona & Relationship) is an intelligent lead enrichment and outreach automation platform that combines:
- **Multi-source data enrichment** from Apollo, Hunter, and LinkedIn
- **AI-powered lead scoring** using machine learning
- **Personalized outreach generation** with voice customization
- **Multi-agent collaboration** system (SIVA Framework)
- **Real-time analytics** and monitoring

### Who Should Use This Training?

- **Sales Teams**: Learn to enrich leads and generate personalized outreach
- **Developers**: Integrate UPR API into your applications
- **Data Analysts**: Use analytics and reporting features
- **System Administrators**: Manage and monitor the platform
- **Marketing Teams**: Automate lead qualification and outreach

### Prerequisites

- Basic understanding of REST APIs
- Familiarity with JSON format
- Access to UPR platform credentials
- (Optional) Programming knowledge for integration

---

## Learning Paths

### 🎯 Sales Professional Path (2-3 hours)
1. Quick Start Tutorial
2. Module 2: Lead Enrichment
3. Module 3: Lead Scoring
4. Module 4: Outreach Generation
5. Module 6: Analytics (basics)

### 💻 Developer Path (4-5 hours)
1. Quick Start Tutorial
2. Module 1: Understanding UPR (architecture)
3. All modules (2-7)
4. Advanced Features
5. Interactive Exercises

### 📊 Data Analyst Path (2-3 hours)
1. Quick Start Tutorial
2. Module 3: Lead Scoring
3. Module 6: Analytics and Monitoring
4. Advanced Features (reporting)

### ⚙️ Administrator Path (3-4 hours)
1. Module 1: Understanding UPR
2. Module 6: Analytics and Monitoring
3. Advanced Features
4. Refer to ADMIN_GUIDE.md

---

## Quick Start Tutorial

**Duration:** 10 minutes
**Goal:** Make your first API call and enrich a lead

### Step 1: Get Your API Credentials (2 min)

Contact your administrator for:
- API URL: `https://upr-web-service-191599223867.us-central1.run.app`
- Username and password

### Step 2: Authenticate (2 min)

```bash
# Login and get JWT token
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }' \
  -c cookies.txt
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Login successful",
  "user": {
    "username": "your_username",
    "role": "user"
  }
}
```

### Step 3: Check System Health (2 min)

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/meta/status \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "status": "operational",
  "timestamp": "2025-11-19T12:00:00.000Z"
}
```

### Step 4: Enrich Your First Lead (4 min)

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/enrich \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "company_name": "TechCorp",
    "domain": "techcorp.com",
    "contact_name": "John Smith",
    "contact_title": "VP of Sales"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "lead": {
    "id": "uuid-here",
    "company_name": "TechCorp",
    "domain": "techcorp.com",
    "contact_name": "John Smith",
    "contact_email": "john.smith@techcorp.com",
    "contact_tier": "T1",
    "lead_score": 87.5,
    "enrichment_status": "completed"
  }
}
```

**🎉 Congratulations!** You've successfully enriched your first lead!

---

## Module 1: Understanding UPR

**Duration:** 30 minutes
**Level:** Beginner to Intermediate

### 1.1 System Architecture

UPR is built on a modern, scalable architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    UPR Platform                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   API Layer  │  │ AI Agents    │  │  Analytics   │ │
│  │  (Express)   │  │  (SIVA)      │  │  Engine      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Enrichment   │  │ Lead Scoring │  │  Outreach    │ │
│  │  Services    │  │   Engine     │  │  Generator   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Database (PostgreSQL)                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Core Concepts

#### Lead
A potential customer with contact and company information
- **Fields**: name, email, title, company, domain
- **Enrichment Status**: pending → in_progress → completed/failed
- **Lead Score**: 0-100 (higher is better)

#### Company
An organization that may have multiple leads
- **Quality Score**: 0-1 (confidence in data quality)
- **Industry**: Business sector classification
- **Size**: Employee count

#### Contact Tier
Classification of contact seniority:
- **T1**: C-Level (CEO, CTO, CMO)
- **T2**: VP/Director Level
- **T3**: Manager Level
- **T4**: Individual Contributor

#### Lead Score
AI-calculated score (0-100) based on:
- **Fit Score** (40%): How well lead matches ICP
- **Engagement Score** (30%): Interaction history
- **Data Quality** (20%): Completeness and accuracy
- **Timing Score** (10%): Right time to engage

### 1.3 Key Features

1. **Multi-Source Enrichment**
   - Apollo API for company data
   - Hunter.io for email discovery
   - LinkedIn for professional profiles

2. **AI-Powered Intelligence**
   - Automatic lead scoring
   - Contact tier evaluation
   - Company quality assessment
   - Personalized outreach generation

3. **Multi-Agent System (SIVA)**
   - Discovery Agent: Finds patterns
   - Validation Agent: Verifies data
   - Critic Agent: Quality checks
   - Consensus mechanism for accuracy

4. **Real-Time Analytics**
   - Lead funnel visualization
   - Scoring performance metrics
   - Agent decision tracking
   - Campaign effectiveness

### 1.4 Technology Stack

- **Backend**: Node.js 24.x with Express 4.21
- **Database**: PostgreSQL (Cloud SQL)
- **AI Models**: OpenAI GPT-4, Anthropic Claude
- **Infrastructure**: Google Cloud Platform
- **APIs**: Apollo, Hunter, NeverBounce, OpenAI

---

## Module 2: Lead Enrichment Workflow

**Duration:** 45 minutes
**Level:** Beginner

### 2.1 Understanding Lead Enrichment

Lead enrichment is the process of enhancing basic lead information with additional data from multiple sources.

**Input:**
- Company name + domain
- Contact name (optional)
- Contact title (optional)

**Output:**
- Verified email address
- Complete contact information
- Company details (size, industry, location)
- Lead score
- Contact tier classification

### 2.2 Step-by-Step Enrichment Process

#### Step 1: Create a Lead

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/enrich \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "company_name": "Acme Corp",
    "domain": "acme.com",
    "contact_name": "Jane Doe",
    "contact_title": "Head of Marketing"
  }'
```

#### Step 2: Monitor Enrichment Status

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/leads?status=in_progress" \
  -b cookies.txt
```

#### Step 3: Retrieve Enriched Lead

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/leads/{lead_id}" \
  -b cookies.txt
```

### 2.3 Enrichment Sources

1. **Apollo API** (Priority 1)
   - Company information
   - Employee count
   - Industry classification
   - Contact data

2. **Hunter.io** (Priority 2)
   - Email discovery
   - Email pattern detection
   - Email verification

3. **NeverBounce** (Priority 3)
   - Email validation
   - Deliverability check

### 2.4 Handling Enrichment Results

**Success Response:**
```json
{
  "ok": true,
  "lead": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "company_name": "Acme Corp",
    "domain": "acme.com",
    "contact_name": "Jane Doe",
    "contact_email": "jane.doe@acme.com",
    "contact_title": "Head of Marketing",
    "contact_tier": "T2",
    "company_size": 250,
    "industry": "Software",
    "location": "San Francisco, CA",
    "lead_score": 82.5,
    "enrichment_status": "completed",
    "created_at": "2025-11-19T12:00:00Z"
  }
}
```

**Partial Enrichment:**
```json
{
  "ok": true,
  "lead": {
    "id": "...",
    "enrichment_status": "completed",
    "enrichment_notes": "Email not found, used pattern-based email"
  }
}
```

### 2.5 Best Practices

✅ **Do:**
- Provide domain for better accuracy
- Include contact title for tier classification
- Check enrichment status before proceeding
- Handle partial enrichment gracefully

❌ **Don't:**
- Submit duplicate leads (check first)
- Exceed rate limits (10 requests/minute)
- Ignore enrichment errors
- Use invalid email formats

### 2.6 Hands-On Exercise

**Exercise 2A: Enrich a Lead**

1. Choose a real company you want to research
2. Use the API to enrich a lead with:
   - Company name and domain
   - A contact name and title
3. Wait for enrichment to complete
4. Review the enriched data
5. Note the lead score and contact tier

**Expected Time:** 10 minutes

---

## Module 3: AI-Powered Lead Scoring

**Duration:** 45 minutes
**Level:** Intermediate

### 3.1 Understanding Lead Scoring

UPR uses a sophisticated AI model to calculate lead scores (0-100) based on multiple factors.

**Scoring Components:**

1. **Fit Score (40%)** - How well the lead matches your ICP
   - Company size
   - Industry match
   - Geographic location
   - Technology stack

2. **Engagement Score (30%)** - Lead's interaction level
   - Email opens
   - Link clicks
   - Response rate
   - Meeting bookings

3. **Data Quality Score (20%)** - Completeness and accuracy
   - Email verified
   - Phone number present
   - LinkedIn profile found
   - Recent job changes

4. **Timing Score (10%)** - Right time to engage
   - Funding events
   - Company growth signals
   - Job posting activity
   - Recent news

### 3.2 Interpreting Lead Scores

| Score Range | Quality | Action Recommended |
|-------------|---------|-------------------|
| 90-100 | Excellent | Immediate outreach |
| 80-89 | Very Good | High priority |
| 70-79 | Good | Medium priority |
| 60-69 | Fair | Nurture campaign |
| 50-59 | Low | Long-term nurture |
| Below 50 | Poor | Disqualify or research more |

### 3.3 Getting Lead Scores

```bash
# Get lead with score
curl "https://upr-web-service-191599223867.us-central1.run.app/api/leads/{lead_id}" \
  -b cookies.txt
```

```json
{
  "ok": true,
  "lead": {
    "id": "...",
    "lead_score": 87.5,
    "score_breakdown": {
      "fit_score": 35.0,
      "engagement_score": 28.5,
      "data_quality_score": 18.0,
      "timing_score": 6.0
    }
  }
}
```

### 3.4 Lead Prioritization API

Get prioritized leads based on scores:

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/lead-prioritization/prioritized?limit=10" \
  -b cookies.txt
```

**Response:**
```json
{
  "ok": true,
  "leads": [
    {
      "id": "...",
      "company_name": "TechCorp",
      "contact_name": "John Smith",
      "lead_score": 92.5,
      "priority_rank": 1,
      "urgency": "immediate"
    }
  ]
}
```

### 3.5 Score Monitoring

Track lead score changes over time:

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/lead-prioritization/score-history/{lead_id}" \
  -b cookies.txt
```

### 3.6 Hands-On Exercise

**Exercise 3A: Analyze Lead Scores**

1. Enrich 5 different leads from various industries
2. Compare their lead scores
3. Examine the score breakdown for each
4. Identify which components contributed most
5. Prioritize the leads for outreach

**Expected Time:** 15 minutes

---

## Module 4: Outreach Generation

**Duration:** 45 minutes
**Level:** Intermediate

### 4.1 Understanding Outreach Generation

UPR uses AI to generate personalized outreach messages based on:
- Lead information (name, title, company)
- Company intelligence (industry, size, news)
- Voice templates (tone, style, length)
- Campaign context

### 4.2 Voice Templates

Voice templates define the tone and style of your outreach:

| Voice Style | Use Case | Tone | Length |
|-------------|----------|------|--------|
| Professional Formal | Enterprise C-Level | Formal, respectful | 150-200 words |
| Friendly Professional | Mid-market | Warm, approachable | 100-150 words |
| Casual Conversational | Startups | Relaxed, informal | 80-120 words |
| Direct Value-Focused | Sales pitch | Direct, benefit-driven | 100-130 words |

### 4.3 Generating Outreach

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/outreach/generate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "lead_id": "123e4567-e89b-12d3-a456-426614174000",
    "voice_template_id": "template-123",
    "campaign_context": "Product launch for new analytics platform",
    "personalization_level": "high"
  }'
```

**Response:**
```json
{
  "ok": true,
  "outreach": {
    "subject": "Improving analytics at TechCorp",
    "body": "Hi John,\n\nI noticed TechCorp recently expanded your data team - congratulations! As Head of Analytics, you're likely focused on scaling your reporting capabilities.\n\nOur new analytics platform helped companies like yours reduce report generation time by 60% while improving data accuracy. Would you be open to a 15-minute demo?\n\nBest regards,\n[Your Name]",
    "personalization_score": 0.92,
    "confidence": 0.88
  }
}
```

### 4.4 Personalization Levels

- **High**: Includes company-specific insights, recent news, mutual connections
- **Medium**: Uses company and industry information
- **Low**: Generic template with name/company replacement

### 4.5 Best Practices for Outreach

✅ **Do:**
- Use high personalization for T1/T2 contacts
- A/B test different voice templates
- Keep subject lines under 50 characters
- Include clear call-to-action
- Test email deliverability

❌ **Don't:**
- Send generic mass emails
- Use overly long messages (>200 words)
- Make false claims about mutual connections
- Ignore spam trigger words
- Skip email validation

### 4.6 Hands-On Exercise

**Exercise 4A: Generate Personalized Outreach**

1. Take a high-scoring lead from Module 3
2. Choose an appropriate voice template
3. Generate outreach for that lead
4. Review the personalization score
5. Edit and refine the message if needed

**Expected Time:** 15 minutes

---

## Module 5: Multi-Agent System (SIVA)

**Duration:** 60 minutes
**Level:** Advanced

### 5.1 Introduction to SIVA Framework

SIVA (Shared Intelligence, Validated Action) is a multi-agent collaboration system where multiple AI agents work together to make better decisions.

**Three Agent Types:**

1. **Discovery Agent** - Explores and finds patterns
2. **Validation Agent** - Verifies and validates findings
3. **Critic Agent** - Provides quality assurance

### 5.2 How SIVA Works

```
Input → Discovery Agent → Validation Agent → Critic Agent → Consensus → Output
          ↓                    ↓                  ↓
      "Pattern found"    "Verified true"    "High confidence"
```

**Example: Contact Tier Evaluation**

1. **Discovery Agent**: "This person has 'VP' in title → T2"
2. **Validation Agent**: "LinkedIn shows VP of Sales → Confirmed T2"
3. **Critic Agent**: "Title matches, profile confirms → 95% confidence T2"
4. **Consensus**: T2 (confidence: 0.95)

### 5.3 SIVA Tools

UPR includes 12 SIVA tools for different tasks:

| Tool | Purpose | Example Use |
|------|---------|-------------|
| evaluate_contact_tier | Contact seniority classification | Determine if contact is T1/T2/T3/T4 |
| evaluate_company_quality | Company data quality assessment | Check if company data is reliable |
| discover_email_patterns | Find email format patterns | Discover company email structure |
| validate_data_source | Verify data source reliability | Check if LinkedIn data is current |
| generate_persona | Create buyer persona | Build ICP from lead data |
| analyze_sentiment | Analyze communication tone | Review email response sentiment |

### 5.4 Using SIVA Tools

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_contact_tier \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "contact_name": "Sarah Johnson",
    "contact_title": "Chief Marketing Officer",
    "linkedin_profile": "https://linkedin.com/in/sarahjohnson",
    "company_name": "TechCorp"
  }'
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "tier": "T1",
    "confidence": 0.98,
    "reasoning": "Title indicates C-level (CMO), LinkedIn profile confirms executive status",
    "agent_decisions": [
      {
        "agent": "discovery",
        "decision": "T1",
        "confidence": 0.95
      },
      {
        "agent": "validation",
        "decision": "T1",
        "confidence": 0.98
      },
      {
        "agent": "critic",
        "decision": "T1",
        "confidence": 1.0
      }
    ]
  }
}
```

### 5.5 Benefits of Multi-Agent System

- **Higher Accuracy**: Multiple agents reduce errors
- **Transparency**: See reasoning from each agent
- **Confidence Scores**: Know when to trust results
- **Adaptability**: Agents learn from feedback

### 5.6 Hands-On Exercise

**Exercise 5A: Use SIVA to Evaluate a Contact**

1. Choose a contact from your enriched leads
2. Use the `evaluate_contact_tier` tool
3. Examine each agent's decision
4. Note the confidence scores
5. Compare with your manual assessment

**Expected Time:** 15 minutes

---

## Module 6: Analytics and Monitoring

**Duration:** 45 minutes
**Level:** Intermediate

### 6.1 System Analytics

#### Lead Funnel Metrics

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/analytics/lead-funnel" \
  -b cookies.txt
```

**Response:**
```json
{
  "ok": true,
  "funnel": {
    "total_leads": 1000,
    "enriched": 950,
    "scored": 920,
    "high_score": 250,
    "contacted": 180,
    "responded": 45,
    "converted": 12
  },
  "conversion_rates": {
    "enrichment": 0.95,
    "scoring": 0.97,
    "contact": 0.72,
    "response": 0.25,
    "conversion": 0.27
  }
}
```

#### Scoring Performance

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/lead-prioritization/scoring-dashboard" \
  -b cookies.txt
```

### 6.2 Agent Performance Monitoring

Track how your AI agents are performing:

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/v1/agents" \
  -b cookies.txt
```

**Response:**
```json
{
  "ok": true,
  "agents": [
    {
      "id": "discovery-agent-1",
      "type": "discovery",
      "status": "active",
      "decisions_made": 14948,
      "average_confidence": 0.87,
      "uptime": "99.8%"
    }
  ]
}
```

### 6.3 System Health Monitoring

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/meta/status" \
  -b cookies.txt
```

### 6.4 Creating Custom Reports

Use the analytics API to build custom dashboards:

```javascript
// JavaScript example
async function getDailyReport() {
  const [funnel, scoring, agents] = await Promise.all([
    fetch('/api/analytics/lead-funnel'),
    fetch('/api/lead-prioritization/scoring-dashboard'),
    fetch('/api/agent-hub/v1/agents')
  ]);

  return {
    funnel: await funnel.json(),
    scoring: await scoring.json(),
    agents: await agents.json()
  };
}
```

### 6.5 Hands-On Exercise

**Exercise 6A: Build a Performance Dashboard**

1. Fetch lead funnel metrics
2. Get scoring performance data
3. Check agent health status
4. Calculate key metrics:
   - Lead enrichment success rate
   - Average lead score
   - Agent consensus rate
5. Create a summary report

**Expected Time:** 20 minutes

---

## Module 7: Advanced Features

**Duration:** 60 minutes
**Level:** Advanced

### 7.1 Batch Lead Processing

Process multiple leads efficiently:

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/batch-enrich \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "leads": [
      {
        "company_name": "Company A",
        "domain": "companya.com",
        "contact_name": "John Doe",
        "contact_title": "CEO"
      },
      {
        "company_name": "Company B",
        "domain": "companyb.com",
        "contact_name": "Jane Smith",
        "contact_title": "CTO"
      }
    ]
  }'
```

### 7.2 Lead Lifecycle Management

Track leads through their journey:

```bash
# Get lead lifecycle state
curl "https://upr-web-service-191599223867.us-central1.run.app/api/lifecycle/lead/{lead_id}/state" \
  -b cookies.txt
```

**Lead States:**
- `new` → `enriching` → `qualified` → `contacted` → `engaged` → `opportunity` → `closed`

### 7.3 Automated Workflows

Set up automated actions based on lead scores:

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/lead-prioritization/alerts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "alert_type": "high_score",
    "threshold": 85,
    "action": "notify",
    "notification_channel": "email"
  }'
```

### 7.4 Custom Integration Webhooks

Receive real-time notifications:

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/webhooks/subscribe \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "event": "lead.enriched",
    "url": "https://your-system.com/webhook",
    "secret": "your-webhook-secret"
  }'
```

### 7.5 A/B Testing Outreach

Test different voice templates:

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/outreach/ab-test \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "lead_ids": ["id1", "id2", "id3"],
    "voice_template_a": "professional-formal",
    "voice_template_b": "friendly-professional",
    "split_ratio": 0.5
  }'
```

### 7.6 Hands-On Exercise

**Exercise 7A: Build an Automated Lead Pipeline**

1. Set up batch enrichment for 10 leads
2. Configure automatic scoring
3. Create an alert for leads scoring >85
4. Set up lifecycle tracking
5. Monitor the automation

**Expected Time:** 25 minutes

---

## Interactive Exercises

### Exercise Set 1: Basic Operations (30 min)

**E1.1: Authentication Flow**
- Login with your credentials
- Verify JWT token is received
- Test authenticated endpoint
- Logout and verify token is invalidated

**E1.2: Lead Enrichment**
- Create 3 leads from different industries
- Monitor enrichment progress
- Compare enrichment results
- Calculate success rate

**E1.3: Lead Scoring**
- Score your enriched leads
- Analyze score breakdown
- Rank leads by priority
- Identify top opportunities

### Exercise Set 2: Intermediate Operations (45 min)

**E2.1: Outreach Campaign**
- Choose top 5 leads by score
- Generate personalized outreach for each
- A/B test 2 voice templates
- Track which performs better

**E2.2: SIVA Multi-Agent Analysis**
- Use contact tier evaluation
- Use company quality assessment
- Compare agent decisions
- Calculate consensus accuracy

**E2.3: Analytics Dashboard**
- Pull funnel metrics
- Create score distribution chart
- Monitor agent performance
- Generate weekly report

### Exercise Set 3: Advanced Operations (60 min)

**E3.1: Batch Processing**
- Prepare CSV with 20 leads
- Batch enrich all leads
- Monitor batch progress
- Handle partial failures

**E3.2: Automated Workflow**
- Set up lifecycle tracking
- Configure score-based alerts
- Create webhook integration
- Test automation end-to-end

**E3.3: Custom Integration**
- Build a simple dashboard
- Integrate UPR API
- Display real-time metrics
- Add export functionality

---

## Video Tutorial Scripts

### Video 1: Getting Started with UPR (10 min)

**Script:**

[00:00 - 00:30] **Introduction**
> "Welcome to UPR - the Unified Persona & Relationship platform. In this video, we'll walk through your first API calls and enrich your first lead. By the end, you'll understand the basics of UPR's powerful enrichment capabilities."

[00:30 - 02:00] **Authentication**
> "First, we need to authenticate. Open your terminal and let's use cURL to login..."
- Show login command
- Explain JWT token
- Save cookies for subsequent requests

[02:00 - 04:00] **System Health Check**
> "Let's verify the system is operational. We'll call the status endpoint..."
- Show status command
- Explain response format
- Discuss what to check

[04:00 - 07:00] **Enriching Your First Lead**
> "Now for the exciting part - let's enrich a lead. We'll start with a company name and domain..."
- Show enrichment POST request
- Explain request payload
- Walk through response fields

[07:00 - 09:30] **Understanding the Results**
> "Let's analyze what we got back. Notice the contact tier, lead score, and enrichment status..."
- Highlight key fields
- Explain contact tiers
- Discuss lead scores

[09:30 - 10:00] **Next Steps**
> "Congratulations! You've enriched your first lead. In the next video, we'll explore lead scoring and prioritization. Thanks for watching!"

### Video 2: AI-Powered Lead Scoring (12 min)

**Script:**

[00:00 - 01:00] **Introduction**
> "Welcome back! Today we're diving into UPR's AI-powered lead scoring system. You'll learn how leads are scored and how to prioritize your outreach."

[01:00 - 03:00] **Understanding Lead Scores**
> "Lead scores range from 0 to 100. They're calculated using four components: fit, engagement, data quality, and timing..."
- Show score breakdown visualization
- Explain each component
- Give examples

[03:00 - 06:00] **Getting Lead Scores**
> "Let's pull a lead and examine its score..."
- Show API call
- Analyze score breakdown
- Discuss interpretation

[06:00 - 09:00] **Lead Prioritization**
> "Now let's use the prioritization API to get our hottest leads..."
- Show prioritization endpoint
- Sort by score
- Filter by threshold

[09:00 - 11:30] **Taking Action**
> "With prioritized leads, you can focus your efforts. High-scoring leads deserve immediate attention..."
- Discuss action strategies
- Show urgency indicators
- Best practices

[11:30 - 12:00] **Conclusion**
> "Now you understand how to score and prioritize leads. Next, we'll explore personalized outreach generation!"

### Video 3: Personalized Outreach with AI (15 min)

[Script similar structure - covering outreach generation, voice templates, personalization]

### Video 4: Multi-Agent System Deep Dive (18 min)

[Script covering SIVA framework, agents, tools, consensus]

### Video 5: Analytics and Monitoring (12 min)

[Script covering dashboards, metrics, reporting]

---

## Best Practices and Tips

### API Usage Best Practices

✅ **Rate Limiting**
- Respect rate limits (10 req/min for enrichment)
- Implement exponential backoff
- Cache responses when possible
- Use batch endpoints for multiple operations

✅ **Error Handling**
```javascript
async function enrichLead(data) {
  try {
    const response = await fetch('/api/leads/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait and retry
        await sleep(60000);
        return enrichLead(data);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Enrichment failed:', error);
    throw error;
  }
}
```

✅ **Authentication**
- Store JWT tokens securely
- Refresh tokens before expiry
- Never hardcode credentials
- Use environment variables

### Lead Management Tips

💡 **Enrichment Strategy**
1. Start with high-value leads
2. Enrich in batches during off-peak hours
3. Monitor enrichment success rate
4. Re-enrich stale data (>90 days)

💡 **Scoring Strategy**
1. Review score distribution weekly
2. Adjust thresholds based on conversion data
3. Focus on leads scoring 80+
4. Nurture leads scoring 60-79

💡 **Outreach Strategy**
1. Use high personalization for T1/T2
2. A/B test voice templates
3. Track response rates by template
4. Iterate based on data

### Performance Optimization

⚡ **Response Caching**
```javascript
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedLead(leadId) {
  const cached = cache.get(leadId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchLead(leadId);
  cache.set(leadId, { data, timestamp: Date.now() });
  return data;
}
```

⚡ **Batch Operations**
- Group similar operations
- Use batch endpoints
- Process in parallel when possible
- Monitor batch success rates

⚡ **Database Queries**
- Use pagination for large datasets
- Filter on server-side, not client
- Request only needed fields
- Implement proper indexing

---

## Assessment Quiz

### Section 1: Basic Knowledge (10 questions)

**Q1. What does UPR stand for?**
- a) Universal Platform for Relationships
- b) Unified Persona & Relationship
- c) User Profile Repository
- d) Unified Product Registry

**Answer: B**

**Q2. What are the four contact tiers in UPR?**
- a) Bronze, Silver, Gold, Platinum
- b) A, B, C, D
- c) T1, T2, T3, T4
- d) Executive, Manager, Associate, Entry

**Answer: C**

**Q3. What is the maximum lead score in UPR?**
- a) 10
- b) 50
- c) 100
- d) 1000

**Answer: C**

**Q4. Which API is used for email discovery?**
- a) Apollo
- b) Hunter.io
- c) LinkedIn
- d) All of the above

**Answer: B**

**Q5. What is the rate limit for enrichment endpoints?**
- a) 5 requests per minute
- b) 10 requests per minute
- c) 100 requests per 15 minutes
- d) Unlimited

**Answer: B**

**Q6. What does SIVA stand for?**
- a) System Intelligence Validation Assistant
- b) Shared Intelligence, Validated Action
- c) Smart Integration Virtual Agent
- d) Statistical Intelligence Verification Algorithm

**Answer: B**

**Q7. How many agent types are in the SIVA framework?**
- a) 1
- b) 2
- c) 3
- d) 4

**Answer: C**

**Q8. What is a T1 contact?**
- a) Entry-level employee
- b) Manager
- c) VP/Director
- d) C-Level executive

**Answer: D**

**Q9. What percentage of lead score comes from fit score?**
- a) 20%
- b) 30%
- c) 40%
- d) 50%

**Answer: C**

**Q10. What is the recommended action for leads scoring 90-100?**
- a) Disqualify
- b) Nurture campaign
- c) Medium priority
- d) Immediate outreach

**Answer: D**

### Section 2: Intermediate Knowledge (10 questions)

[Questions 11-20 covering API usage, workflows, scoring, etc.]

### Section 3: Advanced Knowledge (10 questions)

[Questions 21-30 covering SIVA, automation, integrations, etc.]

### Scoring Guide

- **27-30 correct**: Expert level - Ready for advanced usage
- **24-26 correct**: Advanced - Strong understanding
- **20-23 correct**: Intermediate - Continue learning
- **15-19 correct**: Beginner - Review modules
- **Below 15**: Review all training materials

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Authentication Failed

**Symptoms:**
```json
{
  "ok": false,
  "error": "Invalid credentials"
}
```

**Solutions:**
1. Verify username and password
2. Check for typos in credentials
3. Ensure environment variables are set correctly
4. Contact administrator for credential reset

**Prevention:**
- Use environment variables
- Test credentials in isolation
- Implement proper error handling

---

#### Issue 2: Rate Limit Exceeded

**Symptoms:**
```json
{
  "ok": false,
  "error": "Rate limit exceeded"
}
```

**Solutions:**
1. Wait 60 seconds before retrying
2. Implement exponential backoff
3. Use batch endpoints for multiple operations
4. Cache responses to reduce API calls

**Example Fix:**
```javascript
async function enrichWithRetry(data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await enrichLead(data);
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

---

#### Issue 3: Lead Enrichment Failed

**Symptoms:**
```json
{
  "ok": true,
  "lead": {
    "enrichment_status": "failed",
    "enrichment_error": "Email not found"
  }
}
```

**Solutions:**
1. Verify domain is correct
2. Check if company exists and is active
3. Try providing more contact details
4. Review enrichment logs for specific error

**Recovery Steps:**
```bash
# 1. Check lead details
curl "https://upr-web-service-191599223867.us-central1.run.app/api/leads/{lead_id}" \
  -b cookies.txt

# 2. Retry with more information
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/enrich \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "company_name": "Company Name",
    "domain": "company.com",
    "contact_name": "Full Name",
    "contact_title": "Exact Title",
    "contact_linkedin": "linkedin-url"
  }'
```

---

#### Issue 4: Low Lead Scores

**Symptoms:**
- All leads scoring below 60
- Scores not matching expectations

**Solutions:**
1. Review fit score criteria
2. Ensure complete lead data
3. Check if ICP configuration is correct
4. Verify data quality

**Debug Steps:**
```bash
# Get score breakdown
curl "https://upr-web-service-191599223867.us-central1.run.app/api/leads/{lead_id}" \
  -b cookies.txt

# Check which component is low
# - fit_score: Review ICP match
# - data_quality_score: Enrich more data
# - engagement_score: Track interactions
# - timing_score: Check for trigger events
```

---

#### Issue 5: Outreach Generation Quality

**Symptoms:**
- Generic outreach messages
- Low personalization scores
- Not matching brand voice

**Solutions:**
1. Use high personalization level
2. Provide more context in request
3. Try different voice templates
4. A/B test templates
5. Provide company-specific information

**Improvement Example:**
```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/outreach/generate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "lead_id": "...",
    "voice_template_id": "professional-formal",
    "personalization_level": "high",
    "campaign_context": "Detailed campaign description with specific value props",
    "company_insights": "Recent funding, news, growth signals",
    "mutual_connections": "Names of mutual connections if any"
  }'
```

---

### Quick Diagnostic Commands

```bash
# 1. Check API connectivity
curl -I https://upr-web-service-191599223867.us-central1.run.app/api/meta/status

# 2. Verify authentication
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  -v

# 3. Check rate limit status
curl https://upr-web-service-191599223867.us-central1.run.app/api/meta/rate-limits \
  -b cookies.txt

# 4. Review recent errors
curl https://upr-web-service-191599223867.us-central1.run.app/api/meta/error-log \
  -b cookies.txt
```

---

## Getting Help

### Support Resources

📚 **Documentation**
- User Guide: `docs/USER_GUIDE.md`
- Technical Architecture: `docs/TECHNICAL_ARCHITECTURE.md`
- Admin Guide: `docs/ADMIN_GUIDE.md`
- API Reference: `docs/openapi-complete.yaml`

💬 **Community**
- Internal Slack: #upr-support
- Email: support@upr.ai
- Office Hours: Every Tuesday 2-3pm

🐛 **Bug Reports**
- GitHub Issues: [repo]/issues
- Include: API endpoint, request/response, error message

🎓 **Additional Training**
- Advanced workshops: Monthly
- One-on-one sessions: By appointment
- Video library: Available in learning portal

---

## Conclusion

Congratulations on completing the UPR training materials! You now have the knowledge to:

✅ Authenticate and make API calls
✅ Enrich leads with multi-source data
✅ Understand and use AI lead scoring
✅ Generate personalized outreach
✅ Leverage the multi-agent SIVA system
✅ Monitor analytics and performance
✅ Implement advanced workflows and automation

### Next Steps

1. Complete the hands-on exercises
2. Take the assessment quiz
3. Build a small integration project
4. Attend office hours with questions
5. Share feedback to improve training

### Continuous Learning

- Review new feature announcements
- Attend monthly workshops
- Join the UPR community
- Share your use cases and learnings
- Contribute to best practices

**Happy lead enriching! 🚀**
