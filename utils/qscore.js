// utils/qscore.js
/**
 * Unified Q-Score computation (5-component model)
 * S73: Now loads weights from database with fallback to defaults
 *
 * @param {Object} company - Company data object
 * @param {Array} newsRows - Array of news/signal objects
 * @param {Object} weights - Optional weights (if already loaded from DB)
 * @param {Object} grades - Optional grade thresholds (if already loaded from DB)
 * @returns {Object} Q-Score with value, rating, and breakdown
 */

// Default weights (fallback if DB unavailable)
const DEFAULT_WEIGHTS = {
  domain: 25,      // Domain/website presence
  linkedin: 20,    // LinkedIn profile found
  signals: 20,     // Active hiring/expansion signals
  uae: 25,         // UAE presence (offices, locations)
  recency: 10      // Recent news/activity
};

// Default grade thresholds
const DEFAULT_GRADES = {
  A: { min: 80 },
  B: { min: 60 },
  C: { min: 40 },
  D: { min: 0 }
};

/**
 * Compute Q-Score with provided or default weights
 * For async DB loading, use computeQScoreAsync from companyPreview.js
 */
export function computeQScore(company, newsRows = [], weights = null, grades = null) {
  // Use provided weights or defaults
  const w = weights || DEFAULT_WEIGHTS;
  const g = grades || DEFAULT_GRADES;

  // Component 1: Domain presence
  const hasDomain = !!(
    company.domain ||
    company.website_url ||
    company.website
  );

  // Component 2: LinkedIn profile
  const hasLinkedIn = !!(
    company.linkedin_url ||
    company.linkedin_profile
  );

  // Component 3: Active signals
  const hasSignals = newsRows.some(n =>
    Array.isArray(n.tags) &&
    n.tags.some(t => /hiring|expansion|funding|growth/i.test(t))
  ) || (Array.isArray(company.signals) && company.signals.length > 0);

  // Component 4: UAE presence ⭐
  const hasUAEPresence = !!(
    company.uae_presence ||
    company.uae_locations ||
    (Array.isArray(company.locations) &&
     company.locations.some(l => /abu dhabi|dubai|sharjah|uae|united arab emirates/i.test(l)))
  );

  // Component 5: Recent news (+ bonus for freshness)
  let recencyScore = 0;
  if (Array.isArray(newsRows) && newsRows.length > 0) {
    recencyScore = w.recency || DEFAULT_WEIGHTS.recency;

    // BONUS: Extra 5 points for news within last 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const hasRecentNews = newsRows.some(n => {
      if (!n.published_at && !n.date) return false;
      const newsDate = new Date(n.published_at || n.date);
      return newsDate.getTime() > thirtyDaysAgo;
    });
    if (hasRecentNews) recencyScore += 5; // Bonus for fresh news
  }

  // Calculate total score
  const score = Math.min(100,
    (hasDomain ? (w.domain || DEFAULT_WEIGHTS.domain) : 0) +
    (hasLinkedIn ? (w.linkedin || DEFAULT_WEIGHTS.linkedin) : 0) +
    (hasSignals ? (w.signals || DEFAULT_WEIGHTS.signals) : 0) +
    (hasUAEPresence ? (w.uae || w.uaeContext || DEFAULT_WEIGHTS.uae) : 0) +
    recencyScore
  );

  // Determine letter rating using grade thresholds
  let rating = 'D';
  if (score >= (g.A?.min || DEFAULT_GRADES.A.min)) rating = 'A';
  else if (score >= (g.B?.min || DEFAULT_GRADES.B.min)) rating = 'B';
  else if (score >= (g.C?.min || DEFAULT_GRADES.C.min)) rating = 'C';

  return {
    value: score,
    rating,
    breakdown: {
      domain: hasDomain ? (w.domain || DEFAULT_WEIGHTS.domain) : 0,
      linkedin: hasLinkedIn ? (w.linkedin || DEFAULT_WEIGHTS.linkedin) : 0,
      signals: hasSignals ? (w.signals || DEFAULT_WEIGHTS.signals) : 0,
      uae_presence: hasUAEPresence ? (w.uae || w.uaeContext || DEFAULT_WEIGHTS.uae) : 0,
      recency: recencyScore
    },
    weightsUsed: w,
    // For backward compatibility
    score: score / 100 // Old format was 0-1 range
  };
}

/**
 * Grade a score value (convenience function)
 * @param {number} score - Score value (0-100)
 * @param {Object} grades - Optional grade thresholds from DB
 */
export function gradeFromScore(score, grades = null) {
  const g = grades || DEFAULT_GRADES;
  if (score >= (g.A?.min || 80)) return 'A';
  if (score >= (g.B?.min || 60)) return 'B';
  if (score >= (g.C?.min || 40)) return 'C';
  return 'D';
}

// Export defaults for reference
export const QSCORE_DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
export const QSCORE_DEFAULT_GRADES = DEFAULT_GRADES;
