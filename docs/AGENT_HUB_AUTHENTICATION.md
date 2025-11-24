# Agent Hub Authentication Guide
**Sprint 30 - JWT Authentication Implementation**

## Overview

The Agent Hub API uses JWT (JSON Web Token) based authentication to secure access to tool execution and workflow endpoints. This document provides comprehensive guidance on authentication implementation, usage, and security best practices.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication Flow](#authentication-flow)
3. [API Endpoints](#api-endpoints)
4. [Token Structure](#token-structure)
5. [Protected vs Public Endpoints](#protected-vs-public-endpoints)
6. [Security Considerations](#security-considerations)
7. [Error Handling](#error-handling)
8. [Code Examples](#code-examples)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Generate JWT Token

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"api_key": "YOUR_API_KEY"}'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "metadata": {
    "duration_ms": 15,
    "timestamp": "2025-11-18T03:50:00.000Z"
  }
}
```

### 2. Use Token to Execute Tool

```bash
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/agent-hub/v1/execute-tool \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "tool_name": "CompanyQualityTool",
    "input": {
      "company_name": "TechCorp UAE",
      "domain": "techcorp.ae",
      "industry": "Technology",
      "size": 150,
      "size_bucket": "midsize",
      "uae_signals": {
        "has_ae_domain": true,
        "has_uae_address": true
      }
    }
  }'
```

---

## Authentication Flow

```
┌─────────┐                                  ┌─────────────┐
│ Client  │                                  │ Agent Hub   │
└────┬────┘                                  └──────┬──────┘
     │                                               │
     │  1. POST /auth/token                          │
     │     { api_key: "secret" }                     │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                                        2. Validate API key
     │                                        3. Generate JWT token
     │                                               │
     │  4. Response: { token: "jwt..." }             │
     │<──────────────────────────────────────────────┤
     │                                               │
     │  5. POST /execute-tool                        │
     │     Authorization: Bearer jwt...              │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                                        6. Validate JWT
     │                                        7. Check permissions
     │                                        8. Execute tool
     │                                               │
     │  9. Response: { result: {...} }               │
     │<──────────────────────────────────────────────┤
     │                                               │
```

---

## API Endpoints

### POST /api/agent-hub/v1/auth/token
**Generate JWT token for API access**

**Access:** Public (no authentication required)

**Request:**
```json
{
  "api_key": "YOUR_API_KEY"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcGlfY2xpZW50Iiwicm9sZSI6ImFnZW50X2h1Yl9hcGkiLCJwZXJtaXNzaW9ucyI6WyJleGVjdXRlX3Rvb2wiLCJleGVjdXRlX3dvcmtmbG93IiwicmVhZF90b29scyIsInJlYWRfd29ya2Zsb3dzIl0sImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.signature",
  "expires_in": 3600,
  "token_type": "Bearer",
  "metadata": {
    "duration_ms": 15,
    "timestamp": "2025-11-18T03:50:00.000Z"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | MISSING_CREDENTIALS | No api_key provided |
| 401 | INVALID_API_KEY | API key is incorrect |
| 500 | SERVER_MISCONFIGURED | AGENT_HUB_API_KEY not configured |
| 500 | TOKEN_GENERATION_FAILED | JWT generation failed |

---

## Token Structure

### JWT Payload

```json
{
  "sub": "api_client",
  "role": "agent_hub_api",
  "permissions": [
    "execute_tool",
    "execute_workflow",
    "read_tools",
    "read_workflows"
  ],
  "iat": 1700000000,
  "exp": 1700003600
}
```

### Fields

- **sub** (subject): Identifier for the API client or user
- **role**: Access level - `agent_hub_api`, `agent_hub_user`, or `admin`
- **permissions**: Array of granted permissions
- **iat** (issued at): Token creation timestamp
- **exp** (expiration): Token expiration timestamp (1 hour from iat)

### Roles and Permissions

| Role | Permissions | Description |
|------|-------------|-------------|
| `agent_hub_api` | execute_tool, execute_workflow, read_tools, read_workflows | Standard API access |
| `agent_hub_user` | execute_tool, execute_workflow, read_tools, read_workflows | User-level access |
| `admin` | All permissions | Full administrative access |

---

## Protected vs Public Endpoints

### Protected Endpoints (Require JWT)

All tool and workflow execution endpoints require JWT authentication:

- `POST /api/agent-hub/v1/execute-tool`
- `POST /api/agent-hub/v1/execute-workflow`

**Authentication Required:**
```
Authorization: Bearer <jwt_token>
```

**401 Unauthorized Response:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Provide a valid JWT token in Authorization header."
  }
}
```

### Public Endpoints (No JWT Required)

Discovery and health endpoints are public:

- `GET /api/agent-hub/v1/health` - Health check
- `GET /api/agent-hub/v1/tools` - List available tools
- `GET /api/agent-hub/v1/workflows` - List available workflows
- `POST /api/agent-hub/v1/auth/token` - Token generation

---

## Security Considerations

### API Key Storage

**Environment Variable:**
```bash
# In Cloud Run
AGENT_HUB_API_KEY=<secure-random-key>
```

**Best Practices:**
- Store API keys in Google Cloud Secret Manager
- Never commit API keys to version control
- Rotate API keys regularly (quarterly recommended)
- Use strong, randomly generated keys (32+ characters)

### JWT Token Expiration

- **Expiration Time:** 1 hour (3600 seconds)
- **Recommendation:** Implement token refresh logic in clients
- **Behavior:** After expiration, clients must request a new token

### Token Transmission

- **Always use HTTPS** for API calls
- **Never log** JWT tokens in plaintext
- **Store securely** in client applications (encrypted storage, secure cookies)

### Rate Limiting

Authentication endpoints are rate-limited to prevent brute-force attacks:
- **Token generation:** 5 attempts per 15 minutes per IP
- **Protected endpoints:** 100 requests per 15 minutes per token

---

## Error Handling

### Authentication Errors

#### 401 UNAUTHORIZED
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Provide a valid JWT token in Authorization header."
  }
}
```

**Causes:**
- No Authorization header provided
- Token is missing or malformed

**Solution:** Include valid JWT in Authorization header

#### 401 INVALID_TOKEN
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired JWT token."
  }
}
```

**Causes:**
- Token has expired (>1 hour old)
- Token signature is invalid
- Token has been tampered with

**Solution:** Generate a new token using POST /auth/token

#### 403 FORBIDDEN
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Token does not have permission to access Agent Hub API."
  }
}
```

**Causes:**
- Token role is not in allowed list (agent_hub_api, agent_hub_user, admin)
- Token lacks required permissions

**Solution:** Verify token payload has correct role and permissions

---

## Code Examples

### Node.js / JavaScript

```javascript
const axios = require('axios');

const API_URL = 'https://upr-web-service-191599223867.us-central1.run.app';
const API_KEY = process.env.AGENT_HUB_API_KEY;

// 1. Generate JWT Token
async function getToken() {
  const response = await axios.post(`${API_URL}/api/agent-hub/v1/auth/token`, {
    api_key: API_KEY
  });

  return response.data.token;
}

// 2. Execute Tool with Authentication
async function executeTool(token, toolName, input) {
  const response = await axios.post(
    `${API_URL}/api/agent-hub/v1/execute-tool`,
    {
      tool_name: toolName,
      input: input
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

// Usage
(async () => {
  try {
    const token = await getToken();
    console.log('Token obtained:', token.substring(0, 20) + '...');

    const result = await executeTool(token, 'CompanyQualityTool', {
      company_name: 'TechCorp UAE',
      domain: 'techcorp.ae',
      industry: 'Technology',
      size: 150,
      size_bucket: 'midsize',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true
      }
    });

    console.log('Quality Score:', result.result.quality_score);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
})();
```

### Python

```python
import requests
import os

API_URL = 'https://upr-web-service-191599223867.us-central1.run.app'
API_KEY = os.environ.get('AGENT_HUB_API_KEY')

# 1. Generate JWT Token
def get_token():
    response = requests.post(
        f'{API_URL}/api/agent-hub/v1/auth/token',
        json={'api_key': API_KEY}
    )
    response.raise_for_status()
    return response.json()['token']

# 2. Execute Tool with Authentication
def execute_tool(token, tool_name, input_data):
    response = requests.post(
        f'{API_URL}/api/agent-hub/v1/execute-tool',
        json={
            'tool_name': tool_name,
            'input': input_data
        },
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    )
    response.raise_for_status()
    return response.json()

# Usage
if __name__ == '__main__':
    try:
        token = get_token()
        print(f'Token obtained: {token[:20]}...')

        result = execute_tool(token, 'CompanyQualityTool', {
            'company_name': 'TechCorp UAE',
            'domain': 'techcorp.ae',
            'industry': 'Technology',
            'size': 150,
            'size_bucket': 'midsize',
            'uae_signals': {
                'has_ae_domain': True,
                'has_uae_address': True
            }
        })

        print(f"Quality Score: {result['result']['quality_score']}")
    except requests.exceptions.HTTPError as e:
        print(f'Error: {e.response.json()}')
```

### cURL

```bash
#!/bin/bash

# Configuration
API_URL="https://upr-web-service-191599223867.us-central1.run.app"
API_KEY="your-api-key-here"

# 1. Generate Token
TOKEN_RESPONSE=$(curl -s -X POST "${API_URL}/api/agent-hub/v1/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\": \"${API_KEY}\"}")

TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.token')
echo "Token obtained: ${TOKEN:0:20}..."

# 2. Execute Tool
RESULT=$(curl -s -X POST "${API_URL}/api/agent-hub/v1/execute-tool" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "tool_name": "CompanyQualityTool",
    "input": {
      "company_name": "TechCorp UAE",
      "domain": "techcorp.ae",
      "industry": "Technology",
      "size": 150,
      "size_bucket": "midsize",
      "uae_signals": {
        "has_ae_domain": true,
        "has_uae_address": true
      }
    }
  }')

echo "Result: $RESULT" | jq '.'
```

---

## Troubleshooting

### Issue: "Invalid API key" Error

**Symptoms:**
```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid API key"
  }
}
```

**Solutions:**
1. Verify API key is correct (no whitespace, correct characters)
2. Check API key environment variable is set on Cloud Run
3. Ensure you're using the latest API key (if rotated)

### Issue: Token Expired

**Symptoms:**
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired JWT token."
  }
}
```

**Solutions:**
1. Generate a new token - tokens expire after 1 hour
2. Implement token refresh logic in your application
3. Cache tokens but check expiration before use

### Issue: Missing Authorization Header

**Symptoms:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required..."
  }
}
```

**Solutions:**
1. Ensure Authorization header is included
2. Format must be: `Authorization: Bearer <token>`
3. Check for typos in header name (case-sensitive)

### Issue: Token Works Initially Then Stops

**Cause:** JWT_SECRET environment variable changed or service restarted with different secret

**Solutions:**
1. Generate a new token after service restarts
2. Ensure JWT_SECRET is consistent across deployments
3. Store JWT_SECRET in Google Cloud Secret Manager

---

## Production Deployment

### Environment Variables

Required environment variables for Cloud Run:

```bash
# JWT Secret (for signing tokens)
JWT_SECRET=<secret-value-from-secret-manager>

# Agent Hub API Key (for initial authentication)
AGENT_HUB_API_KEY=<secret-value-from-secret-manager>
```

### Cloud Run Configuration

```bash
# Update service with secrets
gcloud run services update upr-web-service \
  --region=us-central1 \
  --update-secrets=JWT_SECRET=JWT_SECRET:latest \
  --update-secrets=AGENT_HUB_API_KEY=AGENT_HUB_API_KEY:latest
```

### Monitoring

Check authentication metrics in Cloud Run logs:

```bash
# View auth-related logs
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 | grep "auth"
```

**Key Metrics:**
- Token generation success rate
- Invalid API key attempts (potential security issue)
- Token validation failures
- Authentication errors by endpoint

---

## API Reference Summary

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/auth/token` | POST | No | Generate JWT token |
| `/execute-tool` | POST | Yes | Execute single tool |
| `/execute-workflow` | POST | Yes | Execute workflow |
| `/tools` | GET | No | List available tools |
| `/workflows` | GET | No | List available workflows |
| `/health` | GET | No | Health check |

---

## Support

For authentication issues or questions:

1. Check logs: `gcloud run services logs read upr-web-service`
2. Verify secrets: `gcloud secrets list`
3. Test endpoint: Use provided code examples
4. Review this documentation

---

**Last Updated:** 2025-11-18
**Sprint:** 30
**Version:** 1.0
**Status:** Production Ready ✅
