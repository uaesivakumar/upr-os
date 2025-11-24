// utils/qscore.js
/**
 * Unified Q-Score computation (5-component model)
 * Matches the SerpAPI + LLM architecture scoring
 *
 * @param {Object} company - Company data object
 * @param {Array} newsRows - Array of news/signal objects
 * @returns {Object} Q-Score with value, rating, and breakdown
 */
export function computeQScore(company, newsRows = []) {
  // Configurable weights (UAE-focused)
  const WEIGHTS = {
    domain: 25,      // Domain/website presence
    linkedin: 20,    // LinkedIn profile found
    signals: 20,     // Active hiring/expansion signals
    uae: 25,         // UAE presence (offices, locations)
    recency: 10      // Recent news/activity
  };

  // Component 1: Domain presence (25 points)
  const hasDomain = !!(
    company.domain ||
    company.website_url ||
    company.website
  );

  // Component 2: LinkedIn profile (20 points)
  const hasLinkedIn = !!(
    company.linkedin_url ||
    company.linkedin_profile
  );

  // Component 3: Active signals (20 points)
  const hasSignals = newsRows.some(n =>
    Array.isArray(n.tags) &&
    n.tags.some(t => /hiring|expansion|funding|growth/i.test(t))
  ) || (Array.isArray(company.signals) && company.signals.length > 0);

  // Component 4: UAE presence (25 points) ⭐
  const hasUAEPresence = !!(
    company.uae_presence ||
    company.uae_locations ||
    (Array.isArray(company.locations) &&
     company.locations.some(l => /abu dhabi|dubai|sharjah|uae|united arab emirates/i.test(l)))
  );

  // Component 5: Recent news (10 points + bonus for freshness)
  let recencyScore = 0;
  if (Array.isArray(newsRows) && newsRows.length > 0) {
    recencyScore = WEIGHTS.recency;

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
    (hasDomain ? WEIGHTS.domain : 0) +
    (hasLinkedIn ? WEIGHTS.linkedin : 0) +
    (hasSignals ? WEIGHTS.signals : 0) +
    (hasUAEPresence ? WEIGHTS.uae : 0) +
    recencyScore
  );

  // Determine letter rating
  let rating = 'D';
  if (score >= 80) rating = 'A';
  else if (score >= 60) rating = 'B';
  else if (score >= 40) rating = 'C';

  return {
    value: score,
    rating,
    breakdown: {
      domain: hasDomain ? WEIGHTS.domain : 0,
      linkedin: hasLinkedIn ? WEIGHTS.linkedin : 0,
      signals: hasSignals ? WEIGHTS.signals : 0,
      uae_presence: hasUAEPresence ? WEIGHTS.uae : 0,
      recency: recencyScore
    },
    // For backward compatibility
    score: score / 100 // Old format was 0-1 range
  };
}

/**
 * Grade a score value (convenience function)
 */
export function gradeFromScore(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}
