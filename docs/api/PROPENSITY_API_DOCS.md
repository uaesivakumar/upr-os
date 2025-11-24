# UPR Lead Propensity API Documentation

## Overview

The UPR Lead Propensity API enables external CRM systems (HubSpot, Zoho, Salesforce) to leverage UPR's ML-powered lead scoring and explainable AI capabilities.

**Key Features:**
- 🎯 **ML-Powered Scoring**: XGBoost model with 50+ engineered features
- 🔍 **Explainable AI**: SHAP values show WHY a lead got a specific score
- ⚡ **Batch Processing**: Score up to 100 leads in one request
- 🔐 **Secure Authentication**: API key-based authentication with scopes
- 📊 **Rich Insights**: Send time optimization, personalization tips
- 🚦 **Rate Limiting**: Configurable limits per minute and per day

---

## Authentication

All API requests require authentication via API key.

### Obtaining an API Key

```bash
node scripts/generateApiKey.js
```

This generates a unique API key with format: `sk_live_...` (production) or `sk_test_...` (testing)

### Using API Keys

Include your API key in requests via one of these methods:

**Method 1: Authorization Header (Recommended)**
```bash
curl -H "Authorization: Bearer sk_live_abc123..." \
     https://upr.sivakumar.ai/api/v1/propensity/score
```

**Method 2: x-api-key Header**
```bash
curl -H "x-api-key: sk_live_abc123..." \
     https://upr.sivakumar.ai/api/v1/propensity/score
```

### API Key Scopes

| Scope | Description |
|-------|-------------|
| `propensity:read` | Access to scoring endpoints |
| `propensity:write` | Create/update predictions |
| `features:read` | Access to feature store |
| `batch:score` | Batch scoring (up to 100 leads) |

---

## Endpoints

### 1. Score Single Lead

**`POST /api/v1/propensity/score`**

Score a single lead with full explainability and recommendations.

#### Request Body

```json
{
  "company": {
    "name": "Emirates NBD",
    "domain": "emiratesnbd.com",
    "industry": "banking",
    "size": "10000-50000",
    "location": "UAE"
  },
  "contact": {
    "name": "Ahmed Hassan",
    "email": "ahmed.hassan@emiratesnbd.com",
    "title": "Chief Digital Officer",
    "linkedin": "https://linkedin.com/in/ahmedhassan"
  },
  "context": {
    "campaign_type": "digital_transformation",
    "email_subject": "AI-Powered HR Analytics for Emirates NBD",
    "email_body": "Dear Ahmed, I noticed your recent digital transformation initiative...",
    "source": "linkedin_outreach"
  }
}
```

#### Field Descriptions

**Company Fields:**
- `name` (required): Company name
- `domain`: Company website domain
- `industry`: Industry (banking, technology, healthcare, etc.)
- `size`: Company size (1-10, 11-50, 51-200, 201-1000, 1001-5000, 5001-10000, 10000+)
- `location`: Geographic location

**Contact Fields:**
- `name`: Contact's full name
- `email` (required): Contact's email address
- `title`: Job title
- `linkedin`: LinkedIn profile URL

**Context Fields (Optional):**
- `campaign_type`: Type of campaign
- `email_subject`: Subject line to analyze
- `email_body`: Email body to analyze
- `source`: Lead source (linkedin, referral, etc.)

#### Response

```json
{
  "ok": true,
  "score": {
    "probability": 0.73,
    "confidence": 0.82,
    "grade": "A",
    "explanation": {
      "summary": "This lead scores high because Recent hiring activity is strong, plus 4 other positive signals.",
      "top_positive_factors": [
        {
          "feature": "hiring_signals_90d",
          "impact": 0.12,
          "value": 5,
          "readable": "Recent hiring activity"
        },
        {
          "feature": "funding_signals_90d",
          "impact": 0.08,
          "value": 2,
          "readable": "Recent funding activity"
        }
      ],
      "top_negative_factors": [
        {
          "feature": "days_since_last_contact",
          "impact": -0.05,
          "value": 180,
          "readable": "Days since last contact"
        }
      ],
      "baseline_probability": 0.15
    }
  },
  "recommendations": {
    "send_time": {
      "day_of_week": 2,
      "hour_of_day": 10,
      "predicted_open_rate": 0.42
    },
    "personalization_tips": [
      "Mention recent hiring expansion",
      "Reference recent funding round",
      "Focus on ROI and strategic value"
    ]
  },
  "metadata": {
    "model_version": "v2025_10_17_explainable",
    "features_computed": 47,
    "scored_at": "2025-10-17T10:30:00Z",
    "response_time_ms": 234,
    "api_key_name": "HubSpot Production",
    "environment": "live"
  }
}
```

#### Probability Grades

| Grade | Probability Range | Interpretation |
|-------|------------------|----------------|
| A | 0.75 - 1.00 | High conversion likelihood |
| B | 0.60 - 0.74 | Good conversion likelihood |
| C | 0.40 - 0.59 | Moderate conversion likelihood |
| D | 0.25 - 0.39 | Low conversion likelihood |
| F | 0.00 - 0.24 | Very low conversion likelihood |

---

### 2. Batch Score Leads

**`POST /api/v1/propensity/score-batch`**

Score up to 100 leads in a single request.

**Requires scope:** `batch:score`

#### Request Body

```json
{
  "leads": [
    {
      "company": {"name": "Company A", "industry": "technology"},
      "contact": {"email": "contact1@companya.com", "title": "CTO"}
    },
    {
      "company": {"name": "Company B", "industry": "finance"},
      "contact": {"email": "contact2@companyb.com", "title": "CFO"}
    }
  ]
}
```

**Limits:**
- Maximum: 100 leads per request
- Recommended batch size: 50 leads for optimal performance

#### Response

```json
{
  "ok": true,
  "results": [
    {
      "index": 0,
      "score": {
        "probability": 0.68,
        "grade": "B",
        "explanation": {
          "summary": "Prediction generated successfully"
        }
      }
    },
    {
      "index": 1,
      "error": "invalid_email",
      "message": "Contact email is invalid"
    }
  ],
  "summary": {
    "total": 100,
    "succeeded": 98,
    "failed": 2,
    "processing_time_ms": 3542
  }
}
```

---

### 3. Health Check

**`GET /api/v1/propensity/health`**

Check API availability and status.

#### Response

```json
{
  "ok": true,
  "status": "healthy",
  "api_version": "v1",
  "model_version": "v2025_10_17_explainable",
  "timestamp": "2025-10-17T10:30:00Z"
}
```

---

## Rate Limiting

API keys have configurable rate limits:

- **Per Minute**: Default 60 requests/minute
- **Per Day**: Default 10,000 requests/day

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1634480400
```

### Rate Limit Exceeded

When rate limit is exceeded, you'll receive:

```json
{
  "ok": false,
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded: 60 requests per minute",
  "retry_after": 45
}
```

**Status Code:** `429 Too Many Requests`

---

## Error Handling

All errors follow this format:

```json
{
  "ok": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {} // Optional additional context
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `missing_api_key` | 401 | No API key provided |
| `invalid_api_key` | 401 | API key not found or invalid |
| `api_key_inactive` | 401 | API key has been deactivated |
| `api_key_expired` | 401 | API key has expired |
| `insufficient_scopes` | 403 | API key lacks required permissions |
| `ip_not_allowed` | 403 | IP address not whitelisted |
| `rate_limit_exceeded` | 429 | Rate limit exceeded |
| `missing_required_fields` | 400 | Required fields missing |
| `batch_too_large` | 400 | Batch exceeds 100 leads |
| `scoring_failed` | 500 | Internal scoring error |

---

## Integration Examples

### HubSpot Integration

```javascript
// HubSpot Custom Code Action
const axios = require('axios');

exports.main = async (event, callback) => {
  const { email, firstname, lastname, jobtitle, company, industry } = event.inputFields;

  try {
    const response = await axios.post(
      'https://upr.sivakumar.ai/api/v1/propensity/score',
      {
        company: {
          name: company,
          industry: industry
        },
        contact: {
          name: `${firstname} ${lastname}`,
          email: email,
          title: jobtitle
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.UPR_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    callback({
      outputFields: {
        propensity_score: response.data.score.probability,
        propensity_grade: response.data.score.grade,
        score_explanation: response.data.score.explanation.summary
      }
    });

  } catch (error) {
    callback({ error: error.message });
  }
};
```

### Salesforce Integration (Apex)

```apex
public class UPRPropensityAPI {

    private static final String API_KEY = 'sk_live_...'; // Store in Custom Metadata
    private static final String ENDPOINT = 'https://upr.sivakumar.ai/api/v1/propensity/score';

    public static void scoreLeads(List<Lead> leads) {
        for (Lead lead : leads) {
            scoreLead(lead);
        }
    }

    @future(callout=true)
    public static void scoreLead(Lead lead) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + API_KEY);
        req.setHeader('Content-Type', 'application/json');

        Map<String, Object> requestBody = new Map<String, Object>{
            'company' => new Map<String, String>{
                'name' => lead.Company,
                'industry' => lead.Industry
            },
            'contact' => new Map<String, String>{
                'email' => lead.Email,
                'title' => lead.Title
            }
        };

        req.setBody(JSON.serialize(requestBody));

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            Map<String, Object> score = (Map<String, Object>) result.get('score');

            lead.Propensity_Score__c = (Decimal) score.get('probability');
            lead.Propensity_Grade__c = (String) score.get('grade');
            update lead;
        }
    }
}
```

### Zoho CRM Integration (Deluge)

```javascript
// Zoho CRM Workflow Function
response = invokeurl
[
    url: "https://upr.sivakumar.ai/api/v1/propensity/score"
    type: POST
    parameters: {
        "company": {
            "name": lead.Company,
            "industry": lead.Industry
        },
        "contact": {
            "email": lead.Email,
            "title": lead.Designation
        }
    }
    headers: {
        "Authorization": "Bearer sk_live_...",
        "Content-Type": "application/json"
    }
];

if(response.get("ok") == true)
{
    score = response.get("score");
    lead.Propensity_Score = score.get("probability");
    lead.Propensity_Grade = score.get("grade");
    update lead;
}
```

---

## Best Practices

### 1. **Caching**
Cache scores for 24 hours to reduce API calls:
```javascript
const cacheKey = `propensity:${email}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const score = await fetchPropensityScore(email);
await redis.setex(cacheKey, 86400, JSON.stringify(score)); // 24h TTL
```

### 2. **Batch When Possible**
Use `/score-batch` for bulk operations:
```javascript
// Instead of 100 separate API calls
for (const lead of leads) {
  await scoreLead(lead); // ❌ Slow, hits rate limits
}

// Use batch endpoint
await scoreBatch(leads); // ✅ Fast, efficient
```

### 3. **Error Handling**
Always handle errors gracefully:
```javascript
try {
  const score = await uprApi.score(lead);
} catch (error) {
  if (error.status === 429) {
    // Rate limited - retry after delay
    await sleep(error.retry_after * 1000);
    return uprApi.score(lead);
  }
  // Log error, use fallback score
  console.error('UPR scoring failed:', error);
  return { probability: 0.25, grade: 'D' }; // Safe fallback
}
```

### 4. **Webhook Integration**
For real-time scoring, use webhooks:
```javascript
// CRM webhook endpoint
app.post('/webhook/new-lead', async (req, res) => {
  const lead = req.body;

  // Score asynchronously (don't block webhook response)
  scoreLead(lead).catch(console.error);

  res.json({ ok: true });
});
```

### 5. **Monitor Usage**
Track API usage to avoid unexpected limits:
```sql
SELECT
  DATE(requested_at) as date,
  COUNT(*) as requests,
  AVG(response_time_ms) as avg_response_time
FROM api_usage
WHERE api_key_id = YOUR_KEY_ID
GROUP BY DATE(requested_at)
ORDER BY date DESC
LIMIT 30;
```

---

## Pricing & Limits

| Tier | Requests/Min | Requests/Day | Batch Size | Price |
|------|--------------|--------------|------------|-------|
| **Starter** | 60 | 10,000 | 50 | Free |
| **Professional** | 300 | 100,000 | 100 | $199/mo |
| **Enterprise** | 1,000 | 1,000,000 | 100 | Custom |

*Contact sales@upr.sivakumar.ai for enterprise pricing*

---

## Support

- 📧 Email: [support@upr.sivakumar.ai](mailto:support@upr.sivakumar.ai)
- 📖 Documentation: [https://docs.upr.sivakumar.ai](https://docs.upr.sivakumar.ai)
- 💬 Discord: [https://discord.gg/upr](https://discord.gg/upr)
- 🐛 Bug Reports: [https://github.com/upr/issues](https://github.com/upr/issues)

---

## Changelog

### v1.0.0 (2025-10-17)
- ✅ Initial release
- ✅ Single lead scoring with SHAP explainability
- ✅ Batch scoring (up to 100 leads)
- ✅ Send time optimization
- ✅ Personalization recommendations
- ✅ API key authentication with scopes
- ✅ Rate limiting (per minute and per day)
