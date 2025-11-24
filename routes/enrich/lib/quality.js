// routes/enrich/lib/quality.js

/**
 * Calculates a quality score (0-1) for a company based on available data.
 * @param {object} company - The company object from LLM or data sources.
 * @param {Array} candidates - Array of potential leads found.
 * @returns {{score: number, explanation: Array<{label: string, value: number}>}}
 */
export function qualityScore(company = {}, candidates = []) {
  const explanation = [];
  let score = 0;
  const MAX_SCORE = 100;

  // --- Score based on company data completeness ---
  if (company.name) {
    score += 15;
    explanation.push({ label: "Company Name Identified", value: 15 });
  }
  if (company.website_url && company.domain) {
    score += 20;
    explanation.push({ label: "Website & Domain", value: 20 });
  }
  if (company.linkedin_url) {
    score += 15;
    explanation.push({ label: "LinkedIn Profile", value: 15 });
  }
  if (company.industry) {
    score += 10;
    explanation.push({ label: "Industry", value: 10 });
  }
  if (company.global_hq || company.uae_office) {
    score += 10;
    explanation.push({ label: "Headquarters", value: 10 });
  }
  if (company.size) {
    score += 10;
    explanation.push({ label: `Company Size (${company.size})`, value: 10 });
  }

  // --- Score based on UAE presence ---
  if (company.uae_office) {
    score += 10;
    explanation.push({ label: "Verified UAE Presence", value: 10 });
  }

  // --- FIX BUG 4: Score based on business signals (hiring, expansion, etc.) ---
  if (company.signals && Array.isArray(company.signals) && company.signals.length > 0) {
    score += 20;
    explanation.push({ label: `${company.signals.length} Active Signal${company.signals.length > 1 ? 's' : ''}`, value: 20 });
  }

  // --- FIX BUG 7: Score based on recent news articles ---
  if (company.recentNews && Array.isArray(company.recentNews) && company.recentNews.length > 0) {
    score += 10;
    explanation.push({ label: `${company.recentNews.length} Recent News Article${company.recentNews.length > 1 ? 's' : ''}`, value: 10 });
  } else if (company.recentNewsCount && company.recentNewsCount > 0) {
    score += 10;
    explanation.push({ label: `${company.recentNewsCount} Recent News Article${company.recentNewsCount > 1 ? 's' : ''}`, value: 10 });
  }

  // --- Score based on number of candidates found ---
  if (Array.isArray(candidates) && candidates.length > 0) {
    let candidateScore = 5; // Base score for finding any candidates
    if (candidates.length >= 5) candidateScore = 10;
    else if (candidates.length >= 2) candidateScore = 7;
    score += candidateScore;
    explanation.push({ label: `${candidates.length} Leads Found`, value: candidateScore });
  }

  const normalizedScore = Math.min(1, score / MAX_SCORE);

  return {
    score: normalizedScore,
    explanation,
  };
}

export default {
  qualityScore,
};

