-- Intelligence Reports - LLM-Powered Company Summaries
-- Stores AI-generated company intelligence reports

CREATE TABLE IF NOT EXISTS intelligence_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID REFERENCES targeted_companies(id) ON DELETE CASCADE,

  -- Report content
  summary TEXT NOT NULL,
  insights JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  raw_data JSONB,

  -- Metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'auto', -- 'auto' or user_id

  -- Quality metrics
  completeness_score NUMERIC(3,2) -- 0.00-1.00
);

CREATE INDEX idx_intelligence_reports_company ON intelligence_reports(company_id);
CREATE INDEX idx_intelligence_reports_generated ON intelligence_reports(generated_at DESC);

-- Note: One report per company per day constraint enforced in application layer
-- (Cannot use DATE() in unique index as it's not IMMUTABLE in PostgreSQL)

COMMENT ON TABLE intelligence_reports IS 'AI-generated company intelligence summaries using LLM';
COMMENT ON COLUMN intelligence_reports.summary IS 'Full text summary with structured sections';
COMMENT ON COLUMN intelligence_reports.insights IS 'Array of key insights: [{type, insight, relevance, confidence}]';
COMMENT ON COLUMN intelligence_reports.recommendations IS 'Array of recommendations: [{category, recommendation, reasoning, priority}]';
COMMENT ON COLUMN intelligence_reports.completeness_score IS 'Data completeness (0.0-1.0): higher = more intel available';
