# MCP Integration Guide
## SIVA Agent Hub - Claude Desktop Integration

**Sprint 29 - Phase 3: Centralized Agentic Hub**

---

## Overview

The SIVA Agent Hub provides Model Context Protocol (MCP) integration, allowing Claude Desktop to directly execute all 4 SIVA decision primitives:

- **evaluate_company_quality** - Company fit evaluation (0-100 score)
- **select_contact_tier** - Contact tier classification (Tier 1-3)
- **calculate_timing_score** - Optimal outreach timing (0-100 score)
- **match_banking_products** - Banking product recommendations

---

## Installation

### 1. Install Dependencies

```bash
cd /Users/skc/DataScience/upr
npm install
```

The MCP SDK (`@modelcontextprotocol/sdk`) is already installed.

### 2. Configure Claude Desktop

Add the SIVA Agent Hub server to your Claude Desktop MCP configuration:

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Configuration**:
```json
{
  "mcpServers": {
    "siva-agent-hub": {
      "command": "node",
      "args": [
        "/Users/skc/DataScience/upr/server/agent-hub/mcp-server-cli.js"
      ],
      "env": {
        "NODE_ENV": "production",
        "DATABASE_URL": "postgresql://upr_app:PASSWORD@34.121.0.240:5432/upr_production?sslmode=disable",
        "SENTRY_DSN": "YOUR_SENTRY_DSN",
        "LOG_LEVEL": "info",
        "ENABLE_HEALTH_CHECKS": "false"
      }
    }
  }
}
```

**Environment Variables**:
- `DATABASE_URL`: PostgreSQL connection for decision logging (optional for basic usage)
- `SENTRY_DSN`: Sentry error tracking DSN (optional)
- `LOG_LEVEL`: Winston log level (default: `info`)
- `ENABLE_HEALTH_CHECKS`: Enable periodic health checks (`true`/`false`, default: `false` for MCP mode)

### 3. Restart Claude Desktop

After adding the configuration, restart Claude Desktop for the changes to take effect.

---

## Usage

### In Claude Desktop

Once configured, you can use the SIVA tools directly in your conversations:

**Example 1: Evaluate Company Quality**
```
Can you evaluate this company for sales outreach?
- Company: TechCorp UAE
- Domain: techcorp.ae
- Industry: Technology
- Size: 150 employees
- UAE domain: Yes
- UAE address: Yes
```

Claude will use the `evaluate_company_quality` tool and return:
- Quality score (0-100)
- Tier classification
- Confidence level
- Key factors

**Example 2: Find Decision Makers**
```
Who should I contact at a 200-person technology company?
Title: Chief Technology Officer
```

Claude will use the `select_contact_tier` tool and return:
- Tier classification (Tier 1, 2, or 3)
- Target job titles
- Confidence level

**Example 3: Calculate Timing Score**
```
Is now a good time to reach out if they posted a hiring signal 7 days ago?
Current date: 2025-01-15
Signal type: hiring
```

Claude will use the `calculate_timing_score` tool and return:
- Timing score (0-100)
- Category (Excellent/Good/Fair/Poor)
- Key factors

**Example 4: Match Banking Products**
```
What Emirates NBD products should I recommend for a 150-person tech company
with AED 15,000 average salary and expansion signals?
```

Claude will use the `match_banking_products` tool and return:
- Recommended products
- Fit scores
- Reasoning

---

## Tool Schemas

### evaluate_company_quality

**Input**:
```json
{
  "company_name": "TechCorp UAE",
  "domain": "techcorp.ae",
  "industry": "Technology",
  "size": 150,
  "size_bucket": "midsize",
  "uae_signals": {
    "has_ae_domain": true,
    "has_uae_address": true,
    "linkedin_location": "Dubai, UAE"
  },
  "salary_indicators": {
    "salary_level": "high",
    "avg_salary": 18000
  }
}
```

**Output**:
```json
{
  "quality_score": 85,
  "quality_tier": "High-Value",
  "confidence": 0.92,
  "key_factors": [
    "UAE presence confirmed (.ae domain + UAE address)",
    "High-value industry (Technology)",
    "Strong salary indicators (AED 18,000 avg)"
  ],
  "reasoning": "Company demonstrates strong UAE presence and high-value profile...",
  "_meta": {
    "decision_id": "dec_abc123",
    "shadow_mode_active": true,
    "ab_test_group": "A",
    "execution_time_ms": 287
  }
}
```

### select_contact_tier

**Input**:
```json
{
  "title": "Chief Technology Officer",
  "company_size": 200,
  "department": "Technology"
}
```

**Output**:
```json
{
  "tier": "Tier 1",
  "target_titles": ["CTO", "VP Engineering", "Head of Technology"],
  "confidence": 0.95,
  "confidence_level": "HIGH",
  "metadata": {
    "department": "C-Suite",
    "seniority_level": "C-Level"
  },
  "_meta": {
    "decision_id": "dec_def456",
    "execution_time_ms": 145
  }
}
```

### calculate_timing_score

**Input**:
```json
{
  "current_date": "2025-01-15",
  "signal_type": "hiring",
  "signal_age": 7,
  "fiscal_context": {
    "quarter": "Q1",
    "month_in_quarter": 1
  }
}
```

**Output**:
```json
{
  "timing_score": 92,
  "timing_category": "Excellent",
  "confidence": 0.88,
  "key_factors": [
    "Fresh hiring signal (7 days old)",
    "Q1 start - high budget availability",
    "Mid-month timing optimal"
  ],
  "reasoning": "Excellent timing for outreach with fresh hiring signals...",
  "_meta": {
    "decision_id": "dec_ghi789",
    "execution_time_ms": 198
  }
}
```

### match_banking_products

**Input**:
```json
{
  "company_size": 150,
  "industry": "technology",
  "average_salary_aed": 15000,
  "signals": ["expansion", "hiring"],
  "has_free_zone_license": true
}
```

**Output**:
```json
{
  "recommended_products": [
    {
      "name": "Emirates Advantage Salary Account",
      "fit_score": 95,
      "reasoning": "High average salary (AED 15K) matches premium tier"
    },
    {
      "name": "Business Growth Account",
      "fit_score": 88,
      "reasoning": "Expansion signals indicate growth phase"
    }
  ],
  "confidence": 0.90,
  "segment": "Mid-market",
  "_meta": {
    "decision_id": "dec_jkl012",
    "execution_time_ms": 312
  }
}
```

---

## Troubleshooting

### MCP Server Not Starting

1. **Check Node.js version**: Requires Node.js 18+
   ```bash
   node --version
   ```

2. **Check logs**: MCP server logs to stderr
   ```bash
   tail -f ~/.local/state/claude/logs/mcp-server-siva-agent-hub.log
   ```

3. **Verify file path**: Ensure absolute path in config matches your installation
   ```bash
   ls -l /Users/skc/DataScience/upr/server/agent-hub/mcp-server-cli.js
   ```

4. **Test manually**:
   ```bash
   node /Users/skc/DataScience/upr/server/agent-hub/mcp-server-cli.js
   ```

   Should output:
   ```
   ✅ SIVA Agent Hub MCP Server running
   Waiting for MCP requests from Claude Desktop...
   ```

### Tools Not Available in Claude Desktop

1. **Restart Claude Desktop** after configuration changes
2. **Check MCP server logs** for initialization errors
3. **Verify tool registration**: Server should log:
   ```
   Tool registered: CompanyQualityTool v2.0
   Tool registered: ContactTierTool v2.0
   Tool registered: TimingScoreTool v1.0
   Tool registered: BankingProductMatchTool v1.0
   ```

### Connection Errors

- **Database connection**: If `DATABASE_URL` is invalid, decision logging will fail but tools will still work
- **Sentry**: If `SENTRY_DSN` is invalid, error tracking will be disabled but tools will still work

---

## Architecture

```
Claude Desktop
    |
    | (MCP Protocol - stdio)
    |
MCP Server (mcp-server-cli.js)
    |
    |-- ToolRegistry (4 tools)
    |       |-- CompanyQualityTool
    |       |-- ContactTierTool
    |       |-- TimingScoreTool
    |       |-- BankingProductMatchTool
    |
    |-- RequestRouter (validation, timeout management)
    |
    |-- CircuitBreaker (resilience)
    |
    |-- Metrics (Prometheus)
    |
    |-- Logger (Winston)
```

---

## Performance

- **Tool Execution**: ≤1s P95 (individual tools)
- **MCP Overhead**: ≤50ms (protocol handling)
- **Total Latency**: ≤1.5s P95 (end-to-end)

---

## Monitoring

### Logs

MCP server logs to stderr in JSON format:

```json
{
  "level": "info",
  "message": "Tool execution succeeded",
  "service": "agent-hub",
  "tool_name": "CompanyQualityTool",
  "duration_ms": 287,
  "timestamp": "2025-11-16 10:30:00.123"
}
```

### Metrics

Prometheus metrics available (when MCP server runs with monitoring enabled):

- `agent_hub_tool_execution_duration_ms` - Tool execution duration histogram
- `agent_hub_tool_executions_total` - Tool execution count
- `agent_hub_mcp_requests_total` - MCP request count
- `agent_hub_mcp_request_duration_ms` - MCP request duration
- `agent_hub_circuit_breaker_state` - Circuit breaker state gauge

---

## Security

### Authentication

MCP server runs locally and communicates with Claude Desktop via stdio. No network exposure.

### Data Privacy

- All tool executions logged to `agent_core.agent_decisions` table (if `DATABASE_URL` configured)
- Decision IDs tracked for auditing
- No external API calls (all processing local)

### Environment Variables

Keep sensitive credentials secure:
- **DATABASE_URL**: Contains database password
- **SENTRY_DSN**: Contains Sentry project key

Store in `.env` file (excluded from git) or use environment-specific configuration.

---

## Next Steps

1. ✅ MCP Server integrated
2. ⏳ Multi-tool workflows (Sprint 29)
3. ⏳ Advanced orchestration (Sprint 30+)

---

## References

- **MCP Protocol**: https://modelcontextprotocol.io/
- **Agent Hub Architecture**: `/Users/skc/DataScience/upr/docs/AGENT_HUB_ARCHITECTURE.md`
- **SIVA Phases**: `/Users/skc/DataScience/upr/docs/siva-phases/phases_summary_HONEST.json`
