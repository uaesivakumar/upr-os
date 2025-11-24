// services/factChecker.js

// --- Source Reliability Tiers ---
// We assign higher trust to well-known, reputable news and financial sources.
const TRUST_TIERS = {
  TIER_1: {
    score: 0.9,
    sources: new Set([
      'reuters.com', 'bloomberg.com', 'wsj.com', 'nytimes.com', 
      'forbes.com', 'techcrunch.com', 'gulfnews.com', 'khaleejtimes.com'
    ])
  },
  TIER_2: {
    score: 0.6,
    sources: new Set([
      'zawya.com', 'arabianbusiness.com', 'thenationalnews.com', 
      'prnewswire.com', 'globenewswire.com'
    ])
  },
  // Default score for any other source
  TIER_3_DEFAULT_SCORE: 0.4
};


/**
 * Assigns a confidence score to a fact based on its source domain.
 * @param {string} sourceUrl - The URL of the fact's source.
 * @param {string} companyDomain - The official domain of the company being researched.
 * @returns {number} A confidence score between 0.0 and 1.0.
 */
function scoreSourceConfidence(sourceUrl, companyDomain) {
  if (!sourceUrl) return 0.0;
  
  let sourceHost;
  try {
    sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 0.0;
  }

  // A fact from the company's own website is highly reliable.
  if (sourceHost === companyDomain) {
    return 0.95;
  }

  if (TRUST_TIERS.TIER_1.sources.has(sourceHost)) {
    return TRUST_TIERS.TIER_1.score;
  }
  if (TRUST_TIERS.TIER_2.sources.has(sourceHost)) {
    return TRUST_TIERS.TIER_2.score;
  }

  return TRUST_TIERS.TIER_3_DEFAULT_SCORE;
}


/**
 * Verifies the facts gathered by the researchAgent by assigning confidence scores.
 * Future enhancements could include LLM-based content analysis to confirm the fact
 * is actually present and supported by the source page.
 *
 * @param {object} factPack - The raw fact pack from the researchAgent.
 * @returns {Promise<object>} The fact pack with added verification and confidence scores.
 */
export async function verifyFacts(factPack) {
  console.log(`[FactChecker] Verifying facts for company: ${factPack.name}`);

  const companyDomain = factPack.domain;
  let totalScore = 0;
  let scoredFactsCount = 0;

  // Verify recent news items
  const verifiedNews = factPack.recentNews.map(newsItem => {
    const confidence = scoreSourceConfidence(newsItem.url, companyDomain);
    totalScore += confidence;
    scoredFactsCount++;
    return { ...newsItem, confidence };
  });

  // Verify hiring intent
  const hiringConfidence = scoreSourceConfidence(factPack.hiringIntent.source, companyDomain);
  if (factPack.hiringIntent.isHiring) {
    totalScore += hiringConfidence;
    scoredFactsCount++;
  }
  const verifiedHiringIntent = {
    ...factPack.hiringIntent,
    confidence: hiringConfidence
  };

  const overallConfidence = scoredFactsCount > 0 ? totalScore / scoredFactsCount : 0;

  const verifiedFactPack = {
    ...factPack,
    recentNews: verifiedNews,
    hiringIntent: verifiedHiringIntent,
    isVerified: true,
    overallConfidence: parseFloat(overallConfidence.toFixed(2)),
    verificationTimestamp: new Date().toISOString(),
  };

  console.log(`[FactChecker] Verification complete for ${factPack.name}. Overall confidence: ${verifiedFactPack.overallConfidence}`);
  return verifiedFactPack;
}