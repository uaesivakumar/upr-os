# API Rate Limits

**Last Updated:** November 9, 2025
**Sprint:** 17, Priority 1
**Implementation:** Express Rate Limit Middleware

All UPR API endpoints are rate-limited to prevent abuse and control costs.

---

## 📊 Rate Limits by Endpoint Type

| Endpoint Type | Limit | Window | Reason | Status Code |
|---------------|-------|--------|--------|-------------|
| General API | 100 requests | 15 minutes | Normal operations | 429 |
| Enrichment | 20 requests | 15 minutes | External API costs | 429 |
| RADAR Scans | 5 requests | 1 hour | Expensive operations | 429 |
| Authentication | 5 attempts | 15 minutes | Security (brute force) | 429 |

---

## 🔒 Protected Endpoints

### General API Rate Limit (100 req/15min)
**Applies to:** All `/api/*` endpoints unless specifically overridden

**Examples:**
- `/api/companies`
- `/api/hiring-signals`
- `/api/hr-leads`
- `/api/templates`
- All other API endpoints

### Enrichment Rate Limit (20 req/15min)
**Applies to:**
- `/api/enrichment/*` - Unified enrichment system
- `/api/enrich/*` - Original enrichment system
- `/api/hiring-enrich/*` - Hiring signals enrichment

**Reason:** These endpoints call external APIs (LinkedIn, Clearbit, Hunter.io) which have usage costs. Rate limiting prevents unexpected API bills.

### RADAR Rate Limit (5 req/hour)
**Applies to:**
- `/api/radar/*` - RADAR discovery scans

**Reason:** RADAR scans are expensive operations that:
- Use SerpAPI (cost: ~$0.05-0.10 per search)
- Use Claude AI (cost: ~$0.01-0.05 per analysis)
- Can trigger 100+ API calls per scan
- Budget limit: $2-5 per scan

**Note:** Automated daily scans bypass this limit.

### Authentication Rate Limit (5 attempts/15min)
**Applies to:**
- `/api/auth/login` - Login endpoint

**Reason:** Prevents brute force password attacks.

**Special Behavior:** Only failed login attempts are counted. Successful logins don't increment the counter.

---

## 📡 Rate Limit Headers

All rate-limited responses include informational headers:

```http
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1699564800
```

**Headers:**
- `RateLimit-Limit`: Maximum requests allowed in the current window
- `RateLimit-Remaining`: Number of requests remaining in current window
- `RateLimit-Reset`: Unix timestamp when the window resets

---

## 🚨 429 Response Format

When rate limited, you'll receive a `429 Too Many Requests` response:

### General API Example:
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

### Enrichment API Example:
```json
{
  "error": "Too many enrichment requests. This endpoint is rate-limited due to API costs.",
  "retryAfter": "15 minutes",
  "limit": 20,
  "window": "15 minutes"
}
```

### RADAR API Example:
```json
{
  "error": "Too many RADAR scan requests. RADAR scans are expensive and limited to 5 per hour.",
  "retryAfter": "1 hour",
  "limit": 5,
  "window": "1 hour",
  "note": "Automated daily scans are not affected by this limit."
}
```

### Auth API Example:
```json
{
  "error": "Too many login attempts. Please try again later.",
  "retryAfter": "15 minutes"
}
```

---

## 💡 Best Practices

### 1. Check Rate Limit Headers
Monitor `RateLimit-Remaining` header to avoid hitting limits:

```javascript
const response = await fetch('/api/companies');
const remaining = response.headers.get('RateLimit-Remaining');

if (remaining < 10) {
  console.warn('Approaching rate limit, slow down requests');
}
```

### 2. Implement Exponential Backoff
When you receive a 429, wait before retrying:

```javascript
async function fetchWithBackoff(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url);

    if (response.status === 429) {
      const wait = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      console.log(`Rate limited, waiting ${wait}ms`);
      await new Promise(resolve => setTimeout(resolve, wait));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

### 3. Cache Responses
Reduce API calls by caching responses locally:

```javascript
const cache = new Map();

async function fetchWithCache(url, ttl = 60000) {
  const cached = cache.get(url);

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const response = await fetch(url);
  const data = await response.json();

  cache.set(url, { data, timestamp: Date.now() });
  return data;
}
```

### 4. Batch Requests
Use bulk endpoints when available:

```javascript
// ❌ Bad: Multiple single requests (uses 10 requests)
for (const id of companyIds) {
  await fetch(`/api/companies/${id}`);
}

// ✅ Good: Single bulk request (uses 1 request)
await fetch('/api/companies/bulk', {
  method: 'POST',
  body: JSON.stringify({ ids: companyIds })
});
```

---

## 🔓 Bypassing Rate Limits

### Option 1: API Key Authentication
Authenticated users with API keys may have higher limits.

**Contact:** support@upr.com to request API key

### Option 2: IP Whitelisting
For automated systems or CI/CD pipelines, IP whitelisting is available.

**Contact:** devops@upr.com to request whitelisting

### Option 3: Enterprise Plan
Enterprise customers can request custom rate limits.

**Contact:** sales@upr.com for enterprise pricing

---

## 🧪 Testing Rate Limits

Use the provided test script:

```bash
# Test locally
./scripts/test-rate-limiting.sh

# Test production (update API_URL in script first)
API_URL="https://your-domain.com" ./scripts/test-rate-limiting.sh
```

Expected behavior:
- First 100 requests to general API: `200 OK`
- 101st request: `429 Too Many Requests`
- Wait 15 minutes, then requests work again

---

## 🛠️ Implementation Details

### Middleware
Rate limiting is implemented using `express-rate-limit` middleware.

**File:** `server/middleware/rateLimiter.js`

### Configuration
Limits are configured per endpoint type in the middleware file.

**To modify limits:**
1. Edit `server/middleware/rateLimiter.js`
2. Update `windowMs` (time window in milliseconds)
3. Update `max` (maximum requests per window)
4. Redeploy application

### Logging
Rate limit violations are logged to console with IP, path, and user info.

**Log Format:**
```
⚠️  Rate limit exceeded { ip: '1.2.3.4', path: '/api/enrich', method: 'POST' }
```

---

## 📞 Support

If you're hitting rate limits and need assistance:

1. **Check your request patterns** - Are you making unnecessary duplicate requests?
2. **Implement caching** - Can you cache responses to reduce API calls?
3. **Use bulk endpoints** - Can you batch requests together?
4. **Contact support** - If you have a legitimate use case for higher limits

**Support Email:** support@upr.com
**Documentation:** https://docs.upr.com/api/rate-limits

---

## 📋 Changelog

### 2025-11-09 (Sprint 17)
- ✅ Added rate limiting to all API endpoints
- ✅ General API: 100 req/15min
- ✅ Enrichment: 20 req/15min
- ✅ RADAR: 5 req/hour
- ✅ Auth: 5 attempts/15min
- ✅ Added rate limit headers (RateLimit-*)
- ✅ Added console logging for violations

---

**Last Updated:** November 9, 2025
**Maintained by:** UPR Engineering Team
**Sprint:** 17, Priority 1
