-- Seed UAE Company Email Patterns (Week 1 Day 1-2)
-- Provides immediate cache hits for major UAE employers
-- Reduces cold-start costs and improves RAG similarity matching

BEGIN;

-- Insert 30+ major UAE company patterns
INSERT INTO email_patterns (
  domain, pattern, confidence, region, sector,
  company_size, last_source, mx_ok, catch_all
) VALUES
  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Banking & Finance
  -- ═══════════════════════════════════════════════════════════════════
  ('emiratesnbd.com', '{first}{l}', 0.92, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('adcb.com', '{first}{l}', 0.94, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('mashreqbank.com', '{first}.{last}', 0.91, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('dib.ae', '{first}{l}', 0.89, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('cbd.ae', '{first}.{last}', 0.87, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('fab.ae', '{first}{l}', 0.93, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('rakbank.ae', '{first}.{last}', 0.88, 'UAE', 'Banking', 'Medium', 'manual', true, false),
  ('nbd.com', '{first}{l}', 0.90, 'UAE', 'Banking', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Telecommunications
  -- ═══════════════════════════════════════════════════════════════════
  ('etisalat.ae', '{first}.{last}', 0.92, 'UAE', 'Telecom', 'Large', 'manual', true, false),
  ('du.ae', '{first}.{last}', 0.90, 'UAE', 'Telecom', 'Large', 'manual', true, false),
  ('e7.ae', '{first}.{last}', 0.88, 'UAE', 'Telecom', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Government & Semi-Government
  -- ═══════════════════════════════════════════════════════════════════
  ('adnoc.ae', '{first}.{last}', 0.95, 'UAE', 'Energy', 'Large', 'manual', true, false),
  ('adia.ae', '{first}.{last}', 0.93, 'UAE', 'Finance', 'Large', 'manual', true, false),
  ('mubadala.com', '{first}.{last}', 0.91, 'UAE', 'Investment', 'Large', 'manual', true, false),
  ('adq.ae', '{first}.{last}', 0.90, 'UAE', 'Investment', 'Large', 'manual', true, false),
  ('dewa.gov.ae', '{first}.{last}', 0.89, 'UAE', 'Utilities', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Airlines & Hospitality
  -- ═══════════════════════════════════════════════════════════════════
  ('etihad.ae', '{first}.{last}', 0.90, 'UAE', 'Aviation', 'Large', 'manual', true, false),
  ('emirates.com', '{first}.{last}', 0.94, 'UAE', 'Aviation', 'Large', 'manual', true, false),
  ('flydubai.com', '{first}.{last}', 0.89, 'UAE', 'Aviation', 'Large', 'manual', true, false),
  ('jumeirah.com', '{first}.{last}', 0.88, 'UAE', 'Hospitality', 'Large', 'manual', true, false),
  ('rotana.com', '{first}.{last}', 0.87, 'UAE', 'Hospitality', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Real Estate & Construction
  -- ═══════════════════════════════════════════════════════════════════
  ('emaar.com', '{first}.{last}', 0.89, 'UAE', 'Real Estate', 'Large', 'manual', true, false),
  ('damac.com', '{first}{l}', 0.86, 'UAE', 'Real Estate', 'Large', 'manual', true, false),
  ('aldar.com', '{first}.{last}', 0.90, 'UAE', 'Real Estate', 'Large', 'manual', true, false),
  ('nakheel.com', '{first}.{last}', 0.88, 'UAE', 'Real Estate', 'Large', 'manual', true, false),
  ('sobha.com', '{first}.{last}', 0.85, 'UAE', 'Real Estate', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Technology
  -- ═══════════════════════════════════════════════════════════════════
  ('careem.com', '{first}', 0.87, 'UAE', 'Technology', 'Large', 'manual', true, false),
  ('noon.com', '{first}.{last}', 0.85, 'UAE', 'Technology', 'Large', 'manual', true, false),
  ('bayut.com', '{first}.{last}', 0.84, 'UAE', 'Technology', 'Medium', 'manual', true, false),
  ('souq.com', '{first}.{last}', 0.86, 'UAE', 'Technology', 'Large', 'manual', true, false),
  ('dubizzle.com', '{first}.{last}', 0.83, 'UAE', 'Technology', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Retail
  -- ═══════════════════════════════════════════════════════════════════
  ('majidalduttaim.com', '{first}.{last}', 0.88, 'UAE', 'Retail', 'Large', 'manual', true, false),
  ('luluhypermarket.com', '{first}.{last}', 0.86, 'UAE', 'Retail', 'Large', 'manual', true, false),
  ('carrefouruae.com', '{first}.{last}', 0.85, 'UAE', 'Retail', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Healthcare
  -- ═══════════════════════════════════════════════════════════════════
  ('seha.ae', '{first}.{last}', 0.89, 'UAE', 'Healthcare', 'Large', 'manual', true, false),
  ('mediclinic.ae', '{first}.{last}', 0.87, 'UAE', 'Healthcare', 'Large', 'manual', true, false),
  ('healthpoint.ae', '{first}.{last}', 0.86, 'UAE', 'Healthcare', 'Medium', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Education
  -- ═══════════════════════════════════════════════════════════════════
  ('adu.ac.ae', '{first}.{last}', 0.90, 'UAE', 'Education', 'Large', 'manual', true, false),
  ('uaeu.ac.ae', '{first}.{last}', 0.91, 'UAE', 'Education', 'Large', 'manual', true, false),
  ('aus.edu', '{first}.{last}', 0.89, 'UAE', 'Education', 'Large', 'manual', true, false),
  ('zu.ac.ae', '{first}.{last}', 0.88, 'UAE', 'Education', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- UAE Logistics & Transport
  -- ═══════════════════════════════════════════════════════════════════
  ('dpworld.com', '{first}.{last}', 0.90, 'UAE', 'Logistics', 'Large', 'manual', true, false),
  ('aramex.com', '{first}.{last}', 0.89, 'UAE', 'Logistics', 'Large', 'manual', true, false),

  -- ═══════════════════════════════════════════════════════════════════
  -- International Banks (UAE branches)
  -- ═══════════════════════════════════════════════════════════════════
  ('hsbc.ae', '{first}.{last}', 0.89, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('sc.com', '{first}.{last}', 0.92, 'Global', 'Banking', 'Large', 'manual', true, false),
  ('citibank.ae', '{first}.{last}', 0.90, 'UAE', 'Banking', 'Large', 'manual', true, false),
  ('barclays.ae', '{first}.{last}', 0.88, 'UAE', 'Banking', 'Large', 'manual', true, false)

ON CONFLICT (domain) DO UPDATE SET
  pattern = EXCLUDED.pattern,
  confidence = EXCLUDED.confidence,
  region = EXCLUDED.region,
  sector = EXCLUDED.sector,
  company_size = EXCLUDED.company_size,
  last_source = EXCLUDED.last_source,
  mx_ok = EXCLUDED.mx_ok,
  catch_all = EXCLUDED.catch_all,
  updated_at = now();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

-- Show seeded patterns
SELECT
  'Total patterns seeded' as metric,
  COUNT(*)::text as value
FROM email_patterns
WHERE last_source = 'manual'

UNION ALL

SELECT
  'UAE Banking patterns',
  COUNT(*)::text
FROM email_patterns
WHERE region = 'UAE' AND sector = 'Banking'

UNION ALL

SELECT
  'Average confidence',
  ROUND(AVG(confidence), 3)::text
FROM email_patterns
WHERE last_source = 'manual'

UNION ALL

SELECT
  'Pattern distribution',
  pattern || ': ' || COUNT(*)::text
FROM email_patterns
WHERE last_source = 'manual'
GROUP BY pattern
ORDER BY COUNT(*) DESC
LIMIT 5;

-- Show sample patterns by sector
SELECT
  sector,
  COUNT(*) as pattern_count,
  STRING_AGG(DISTINCT pattern, ', ') as patterns_used,
  ROUND(AVG(confidence), 3) as avg_confidence
FROM email_patterns
WHERE last_source = 'manual'
GROUP BY sector
ORDER BY pattern_count DESC;

-- Specific verification: Emirates NBD
SELECT
  domain,
  pattern,
  confidence,
  sector,
  last_source,
  CASE
    WHEN pattern = '{first}{l}' THEN '✅ Correct pattern (FirstL format)'
    ELSE '⚠️  Unexpected pattern'
  END as verification
FROM email_patterns
WHERE domain = 'emiratesnbd.com';
