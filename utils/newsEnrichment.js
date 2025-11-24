// utils/newsEnrichment.js
// Using native fetch (Node.js 18+)

/**
 * Enrich company data with recent news articles
 * Uses SerpAPI Google News search
 *
 * @param {string} companyName - Company name
 * @param {string} domain - Company domain (optional)
 * @returns {Promise<Array>} Array of news articles or empty array
 */
async function enrichCompanyNews(companyName, domain = null) {
  if (!companyName) {
    console.warn('enrichCompanyNews: No company name provided');
    return [];
  }

  try {
    if (!process.env.SERPAPI_KEY) {
      console.warn('[News] SERPAPI_KEY not configured, skipping news enrichment');
      return [];
    }

    console.log(`[News] Fetching recent news for ${companyName}...`);

    const params = new URLSearchParams({
      q: companyName,
      api_key: process.env.SERPAPI_KEY,
      engine: 'google_news',
      gl: 'ae',        // UAE location
      hl: 'en',        // English language
      num: '5',        // Get top 5 news articles
      tbm: 'nws'       // News search
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const newsResults = data.news_results || [];

    // Transform news results into structured format
    const articles = newsResults.map(article => ({
      title: article.title || 'Untitled',
      source: article.source?.name || 'Unknown Source',
      date: article.date || null,
      link: article.link || null,
      snippet: article.snippet || article.title || '',
      thumbnail: article.thumbnail || null
    }));

    console.log(`[News] Found ${articles.length} news articles for ${companyName}`);
    return articles;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[News/SerpAPI] Timeout after 5s');
    } else if (error.message.includes('429')) {
      console.error('[News/SerpAPI] Rate limit exceeded');
    } else {
      console.error(`[News] Error fetching news for ${companyName}:`, error.message);
    }
    return [];
  }
}

/**
 * Enrich company data with news count only (lighter operation)
 * @param {string} companyName - Company name
 * @returns {Promise<number>} Count of recent news articles
 */
async function getCompanyNewsCount(companyName) {
  const articles = await enrichCompanyNews(companyName);
  return articles.length;
}

export {
  enrichCompanyNews,
  getCompanyNewsCount
};
