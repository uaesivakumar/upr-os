// services/researchAgent.js
import { pool } from '../utils/db.js'; // <<< FIX: Changed from '../../utils/db.js'
import { buildSerpQueries } from '../routes/enrich/lib/search.js';
import { searchSerpApi } from '../routes/enrich/lib/retriever.js';

/**
 * Parses SERP results to find relevant facts.
 * @param {Array<object>} results - An array of organic search results from SerpAPI.
 * @returns {{ recentNews: Array<object>, hiringIntent: object }}
 */
function parseResultsForFacts(results) {
  const recentNews = [];
  let hiringIntent = { isHiring: false, roles: [], source: null };

  const hiringKeywords = /\b(careers|jobs|hiring|we're hiring|join our team)\b/i;
  const newsKeywords = /\b(announces|launches|partners with|acquires|secures funding|releases)\b/i;

  for (const result of results) {
    const { title, link, snippet } = result;

    // Check for hiring intent
    if (hiringKeywords.test(title) || hiringKeywords.test(snippet)) {
      hiringIntent.isHiring = true;
      if (!hiringIntent.source) {
        hiringIntent.source = link;
      }
    }

    // Check for news
    if (newsKeywords.test(title) || newsKeywords.test(snippet)) {
      recentNews.push({
        headline: title,
        source: new URL(link).hostname,
        date: new Date().toISOString(), // NOTE: Real date parsing would require fetching the page
        url: link,
      });
    }
  }

  // Limit to top 3 news items to keep it concise
  return { recentNews: recentNews.slice(0, 3), hiringIntent };
}


/**
 * Orchestrates the research process for a given company using live web searches.
 *
 * @param {string} companyId - The UUID of the company to research.
 * @returns {Promise<object>} A structured "fact pack" about the company.
 */
export async function conductResearch(companyId) {
  console.log(`[ResearchAgent] Starting live research for company ID: ${companyId}`);

  // 1. Fetch company details from DB
  const companyRes = await pool.query(
    'SELECT name, domain FROM targeted_companies WHERE id = $1',
    [companyId]
  );
  if (companyRes.rowCount === 0) {
    throw new Error(`Company with ID ${companyId} not found.`);
  }
  const company = companyRes.rows[0];

  // 2. Build search queries
  const queries = buildSerpQueries(company.name, company.domain);
  console.log(`[ResearchAgent] Generated queries:`, queries);

  // 3. Execute searches via SerpAPI
  const searchPromises = queries.slice(0, 2).map(q => searchSerpApi(q));
  const searchResultsArrays = await Promise.all(searchPromises);
  const allResults = searchResultsArrays.flat();

  if (allResults.length === 0) {
    console.warn(`[ResearchAgent] No search results found for ${company.name}`);
    return {
      companyId,
      name: company.name,
      domain: company.domain,
      recentNews: [],
      hiringIntent: { isHiring: false, roles: [], source: null },
      timestamp: new Date().toISOString(),
    };
  }
  
  // 4. Parse results and structure the fact pack
  const { recentNews, hiringIntent } = parseResultsForFacts(allResults);

  const factPack = {
    companyId,
    name: company.name,
    domain: company.domain,
    recentNews,
    hiringIntent,
    timestamp: new Date().toISOString(),
  };

  console.log(`[ResearchAgent] Completed research for ${company.name}. Found ${recentNews.length} news items.`);
  return factPack;
}