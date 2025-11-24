# UPR User Guide

## Unified Persona & Relationship System - Complete User Documentation

Version 1.0.0 | Last Updated: 2025-11-19

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Quick Start Guide](#quick-start-guide)
4. [Feature Guides](#feature-guides)
5. [Common Workflows](#common-workflows)
6. [Troubleshooting & FAQ](#troubleshooting--faq)
7. [API Reference](#api-reference)
8. [Best Practices](#best-practices)

---

## Introduction

### What is UPR?

UPR (Unified Persona & Relationship) is an intelligent lead enrichment and outreach automation platform that combines:

- **Multi-source data enrichment** from Apollo, Hunter, LinkedIn, and more
- **AI-powered lead scoring** using advanced machine learning algorithms
- **Personalized outreach generation** with GPT-4 powered content creation
- **Multi-agent collaboration system** (SIVA Framework) for intelligent decision-making
- **Real-time analytics** and performance monitoring

### Key Features

- **97-99% cost reduction** in email discovery through LLM-powered pattern recognition
- **Proprietary email pattern database** with 100+ verified patterns
- **Self-learning system** that improves with every validation
- **Multi-agent intelligence** for company quality assessment and contact tier evaluation
- **Production-ready API** deployed on Google Cloud Platform

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    UPR Platform                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ Lead         │  │ Company      │  │ Contact  │ │
│  │ Enrichment   │  │ Intelligence │  │ Scoring  │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ Multi-Agent  │  │ Outreach     │  │ Analytics│ │
│  │ System (SIVA)│  │ Generation   │  │ Dashboard│ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
         │                    │                │
         ▼                    ▼                ▼
   Cloud SQL DB         OpenAI API      Google Cloud
   (PostgreSQL)         SerpAPI         Infrastructure
```

---

## Getting Started

### Prerequisites

Before using the UPR API, ensure you have:

1. **API Access**: Credentials to the production server
2. **Authentication**: Admin username and password
3. **Network Access**: Ability to reach `https://upr-web-service-191599223867.us-central1.run.app`

### Production Environment

- **API Base URL**: `https://upr-web-service-191599223867.us-central1.run.app`
- **Database**: Cloud SQL @ `34.121.0.240:5432`
- **Platform**: Google Cloud Run (us-central1)

### Authentication Overview

UPR uses JWT (JSON Web Token) authentication. You can authenticate in two ways:

1. **Cookie-based authentication** (recommended for web applications)
2. **Bearer token authentication** (recommended for API clients)

### Rate Limits

Be aware of the following rate limits:

| Endpoint Category | Rate Limit |
|------------------|------------|
| General API | 100 requests per 15 minutes |
| Enrichment endpoints | 10 requests per minute |
| Authentication endpoints | 5 requests per minute |

**Important**: Rate limits are enforced per IP address. If you exceed limits, you'll receive a `429 Too Many Requests` response.

---

## Quick Start Guide

### Step 1: Authenticate

First, obtain a JWT token by logging in:

**Using cURL:**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }' \
  -c cookies.txt
```

**Using JavaScript (fetch):**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Important for cookie handling
  body: JSON.stringify({
    username: 'admin',
    password: 'your-password'
  })
});

const result = await response.json();
console.log('Logged in as:', result.user.username);
```

**Using Python (requests):**

```python
import requests

session = requests.Session()

response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/auth/login',
    json={
        'username': 'admin',
        'password': 'your-password'
    }
)

result = response.json()
print(f"Logged in as: {result['user']['username']}")

# Session automatically stores the JWT cookie
```

**Response:**

```json
{
  "ok": true,
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

### Step 2: Verify Your Session

Check that your authentication is working:

**cURL:**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/auth/verify \
  -b cookies.txt
```

**JavaScript:**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/api/auth/verify', {
  credentials: 'include'
});

const result = await response.json();
console.log('Authenticated:', result.authenticated);
```

**Python:**

```python
response = session.get(
    'https://upr-web-service-191599223867.us-central1.run.app/api/auth/verify'
)

result = response.json()
print(f"Authenticated: {result['authenticated']}")
```

### Step 3: Check System Health

Verify the system is operational:

**cURL:**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/health
```

**JavaScript:**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/health');
const health = await response.json();
console.log('System status:', health.status);
console.log('Uptime:', health.uptime, 'seconds');
```

**Python:**

```python
response = requests.get('https://upr-web-service-191599223867.us-central1.run.app/health')
health = response.json()
print(f"System status: {health['status']}")
print(f"Uptime: {health['uptime']} seconds")
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-11-19T10:30:00.000Z",
  "uptime": 3600.5,
  "port": 8080
}
```

---

## Feature Guides

### 1. Authentication Module

#### Login

Create a new authenticated session.

**Endpoint:** `POST /api/auth/login`

**Request:**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

**Success Response (200):**

```json
{
  "ok": true,
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

**Error Response (401):**

```json
{
  "ok": false,
  "error": "Invalid credentials"
}
```

#### Get Current User Info

Retrieve information about the authenticated user.

**Endpoint:** `GET /api/auth/me`

**cURL:**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/auth/me \
  -b cookies.txt
```

**JavaScript:**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/api/auth/me', {
  credentials: 'include'
});

const result = await response.json();
console.log('User info:', result.user);
```

**Python:**

```python
response = session.get(
    'https://upr-web-service-191599223867.us-central1.run.app/api/auth/me'
)

result = response.json()
print(f"User: {result['user']}")
```

**Response:**

```json
{
  "ok": true,
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

#### Logout

Clear the authentication session.

**Endpoint:** `POST /api/auth/logout`

**cURL:**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/logout \
  -b cookies.txt
```

**JavaScript:**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/api/auth/logout', {
  method: 'POST',
  credentials: 'include'
});

const result = await response.json();
console.log('Logged out:', result.ok);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/auth/logout'
)

result = response.json()
print(f"Logged out: {result['ok']}")
```

---

### 2. Lead Enrichment Module

Lead enrichment is the core feature of UPR. It automatically enriches lead data using multiple sources including Apollo, Hunter, and our proprietary LLM-powered email discovery system.

#### Start Lead Enrichment Job

Initiate asynchronous enrichment of one or more leads.

**Endpoint:** `POST /api/enrichment/start`

**Features:**
- Multi-source data enrichment (Apollo, Hunter, LinkedIn)
- LLM-powered email pattern discovery (97-99% cost reduction)
- Automatic email verification with NeverBounce
- AI-powered data enhancement with OpenAI

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| leads | array | Yes | Array of lead objects to enrich |
| max_contacts | integer | No | Maximum contacts per company (1-10, default: 3) |

**Lead Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| company_name | string | Yes | Company name |
| domain | string | Yes | Company domain (e.g., "acme.com") |
| contact_name | string | No | Contact full name |
| contact_email | string | No | Contact email (if known) |

**Example Request (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/start \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {
        "company_name": "Microsoft",
        "domain": "microsoft.com",
        "contact_name": "Satya Nadella"
      },
      {
        "company_name": "Acme Corp",
        "domain": "acme.com"
      }
    ],
    "max_contacts": 5
  }'
```

**JavaScript:**

```javascript
const response = await fetch('https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/start', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    leads: [
      {
        company_name: 'Microsoft',
        domain: 'microsoft.com',
        contact_name: 'Satya Nadella'
      },
      {
        company_name: 'Acme Corp',
        domain: 'acme.com'
      }
    ],
    max_contacts: 5
  })
});

const result = await response.json();
console.log('Job ID:', result.job_id);
console.log('Status:', result.status);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/start',
    json={
        'leads': [
            {
                'company_name': 'Microsoft',
                'domain': 'microsoft.com',
                'contact_name': 'Satya Nadella'
            },
            {
                'company_name': 'Acme Corp',
                'domain': 'acme.com'
            }
        ],
        'max_contacts': 5
    }
)

result = response.json()
print(f"Job ID: {result['job_id']}")
print(f"Status: {result['status']}")
```

**Response (202 Accepted):**

```json
{
  "ok": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "in_progress"
}
```

#### Check Enrichment Job Status

Monitor the progress of an enrichment job.

**Endpoint:** `GET /api/enrichment/status/{job_id}`

**cURL:**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/status/550e8400-e29b-41d4-a716-446655440000 \
  -b cookies.txt
```

**JavaScript:**

```javascript
const jobId = '550e8400-e29b-41d4-a716-446655440000';

const response = await fetch(
  `https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/status/${jobId}`,
  { credentials: 'include' }
);

const status = await response.json();
console.log('Progress:', status.progress + '%');
console.log('Completed:', status.completed, '/', status.total);
```

**Python:**

```python
job_id = '550e8400-e29b-41d4-a716-446655440000'

response = session.get(
    f'https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/status/{job_id}'
)

status = response.json()
print(f"Progress: {status['progress']}%")
print(f"Completed: {status['completed']} / {status['total']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "status": "in_progress",
  "progress": 75.5,
  "completed": 15,
  "total": 20
}
```

**Possible Status Values:**
- `pending`: Job queued but not started
- `in_progress`: Currently enriching leads
- `completed`: All leads enriched successfully
- `failed`: Job encountered an error

**Polling Best Practice:**

```javascript
// Poll every 5 seconds until complete
async function waitForCompletion(jobId) {
  while (true) {
    const response = await fetch(
      `https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/status/${jobId}`,
      { credentials: 'include' }
    );

    const status = await response.json();
    console.log(`Progress: ${status.progress}%`);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }
}

// Usage
const finalStatus = await waitForCompletion('550e8400-e29b-41d4-a716-446655440000');
```

---

### 3. Company Intelligence Module

Evaluate company quality using the multi-agent SIVA framework.

#### Evaluate Company Quality

Use AI agents to assess company quality based on UAE market signals, salary indicators, size, sector, and more.

**Endpoint:** `POST /api/agent-core/v1/tools/evaluate_company_quality`

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| company_name | string | Yes | Company name |
| domain | string | Yes | Company domain |
| industry | string | No | Industry/sector |
| uae_signals | object | No | UAE-specific signals |
| salary_indicators | object | No | Salary level indicators |
| size | integer | No | Number of employees |
| size_bucket | string | No | startup, small, midsize, enterprise |
| license_type | string | No | License type (e.g., "Free Zone") |
| sector | string | No | Government, Private, Semi-Government |

**Example (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_company_quality \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "TechCorp UAE",
    "domain": "techcorp.ae",
    "industry": "Technology",
    "uae_signals": {
      "has_ae_domain": true,
      "has_uae_address": true,
      "linkedin_location": "Dubai, UAE"
    },
    "salary_indicators": {
      "salary_level": "high",
      "avg_salary": 85000
    },
    "size": 250,
    "size_bucket": "midsize",
    "license_type": "Free Zone",
    "sector": "Private"
  }'
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_company_quality',
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'TechCorp UAE',
      domain: 'techcorp.ae',
      industry: 'Technology',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true,
        linkedin_location: 'Dubai, UAE'
      },
      salary_indicators: {
        salary_level: 'high',
        avg_salary: 85000
      },
      size: 250,
      size_bucket: 'midsize',
      license_type: 'Free Zone',
      sector: 'Private'
    })
  }
);

const evaluation = await response.json();
console.log('Quality Score:', evaluation.quality_score);
console.log('Confidence:', evaluation.confidence);
console.log('Reasoning:', evaluation.reasoning);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_company_quality',
    json={
        'company_name': 'TechCorp UAE',
        'domain': 'techcorp.ae',
        'industry': 'Technology',
        'uae_signals': {
            'has_ae_domain': True,
            'has_uae_address': True,
            'linkedin_location': 'Dubai, UAE'
        },
        'salary_indicators': {
            'salary_level': 'high',
            'avg_salary': 85000
        },
        'size': 250,
        'size_bucket': 'midsize',
        'license_type': 'Free Zone',
        'sector': 'Private'
    }
)

evaluation = response.json()
print(f"Quality Score: {evaluation['quality_score']}")
print(f"Confidence: {evaluation['confidence']}")
print(f"Reasoning: {evaluation['reasoning']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "quality_score": 0.85,
  "confidence": 0.92,
  "reasoning": "High-quality company based on Free Zone license, UAE presence, competitive salaries, and midsize scale indicating stability.",
  "factors": {
    "uae_presence": 0.95,
    "salary_competitiveness": 0.88,
    "company_size": 0.75,
    "sector_quality": 0.82
  }
}
```

**Quality Score Interpretation:**
- `0.9 - 1.0`: Excellent quality, high priority
- `0.75 - 0.89`: Good quality, medium-high priority
- `0.6 - 0.74`: Fair quality, medium priority
- `0.0 - 0.59`: Poor quality, low priority

---

### 4. Contact Management Module

Evaluate contact tier and importance using AI.

#### Evaluate Contact Tier

Determine contact tier (T1-T4) based on job title, seniority, and organizational position.

**Endpoint:** `POST /api/agent-core/v1/tools/evaluate_contact_tier`

**Tier Definitions:**
- **T1**: C-level executives, VPs (highest priority)
- **T2**: Directors, Senior Managers
- **T3**: Managers, Team Leads
- **T4**: Individual contributors, Specialists

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| contact_name | string | Yes | Contact full name |
| title | string | Yes | Job title |
| department | string | No | Department (e.g., "HR", "Engineering") |
| seniority | string | No | junior, mid, senior, executive, c-level |
| company_size | integer | No | Number of employees |

**Example (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_contact_tier \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "contact_name": "Jane Smith",
    "title": "Chief People Officer",
    "department": "Human Resources",
    "seniority": "c-level",
    "company_size": 500
  }'
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_contact_tier',
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_name: 'Jane Smith',
      title: 'Chief People Officer',
      department: 'Human Resources',
      seniority: 'c-level',
      company_size: 500
    })
  }
);

const evaluation = await response.json();
console.log('Tier:', evaluation.tier);
console.log('Confidence:', evaluation.confidence);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_contact_tier',
    json={
        'contact_name': 'Jane Smith',
        'title': 'Chief People Officer',
        'department': 'Human Resources',
        'seniority': 'c-level',
        'company_size': 500
    }
)

evaluation = response.json()
print(f"Tier: {evaluation['tier']}")
print(f"Confidence: {evaluation['confidence']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "tier": "T1",
  "confidence": 0.95,
  "reasoning": "C-level executive (CPO) with strategic HR oversight in mid-sized company. High decision-making authority."
}
```

---

### 5. Outreach Generation Module

Generate personalized, AI-powered outreach messages.

#### Generate Personalized Outreach

Create customized email content based on lead intelligence and company data.

**Endpoint:** `POST /api/outreach/generate`

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| lead_id | string (UUID) | Yes | Lead identifier |
| template_id | string (UUID) | No | Template to use |
| voice_style | string | No | professional, friendly, consultative, direct |
| length | string | No | short, medium, long (default: medium) |

**Example (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/outreach/generate \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "550e8400-e29b-41d4-a716-446655440000",
    "voice_style": "consultative",
    "length": "medium"
  }'
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/outreach/generate',
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: '550e8400-e29b-41d4-a716-446655440000',
      voice_style: 'consultative',
      length: 'medium'
    })
  }
);

const outreach = await response.json();
console.log('Subject:', outreach.subject);
console.log('Body:', outreach.body);
console.log('Personalization Score:', outreach.personalization_score);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/outreach/generate',
    json={
        'lead_id': '550e8400-e29b-41d4-a716-446655440000',
        'voice_style': 'consultative',
        'length': 'medium'
    }
)

outreach = response.json()
print(f"Subject: {outreach['subject']}")
print(f"Body: {outreach['body']}")
print(f"Personalization Score: {outreach['personalization_score']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "subject": "Transforming HR at TechCorp UAE",
  "body": "Hi Jane,\n\nI noticed TechCorp's recent expansion in Dubai's Free Zone and wanted to reach out...\n\n[AI-generated personalized content]\n\nBest regards,\nYour Name",
  "personalization_score": 0.87,
  "quality_score": 0.92
}
```

**Voice Style Guide:**
- **professional**: Formal, business-oriented tone
- **friendly**: Warm, approachable tone
- **consultative**: Expert advisor tone, problem-solving focused
- **direct**: Concise, straight-to-the-point

---

### 6. Lead Scoring Module

Calculate comprehensive lead scores using AI.

#### Calculate Lead Score

Evaluate lead quality based on fit, engagement, intent, and recency.

**Endpoint:** `POST /api/leads/score`

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| lead_id | string (UUID) | Yes | Lead identifier |

**Example (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/score \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/leads/score',
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: '550e8400-e29b-41d4-a716-446655440000'
    })
  }
);

const score = await response.json();
console.log('Total Score:', score.total_score);
console.log('Breakdown:', score.breakdown);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/leads/score',
    json={
        'lead_id': '550e8400-e29b-41d4-a716-446655440000'
    }
)

score = response.json()
print(f"Total Score: {score['total_score']}")
print(f"Breakdown: {score['breakdown']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "total_score": 87.5,
  "fit_score": 92.0,
  "engagement_score": 78.0,
  "intent_score": 85.0,
  "recency_score": 95.0,
  "breakdown": {
    "company_quality": 0.88,
    "contact_tier": "T1",
    "industry_match": true,
    "size_match": true,
    "hiring_signals": true,
    "recent_activity": true
  }
}
```

**Score Components:**

1. **Fit Score** (30% weight): Company quality, size, industry alignment
2. **Engagement Score** (25% weight): Interaction history, response rates
3. **Intent Score** (30% weight): Hiring signals, expansion indicators
4. **Recency Score** (15% weight): Data freshness, recent activity

**Score Interpretation:**
- `90-100`: Hot lead - immediate follow-up
- `75-89`: Warm lead - high priority
- `60-74`: Qualified lead - standard priority
- `0-59`: Cold lead - nurture or disqualify

---

### 7. Multi-Agent System (Agent Hub)

Execute collaborative multi-agent workflows for complex decisions.

#### Execute Multi-Agent Workflow

Run a workflow involving discovery, validation, and critic agents with consensus mechanism.

**Endpoint:** `POST /api/agent-hub/workflow/execute`

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| workflow_type | string | Yes | Workflow identifier (e.g., "lead_evaluation") |
| input_data | object | Yes | Input data for the workflow |
| agents | array | No | Agents to participate (default: all) |
| consensus_threshold | number | No | Minimum consensus (0-1, default: 0.7) |

**Example (cURL):**

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/workflow/execute \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "lead_evaluation",
    "input_data": {
      "company_name": "TechCorp UAE",
      "domain": "techcorp.ae",
      "contact_title": "VP of Engineering"
    },
    "agents": ["discovery", "validation", "critic"],
    "consensus_threshold": 0.8
  }'
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/workflow/execute',
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_type: 'lead_evaluation',
      input_data: {
        company_name: 'TechCorp UAE',
        domain: 'techcorp.ae',
        contact_title: 'VP of Engineering'
      },
      agents: ['discovery', 'validation', 'critic'],
      consensus_threshold: 0.8
    })
  }
);

const workflow = await response.json();
console.log('Workflow ID:', workflow.workflow_id);
console.log('Consensus:', workflow.consensus);
```

**Python:**

```python
response = session.post(
    'https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/workflow/execute',
    json={
        'workflow_type': 'lead_evaluation',
        'input_data': {
            'company_name': 'TechCorp UAE',
            'domain': 'techcorp.ae',
            'contact_title': 'VP of Engineering'
        },
        'agents': ['discovery', 'validation', 'critic'],
        'consensus_threshold': 0.8
    }
)

workflow = response.json()
print(f"Workflow ID: {workflow['workflow_id']}")
print(f"Consensus: {workflow['consensus']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "workflow_id": "650e8400-e29b-41d4-a716-446655440000",
  "result": {
    "decision": "approve",
    "confidence": 0.92,
    "reasoning": "High-quality lead with strong technical leadership and UAE presence"
  },
  "consensus": {
    "reached": true,
    "level": 0.92,
    "dissenting_agents": []
  },
  "agents_participated": ["discovery", "validation", "critic"]
}
```

**Agent Roles:**
- **Discovery Agent**: Identifies patterns and opportunities
- **Validation Agent**: Verifies data accuracy and completeness
- **Critic Agent**: Evaluates quality and identifies risks

---

### 8. Analytics Module

Access system metrics and performance data.

#### Get Dashboard Statistics

Retrieve key metrics for a specified time range.

**Endpoint:** `GET /api/stats/dashboard?time_range=7d`

**Query Parameters:**

| Parameter | Type | Options | Default |
|-----------|------|---------|---------|
| time_range | string | 24h, 7d, 30d, 90d | 7d |

**Example (cURL):**

```bash
curl "https://upr-web-service-191599223867.us-central1.run.app/api/stats/dashboard?time_range=30d" \
  -b cookies.txt
```

**JavaScript:**

```javascript
const timeRange = '30d';

const response = await fetch(
  `https://upr-web-service-191599223867.us-central1.run.app/api/stats/dashboard?time_range=${timeRange}`,
  { credentials: 'include' }
);

const stats = await response.json();
console.log('Total Leads:', stats.total_leads);
console.log('Avg Lead Score:', stats.avg_lead_score);
console.log('Conversion Rate:', stats.conversion_rate);
```

**Python:**

```python
time_range = '30d'

response = session.get(
    f'https://upr-web-service-191599223867.us-central1.run.app/api/stats/dashboard?time_range={time_range}'
)

stats = response.json()
print(f"Total Leads: {stats['total_leads']}")
print(f"Avg Lead Score: {stats['avg_lead_score']}")
print(f"Conversion Rate: {stats['conversion_rate']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "total_leads": 1250,
  "enriched_leads": 1180,
  "avg_lead_score": 73.5,
  "conversion_rate": 0.24
}
```

---

### 9. Monitoring Module

Monitor system health and readiness.

#### System Health Check

Get comprehensive system health metrics.

**Endpoint:** `GET /api/monitoring/system-health`

**Example (cURL):**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/system-health \
  -b cookies.txt
```

**JavaScript:**

```javascript
const response = await fetch(
  'https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/system-health',
  { credentials: 'include' }
);

const health = await response.json();
console.log('Health Score:', health.health_score);
console.log('Database:', health.database);
console.log('Services:', health.services);
```

**Python:**

```python
response = session.get(
    'https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/system-health'
)

health = response.json()
print(f"Health Score: {health['health_score']}")
print(f"Database: {health['database']}")
print(f"Services: {health['services']}")
```

**Response (200 OK):**

```json
{
  "ok": true,
  "health_score": 0.95,
  "agents": {
    "discovery": "healthy",
    "validation": "healthy",
    "critic": "healthy"
  },
  "database": {
    "status": "connected",
    "response_time_ms": 12.5
  },
  "services": {
    "openai": "operational",
    "serpapi": "operational"
  }
}
```

#### Readiness Check

Check if the service is ready to handle requests (includes database connectivity).

**Endpoint:** `GET /ready`

**Example:**

```bash
curl https://upr-web-service-191599223867.us-central1.run.app/ready
```

**Response (200 OK):**

```json
{
  "status": "ready",
  "database": "connected"
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "not ready",
  "database": "disconnected"
}
```

---

## Common Workflows

### Workflow 1: Complete Lead Enrichment Pipeline

This workflow demonstrates the full lead enrichment process from start to finish.

```python
import requests
import time

# Step 1: Authenticate
session = requests.Session()
base_url = 'https://upr-web-service-191599223867.us-central1.run.app'

login_response = session.post(
    f'{base_url}/api/auth/login',
    json={'username': 'admin', 'password': 'your-password'}
)

print(f"✓ Logged in as: {login_response.json()['user']['username']}")

# Step 2: Start enrichment job
leads = [
    {
        'company_name': 'Microsoft',
        'domain': 'microsoft.com',
        'contact_name': 'Satya Nadella'
    },
    {
        'company_name': 'TechCorp UAE',
        'domain': 'techcorp.ae'
    }
]

enrich_response = session.post(
    f'{base_url}/api/enrichment/start',
    json={'leads': leads, 'max_contacts': 5}
)

job_id = enrich_response.json()['job_id']
print(f"✓ Enrichment job started: {job_id}")

# Step 3: Poll for completion
while True:
    status_response = session.get(
        f'{base_url}/api/enrichment/status/{job_id}'
    )
    status = status_response.json()

    print(f"  Progress: {status['progress']}% ({status['completed']}/{status['total']})")

    if status['status'] == 'completed':
        print("✓ Enrichment completed!")
        break
    elif status['status'] == 'failed':
        print("✗ Enrichment failed!")
        break

    time.sleep(5)  # Wait 5 seconds before next check

# Step 4: Score the enriched leads (assuming we have lead IDs)
# In a real scenario, you would retrieve the lead IDs from the enrichment results

print("\n--- Workflow Complete ---")
```

### Workflow 2: Company & Contact Evaluation

Evaluate a company and its key contacts in a single workflow.

```javascript
// Step 1: Authenticate
const baseUrl = 'https://upr-web-service-191599223867.us-central1.run.app';

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    username: 'admin',
    password: 'your-password'
  })
});

console.log('✓ Authenticated');

// Step 2: Evaluate company quality
const companyEval = await fetch(
  `${baseUrl}/api/agent-core/v1/tools/evaluate_company_quality`,
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'TechCorp UAE',
      domain: 'techcorp.ae',
      industry: 'Technology',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true,
        linkedin_location: 'Dubai, UAE'
      },
      size: 250,
      size_bucket: 'midsize',
      license_type: 'Free Zone',
      sector: 'Private'
    })
  }
);

const companyResult = await companyEval.json();
console.log(`✓ Company Quality Score: ${companyResult.quality_score}`);

// Step 3: Evaluate key contacts
const contacts = [
  { name: 'Jane Smith', title: 'Chief People Officer', seniority: 'c-level' },
  { name: 'John Doe', title: 'VP of Engineering', seniority: 'executive' },
  { name: 'Sarah Lee', title: 'HR Manager', seniority: 'senior' }
];

console.log('\n✓ Contact Tiers:');

for (const contact of contacts) {
  const tierEval = await fetch(
    `${baseUrl}/api/agent-core/v1/tools/evaluate_contact_tier`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_name: contact.name,
        title: contact.title,
        seniority: contact.seniority,
        company_size: 250
      })
    }
  );

  const tierResult = await tierEval.json();
  console.log(`  ${contact.name}: ${tierResult.tier} (${tierResult.confidence} confidence)`);
}

console.log('\n--- Evaluation Complete ---');
```

### Workflow 3: Automated Outreach Campaign

Generate and send personalized outreach at scale.

```python
import requests

session = requests.Session()
base_url = 'https://upr-web-service-191599223867.us-central1.run.app'

# Authenticate
session.post(f'{base_url}/api/auth/login',
            json={'username': 'admin', 'password': 'your-password'})

# List of lead IDs (from previous enrichment)
lead_ids = [
    '550e8400-e29b-41d4-a716-446655440000',
    '650e8400-e29b-41d4-a716-446655440001',
    '750e8400-e29b-41d4-a716-446655440002'
]

outreach_results = []

for lead_id in lead_ids:
    # Step 1: Calculate lead score
    score_response = session.post(
        f'{base_url}/api/leads/score',
        json={'lead_id': lead_id}
    )
    score = score_response.json()

    # Step 2: Only generate outreach for high-scoring leads
    if score['total_score'] >= 75:
        outreach_response = session.post(
            f'{base_url}/api/outreach/generate',
            json={
                'lead_id': lead_id,
                'voice_style': 'consultative',
                'length': 'medium'
            }
        )

        outreach = outreach_response.json()

        outreach_results.append({
            'lead_id': lead_id,
            'score': score['total_score'],
            'subject': outreach['subject'],
            'body': outreach['body'],
            'personalization_score': outreach['personalization_score']
        })

        print(f"✓ Generated outreach for lead {lead_id} (Score: {score['total_score']})")
    else:
        print(f"⊘ Skipped lead {lead_id} (Score too low: {score['total_score']})")

print(f"\n--- Generated {len(outreach_results)} personalized outreach messages ---")

# Display results
for result in outreach_results:
    print(f"\nLead: {result['lead_id']}")
    print(f"Score: {result['score']}")
    print(f"Subject: {result['subject']}")
    print(f"Personalization: {result['personalization_score']}")
    print("-" * 80)
```

### Workflow 4: Multi-Agent Lead Qualification

Use the multi-agent system for comprehensive lead evaluation.

```bash
#!/bin/bash

BASE_URL="https://upr-web-service-191599223867.us-central1.run.app"

# Authenticate and save cookies
curl -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' \
  -c cookies.txt

echo "✓ Authenticated"

# Execute multi-agent workflow
WORKFLOW_RESPONSE=$(curl -X POST "$BASE_URL/api/agent-hub/workflow/execute" \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "lead_evaluation",
    "input_data": {
      "company_name": "TechCorp UAE",
      "domain": "techcorp.ae",
      "contact_name": "Jane Smith",
      "contact_title": "Chief People Officer",
      "industry": "Technology",
      "size": 250
    },
    "agents": ["discovery", "validation", "critic"],
    "consensus_threshold": 0.8
  }')

echo "✓ Multi-agent workflow executed"
echo "$WORKFLOW_RESPONSE" | jq '.'

# Extract decision
DECISION=$(echo "$WORKFLOW_RESPONSE" | jq -r '.result.decision')
CONFIDENCE=$(echo "$WORKFLOW_RESPONSE" | jq -r '.result.confidence')

echo ""
echo "Decision: $DECISION"
echo "Confidence: $CONFIDENCE"

# Clean up
rm cookies.txt
```

### Workflow 5: Real-time System Monitoring

Monitor system health and performance metrics.

```javascript
// Real-time monitoring dashboard

const baseUrl = 'https://upr-web-service-191599223867.us-central1.run.app';

// Authenticate
await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    username: 'admin',
    password: 'your-password'
  })
});

// Monitoring loop
async function monitorSystem() {
  while (true) {
    // Check basic health
    const healthResponse = await fetch(`${baseUrl}/health`);
    const health = await healthResponse.json();

    // Check detailed system health
    const systemHealthResponse = await fetch(
      `${baseUrl}/api/monitoring/system-health`,
      { credentials: 'include' }
    );
    const systemHealth = await systemHealthResponse.json();

    // Get dashboard stats
    const statsResponse = await fetch(
      `${baseUrl}/api/stats/dashboard?time_range=24h`,
      { credentials: 'include' }
    );
    const stats = await statsResponse.json();

    // Display metrics
    console.clear();
    console.log('=== UPR System Monitor ===');
    console.log(`Status: ${health.status}`);
    console.log(`Uptime: ${Math.floor(health.uptime / 60)} minutes`);
    console.log(`Health Score: ${(systemHealth.health_score * 100).toFixed(1)}%`);
    console.log('');
    console.log('--- 24h Statistics ---');
    console.log(`Total Leads: ${stats.total_leads}`);
    console.log(`Enriched: ${stats.enriched_leads}`);
    console.log(`Avg Score: ${stats.avg_lead_score.toFixed(1)}`);
    console.log(`Conversion Rate: ${(stats.conversion_rate * 100).toFixed(1)}%`);
    console.log('');
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);

    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// Start monitoring
monitorSystem();
```

---

## Troubleshooting & FAQ

### Common Issues

#### 1. Authentication Errors

**Problem:** Receiving `401 Unauthorized` errors

**Solution:**

```bash
# Verify your credentials are correct
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Ensure cookies are being sent with requests
curl https://upr-web-service-191599223867.us-central1.run.app/api/auth/verify \
  -b cookies.txt \
  -v  # Verbose mode shows headers
```

**Common causes:**
- Incorrect username or password
- Expired JWT token (tokens expire after 24 hours)
- Missing `credentials: 'include'` in fetch requests
- Cookies not being saved/sent properly

**Fix:**

```javascript
// Always include credentials for authenticated requests
fetch(url, {
  credentials: 'include',  // This is crucial!
  // ... other options
});
```

#### 2. Rate Limit Exceeded

**Problem:** Receiving `429 Too Many Requests`

**Response:**

```json
{
  "ok": false,
  "error": "Rate limit exceeded. Try again in 60 seconds."
}
```

**Solution:**

Implement exponential backoff:

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
      console.log(`Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

**Rate Limit Tips:**
- Batch requests when possible
- Cache results to reduce API calls
- Use webhooks instead of polling when available
- Implement request queuing for high-volume operations

#### 3. Enrichment Job Stuck

**Problem:** Enrichment job shows `in_progress` but never completes

**Diagnosis:**

```bash
# Check job status
curl https://upr-web-service-191599223867.us-central1.run.app/api/enrichment/status/{job_id} \
  -b cookies.txt

# Check system health
curl https://upr-web-service-191599223867.us-central1.run.app/api/monitoring/system-health \
  -b cookies.txt
```

**Possible causes:**
- External API (Apollo, Hunter) is down
- Database connection issues
- Job timeout (jobs timeout after 10 minutes)

**Solution:**

```python
# Implement timeout and restart logic
import time

def wait_for_job(session, job_id, timeout=600):  # 10 minute timeout
    start_time = time.time()

    while time.time() - start_time < timeout:
        response = session.get(f'{base_url}/api/enrichment/status/{job_id}')
        status = response.json()

        if status['status'] in ['completed', 'failed']:
            return status

        time.sleep(5)

    raise TimeoutError(f"Job {job_id} did not complete within {timeout} seconds")
```

#### 4. CORS Errors (Browser-based apps)

**Problem:** Browser console shows CORS errors

**Error:**

```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

**Solution:**

The UPR API supports CORS for web applications. Ensure:

1. You're including credentials:

```javascript
fetch(url, {
  credentials: 'include',  // Required for cookies
  // ...
});
```

2. Your origin is whitelisted (contact admin if needed)

3. For development, use a proxy:

```javascript
// package.json (for Create React App)
{
  "proxy": "https://upr-web-service-191599223867.us-central1.run.app"
}

// Then use relative URLs
fetch('/api/auth/login', {
  method: 'POST',
  // ...
});
```

#### 5. Low Lead Scores

**Problem:** All leads receiving low scores (< 60)

**Diagnosis:**

```bash
# Check a specific lead's score breakdown
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/leads/score \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"your-lead-id"}' \
  | jq '.breakdown'
```

**Common causes:**
- Incomplete enrichment data
- Low company quality scores
- Missing UAE signals for UAE-focused campaigns
- Old/stale data (low recency score)

**Solution:**

```python
# Enrich leads with maximum data
response = session.post(
    f'{base_url}/api/enrichment/start',
    json={
        'leads': leads,
        'max_contacts': 10  # Get more contact data
    }
)

# Evaluate company quality explicitly
company_eval = session.post(
    f'{base_url}/api/agent-core/v1/tools/evaluate_company_quality',
    json={
        'company_name': 'Company Name',
        'domain': 'company.com',
        # Include as much data as possible
        'uae_signals': {...},
        'salary_indicators': {...},
        'size': 250,
        # ...
    }
)
```

---

### Frequently Asked Questions

#### Q: How long does lead enrichment take?

**A:** Enrichment time depends on several factors:

- **Single lead**: 5-15 seconds
- **Batch (10 leads)**: 30-60 seconds
- **Large batch (100 leads)**: 3-5 minutes

The system processes leads asynchronously and uses caching to speed up subsequent requests.

#### Q: What data sources does UPR use?

**A:** UPR integrates with:

1. **Apollo.io** - Company and contact data
2. **Hunter.io** - Email finding and verification
3. **NeverBounce** - Email deliverability (optional, 97% reduced usage)
4. **LinkedIn** - Profile and company data
5. **SerpAPI** - Web search for company intelligence
6. **OpenAI GPT-4** - Email pattern discovery and content generation
7. **Proprietary Database** - Cached email patterns (100+ verified)

#### Q: How accurate is the email discovery?

**A:** Current performance metrics:

- **Overall success rate**: 67% (from test data)
- **Email generation rate**: 49%
- **LLM confidence threshold**: 90%
- **Cache hit rate**: ~30% (growing with usage)

Test results by company:
- Microsoft: 100% success (32/32 leads)
- SEHA: 100% success (57/57 leads)
- Chanel: 100% success (10/10 leads)
- Kent PLC: 100% success (35/35 leads)

#### Q: Are there any costs per API request?

**A:** UPR's LLM-powered email discovery reduces costs by 97-99% compared to traditional email verification services. The system uses:

- **Cached patterns**: Free (no external API calls)
- **LLM discovery**: ~$0.002 per lead
- **Traditional verification**: ~$0.10 per lead (only when necessary)

#### Q: Can I use UPR without authentication?

**A:** No. All API endpoints except `/health` and `/ready` require authentication. This ensures:

- Data security and privacy
- Rate limiting per user
- Audit trail for compliance
- Multi-tenant isolation

#### Q: What's the difference between contact tiers?

**A:**

| Tier | Description | Examples |
|------|-------------|----------|
| T1 | C-level, VPs | CEO, CFO, VP Engineering |
| T2 | Directors, Senior Managers | Director of HR, Senior Sales Manager |
| T3 | Managers, Team Leads | HR Manager, Engineering Lead |
| T4 | Individual Contributors | HR Specialist, Software Engineer |

**Priority:** T1 > T2 > T3 > T4

#### Q: How do I handle large batches of leads?

**A:** Best practices for large batches:

```python
import requests
import time

def enrich_large_batch(leads, batch_size=20):
    """Enrich leads in batches to avoid rate limits and timeouts"""
    session = requests.Session()
    base_url = 'https://upr-web-service-191599223867.us-central1.run.app'

    # Authenticate
    session.post(f'{base_url}/api/auth/login',
                json={'username': 'admin', 'password': 'password'})

    results = []

    # Process in batches
    for i in range(0, len(leads), batch_size):
        batch = leads[i:i + batch_size]

        # Start enrichment
        response = session.post(
            f'{base_url}/api/enrichment/start',
            json={'leads': batch, 'max_contacts': 3}
        )
        job_id = response.json()['job_id']

        # Wait for completion
        while True:
            status_response = session.get(
                f'{base_url}/api/enrichment/status/{job_id}'
            )
            status = status_response.json()

            if status['status'] == 'completed':
                results.append(status)
                break
            elif status['status'] == 'failed':
                print(f"Batch {i//batch_size + 1} failed")
                break

            time.sleep(5)

        # Brief pause between batches to respect rate limits
        time.sleep(2)

    return results

# Usage
leads = [...]  # Your lead list
results = enrich_large_batch(leads, batch_size=20)
```

#### Q: What happens if an external API (Apollo, Hunter) is down?

**A:** UPR implements graceful degradation:

1. **Email discovery**: Falls back to LLM-based pattern discovery
2. **Company data**: Uses cached data if available
3. **Verification**: Skips verification for high-confidence emails (90%+)
4. **Quality scores**: Uses available data, indicates confidence level

The system continues to function even if external services are unavailable.

#### Q: How do I integrate UPR with my CRM?

**A:** Example integration with Salesforce:

```python
import requests
from simple_salesforce import Salesforce

# Connect to Salesforce
sf = Salesforce(username='...', password='...', security_token='...')

# Connect to UPR
upr_session = requests.Session()
upr_base = 'https://upr-web-service-191599223867.us-central1.run.app'

upr_session.post(f'{upr_base}/api/auth/login',
                json={'username': 'admin', 'password': 'password'})

# Get leads from Salesforce
sf_leads = sf.query("SELECT Name, Company, Website FROM Lead WHERE Status = 'New'")

# Prepare for UPR enrichment
upr_leads = [
    {
        'company_name': lead['Company'],
        'domain': lead['Website'],
        'contact_name': lead['Name']
    }
    for lead in sf_leads['records']
]

# Enrich with UPR
response = upr_session.post(
    f'{upr_base}/api/enrichment/start',
    json={'leads': upr_leads, 'max_contacts': 3}
)

job_id = response.json()['job_id']

# Wait for completion and update Salesforce
# ... (polling logic)

# Update Salesforce with enriched data
for lead_id, enriched_data in results.items():
    sf.Lead.update(lead_id, {
        'Email': enriched_data['email'],
        'Phone': enriched_data['phone'],
        'Title': enriched_data['title'],
        'Lead_Score__c': enriched_data['score']
    })
```

#### Q: Can I customize the outreach voice/style?

**A:** Yes! UPR supports four voice styles:

```python
# Professional (formal, business-oriented)
response = session.post(f'{base_url}/api/outreach/generate',
    json={
        'lead_id': lead_id,
        'voice_style': 'professional',
        'length': 'medium'
    }
)

# Friendly (warm, approachable)
response = session.post(f'{base_url}/api/outreach/generate',
    json={
        'lead_id': lead_id,
        'voice_style': 'friendly',
        'length': 'short'
    }
)

# Consultative (expert advisor, problem-solving)
response = session.post(f'{base_url}/api/outreach/generate',
    json={
        'lead_id': lead_id,
        'voice_style': 'consultative',
        'length': 'long'
    }
)

# Direct (concise, straight-to-the-point)
response = session.post(f'{base_url}/api/outreach/generate',
    json={
        'lead_id': lead_id,
        'voice_style': 'direct',
        'length': 'short'
    }
)
```

You can also create custom templates for consistent branding.

---

## API Reference

### Base URL

```
Production: https://upr-web-service-191599223867.us-central1.run.app
Local Dev: http://localhost:8080
```

### Authentication

All authenticated endpoints require one of:

1. **Cookie-based**: `upr_jwt` cookie (set via `/api/auth/login`)
2. **Bearer token**: `Authorization: Bearer <token>` header

### Response Format

All API responses follow this format:

**Success:**

```json
{
  "ok": true,
  "data": { ... },
  // ... endpoint-specific fields
}
```

**Error:**

```json
{
  "ok": false,
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 202 | Accepted | Request accepted for async processing |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required or failed |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Endpoint Categories

#### Authentication
- `POST /api/auth/login` - Login and create session
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/auth/verify` - Verify current session
- `GET /api/auth/me` - Get current user info

#### Lead Enrichment
- `POST /api/enrichment/start` - Start enrichment job
- `GET /api/enrichment/status/{job_id}` - Get job status

#### Company Intelligence (Agent Core)
- `POST /api/agent-core/v1/tools/evaluate_company_quality` - Evaluate company
- `POST /api/agent-core/v1/tools/evaluate_contact_tier` - Evaluate contact

#### Agent Hub
- `POST /api/agent-hub/workflow/execute` - Execute multi-agent workflow

#### Outreach
- `POST /api/outreach/generate` - Generate personalized outreach

#### Lead Scoring
- `POST /api/leads/score` - Calculate lead score

#### Analytics
- `GET /api/stats/dashboard` - Get dashboard statistics

#### Monitoring
- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes DB)
- `GET /api/monitoring/system-health` - Comprehensive health metrics

### Complete API Documentation

For detailed request/response schemas, see the complete OpenAPI specification:

**File:** `/docs/openapi-complete.yaml`

**Online (if available):** https://upr-web-service-191599223867.us-central1.run.app/api-docs

---

## Best Practices

### 1. Error Handling

Always implement proper error handling:

```javascript
async function safeApiCall(url, options) {
  try {
    const response = await fetch(url, options);

    // Check HTTP status
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    // Check application-level status
    if (!result.ok) {
      throw new Error(result.error || 'Request failed');
    }

    return result;
  } catch (error) {
    console.error('API call failed:', error.message);

    // Implement retry logic for transient errors
    if (error.message.includes('429') || error.message.includes('503')) {
      console.log('Retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return safeApiCall(url, options); // Retry once
    }

    throw error; // Re-throw for caller to handle
  }
}
```

### 2. Rate Limit Management

```python
import time
from datetime import datetime, timedelta

class RateLimiter:
    def __init__(self, requests_per_minute=10):
        self.requests_per_minute = requests_per_minute
        self.requests = []

    def wait_if_needed(self):
        now = datetime.now()

        # Remove requests older than 1 minute
        self.requests = [
            req_time for req_time in self.requests
            if now - req_time < timedelta(minutes=1)
        ]

        # Check if we've hit the limit
        if len(self.requests) >= self.requests_per_minute:
            oldest = min(self.requests)
            wait_time = (oldest + timedelta(minutes=1) - now).total_seconds()

            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.1f}s...")
                time.sleep(wait_time)
                self.requests = []

        self.requests.append(now)

# Usage
limiter = RateLimiter(requests_per_minute=10)

for lead in leads:
    limiter.wait_if_needed()
    # Make API call
    session.post(...)
```

### 3. Caching Responses

```javascript
class ApiCache {
  constructor(ttlMinutes = 10) {
    this.cache = new Map();
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) return null;

    // Check if expired
    if (Date.now() - item.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
}

// Usage
const cache = new ApiCache(10); // 10 minute TTL

async function getCachedCompanyQuality(companyData) {
  const cacheKey = `company:${companyData.domain}`;

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('Cache hit!');
    return cached;
  }

  // Fetch from API
  const response = await fetch(
    'https://upr-web-service-191599223867.us-central1.run.app/api/agent-core/v1/tools/evaluate_company_quality',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData)
    }
  );

  const result = await response.json();

  // Cache the result
  cache.set(cacheKey, result);

  return result;
}
```

### 4. Batch Processing

```python
def process_in_batches(items, batch_size, process_func):
    """Generic batch processing with progress tracking"""
    results = []
    total_batches = (len(items) + batch_size - 1) // batch_size

    for i in range(0, len(items), batch_size):
        batch_num = i // batch_size + 1
        batch = items[i:i + batch_size]

        print(f"Processing batch {batch_num}/{total_batches}...")

        try:
            batch_results = process_func(batch)
            results.extend(batch_results)

            print(f"✓ Batch {batch_num} completed ({len(batch_results)} items)")
        except Exception as e:
            print(f"✗ Batch {batch_num} failed: {e}")
            # Continue with next batch

        # Rate limit pause
        if i + batch_size < len(items):
            time.sleep(1)

    return results

# Usage
def enrich_batch(leads):
    response = session.post(
        f'{base_url}/api/enrichment/start',
        json={'leads': leads, 'max_contacts': 3}
    )
    job_id = response.json()['job_id']

    # Wait for completion
    while True:
        status = session.get(f'{base_url}/api/enrichment/status/{job_id}').json()
        if status['status'] in ['completed', 'failed']:
            return status
        time.sleep(5)

results = process_in_batches(all_leads, batch_size=20, process_func=enrich_batch)
```

### 5. Logging and Monitoring

```python
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('upr_api.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('UPR_Client')

class UPRClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.session = requests.Session()
        self.username = username
        self._authenticate(password)

    def _authenticate(self, password):
        logger.info(f"Authenticating as {self.username}")

        response = self.session.post(
            f'{self.base_url}/api/auth/login',
            json={'username': self.username, 'password': password}
        )

        if response.ok:
            logger.info("Authentication successful")
        else:
            logger.error(f"Authentication failed: {response.status_code}")
            raise Exception("Authentication failed")

    def enrich_leads(self, leads):
        logger.info(f"Starting enrichment for {len(leads)} leads")

        response = self.session.post(
            f'{self.base_url}/api/enrichment/start',
            json={'leads': leads, 'max_contacts': 3}
        )

        if not response.ok:
            logger.error(f"Enrichment failed: {response.status_code}")
            return None

        job_id = response.json()['job_id']
        logger.info(f"Enrichment job started: {job_id}")

        return job_id

# Usage
client = UPRClient(
    'https://upr-web-service-191599223867.us-central1.run.app',
    'admin',
    'password'
)

job_id = client.enrich_leads(leads)
```

### 6. Security Best Practices

**Never hardcode credentials:**

```python
import os
from dotenv import load_dotenv

# Load from environment variables
load_dotenv()

username = os.getenv('UPR_USERNAME')
password = os.getenv('UPR_PASSWORD')

if not username or not password:
    raise ValueError("UPR credentials not found in environment")
```

**.env file:**

```bash
UPR_USERNAME=admin
UPR_PASSWORD=your-secure-password
UPR_BASE_URL=https://upr-web-service-191599223867.us-central1.run.app
```

**Add .env to .gitignore:**

```
.env
.env.local
.env.*.local
```

### 7. Testing

```python
import unittest

class TestUPRAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Set up test client"""
        cls.client = UPRClient(
            os.getenv('UPR_BASE_URL'),
            os.getenv('UPR_USERNAME'),
            os.getenv('UPR_PASSWORD')
        )

    def test_health_check(self):
        """Test basic health check"""
        response = requests.get(f'{os.getenv("UPR_BASE_URL")}/health')
        self.assertEqual(response.status_code, 200)

        health = response.json()
        self.assertEqual(health['status'], 'ok')

    def test_authentication(self):
        """Test authentication flow"""
        response = self.client.session.get(
            f'{self.client.base_url}/api/auth/verify'
        )
        self.assertEqual(response.status_code, 200)

        result = response.json()
        self.assertTrue(result['authenticated'])

    def test_lead_enrichment(self):
        """Test lead enrichment"""
        test_lead = {
            'company_name': 'Test Company',
            'domain': 'test.com'
        }

        job_id = self.client.enrich_leads([test_lead])
        self.assertIsNotNone(job_id)
        self.assertTrue(len(job_id) > 0)

if __name__ == '__main__':
    unittest.main()
```

---

## Support and Resources

### Getting Help

- **Email Support**: support@upr.ai
- **Documentation**: `/docs/openapi-complete.yaml`
- **System Status**: `GET /health` and `GET /ready` endpoints

### Additional Documentation

- **SIVA Framework**: `/docs/siva-phases/` - Multi-agent system architecture
- **Email Discovery**: `/docs/EMAIL_DISCOVERY_LOGIC.md` - LLM-powered email finding
- **Deployment Guide**: `/docs/SPRINT_HANDOFF.md` - Production deployment instructions
- **API Rate Limits**: `/docs/API_RATE_LIMITS.md` - Detailed rate limit documentation

### Quick Reference Card

```
╔════════════════════════════════════════════════════════════════╗
║                  UPR Quick Reference                           ║
╠════════════════════════════════════════════════════════════════╣
║ Base URL: https://upr-web-service-191599223867.us-central1... ║
║                                                                ║
║ AUTHENTICATION                                                 ║
║ POST /api/auth/login        Login                             ║
║ GET  /api/auth/verify       Verify session                    ║
║                                                                ║
║ ENRICHMENT                                                     ║
║ POST /api/enrichment/start          Start job                 ║
║ GET  /api/enrichment/status/{id}    Check status              ║
║                                                                ║
║ INTELLIGENCE                                                   ║
║ POST /api/agent-core/.../evaluate_company_quality             ║
║ POST /api/agent-core/.../evaluate_contact_tier                ║
║                                                                ║
║ OUTREACH                                                       ║
║ POST /api/outreach/generate    Generate message               ║
║                                                                ║
║ SCORING                                                        ║
║ POST /api/leads/score          Calculate score                ║
║                                                                ║
║ MONITORING                                                     ║
║ GET  /health                   Basic health                   ║
║ GET  /ready                    Readiness check                ║
║ GET  /api/monitoring/system-health   Detailed health          ║
╚════════════════════════════════════════════════════════════════╝
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-19 | Initial comprehensive user guide |

---

**© 2025 UPR - Unified Persona & Relationship System**

*This guide is maintained alongside the UPR codebase. For the latest updates, see the project repository.*
