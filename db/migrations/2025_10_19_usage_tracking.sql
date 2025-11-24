-- Phase 0: Usage Tracking (For Future Pricing)
-- Date: October 19, 2025
-- Purpose: Track every API call and cost for billing, analytics, and quota enforcement

BEGIN;

-- Track every API call and cost
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  event_type TEXT NOT NULL, -- 'enrichment', 'discovery', 'outreach', 'rag_query'
  cost_usd NUMERIC(10,4) DEFAULT 0,
  credits_consumed INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for efficient monthly queries by tenant
CREATE INDEX idx_usage_tenant_created ON usage_events(tenant_id, created_at);
CREATE INDEX idx_usage_event_type ON usage_events(event_type);
CREATE INDEX idx_usage_created_at ON usage_events(created_at);

-- View for monthly billing
CREATE VIEW monthly_usage AS
SELECT
  tenant_id,
  DATE_TRUNC('month', created_at) as month,
  event_type,
  COUNT(*) as event_count,
  SUM(cost_usd) as total_cost,
  SUM(credits_consumed) as total_credits
FROM usage_events
GROUP BY tenant_id, DATE_TRUNC('month', created_at), event_type;

COMMIT;

-- Usage Notes:
--
-- Event Types:
--   'enrichment'  - Apollo/NeverBounce API calls for contact enrichment
--   'discovery'   - SerpAPI/Reddit searches for company discovery
--   'outreach'    - GPT-4 message generation, email sending
--   'rag_query'   - RAG queries (internal_kb = free, external_api = paid)
--
-- Metadata Examples:
--   {'provider': 'apollo', 'operation': 'person_enrich'}
--   {'provider': 'openai', 'model': 'gpt-4-turbo', 'tokens': 1500}
--   {'source': 'internal_kb', 'cache_hit': true}
--
-- Pricing Examples:
--   Apollo enrichment: $0.10/call
--   SerpAPI search: $0.005/search
--   OpenAI GPT-4: $0.03/1K tokens (varies)
--   RAG internal: $0.00 (free)
--   RAG external: $0.02/query (average)
