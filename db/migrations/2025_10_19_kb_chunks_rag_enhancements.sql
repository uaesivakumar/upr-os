-- Phase 0: Create kb_chunks for RAG
-- Date: October 19, 2025
-- Purpose: Create knowledge base chunks table with tracking for data freshness, sources, costs, and usage analytics

BEGIN;

-- Create kb_chunks table with full RAG functionality
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  company_id UUID, -- Can reference targeted_companies or entities_company
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  source_type TEXT, -- 'apollo', 'linkedin', 'website', 'news', 'serp', 'reddit'
  data_type TEXT, -- 'org_info', 'person', 'signal', 'product', 'review'
  cost_usd NUMERIC(10,4) DEFAULT 0,
  freshness_score NUMERIC(3,2), -- 0.00 to 1.00 based on age
  last_seen_at TIMESTAMPTZ,
  hit_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indices for efficient querying
CREATE INDEX idx_kb_tenant ON kb_chunks(tenant_id);
CREATE INDEX idx_kb_company ON kb_chunks(company_id);
CREATE INDEX idx_kb_source ON kb_chunks(company_id, source_type, data_type);
CREATE INDEX idx_kb_freshness ON kb_chunks(company_id, freshness_score DESC, created_at DESC);
CREATE INDEX idx_kb_hit_count ON kb_chunks(hit_count DESC);

-- Vector similarity search index (HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_kb_embedding ON kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMIT;

-- Usage Notes:
--
-- source_type values:
--   'apollo'    - Data from Apollo.io API
--   'linkedin'  - Scraped from LinkedIn
--   'website'   - Company website content
--   'news'      - News articles/press releases
--   'serp'      - SerpAPI search results
--   'reddit'    - Reddit/social media mentions
--
-- data_type values:
--   'org_info'  - Company profile/description
--   'person'    - Person/contact information
--   'signal'    - Hiring, funding, expansion signals
--   'product'   - Product/service descriptions
--   'review'    - Customer reviews/testimonials
--
-- freshness_score calculation:
--   1.00 = Data from today
--   0.90 = Data from last 7 days
--   0.70 = Data from last 30 days
--   0.50 = Data from last 90 days
--   0.30 = Data older than 90 days
--
-- hit_count:
--   Incremented each time the chunk is retrieved in RAG
--   Used to identify most valuable/frequently accessed data
--   Helps optimize caching and reuse rate
