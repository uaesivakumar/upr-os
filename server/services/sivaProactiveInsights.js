/**
 * SIVA Proactive Insights Service
 * Sprint 76: Intelligent UI Integration
 *
 * Generates automatic insights for entities without waiting for user queries.
 * This is the "proactive brain" that surfaces intelligence unprompted.
 *
 * Key Features:
 * - Auto-analyze when user views an entity
 * - Generate "You should know" insights
 * - Priority-based insight ranking
 * - Caching for performance
 */

const { getCompanyContext, getTopCompaniesForAnalysis, DEMO_TENANT_ID } = require('./sivaEntityContext');

// SIVA Tools for analysis
const CompanyQualityTool = require('../siva-tools/CompanyQualityToolStandalone');
const TimingScoreTool = require('../siva-tools/TimingScoreToolStandalone');
const BankingProductMatchTool = require('../siva-tools/BankingProductMatchToolStandalone');

// Initialize tools
const companyQualityTool = new CompanyQualityTool();
const timingScoreTool = new TimingScoreTool();
const bankingProductMatchTool = new BankingProductMatchTool();

// Simple in-memory cache (5 min TTL)
const insightCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate proactive insights for a company
 * Called when user views a company card/page
 *
 * @param {Object} params - Parameters
 * @param {string} params.companyId - Company UUID
 * @param {string} params.companyName - Company name
 * @param {string} params.tenantId - Tenant ID
 * @returns {Promise<Object>} Proactive insights
 */
async function generateProactiveInsights({ companyId, companyName, tenantId }) {
  const cacheKey = `${companyId || companyName}-${tenantId}`;

  // Check cache
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.data, fromCache: true };
  }

  const startTime = Date.now();

  // Get full company context from DB
  const companyContext = await getCompanyContext({
    companyId,
    companyName,
    tenantId: tenantId || DEMO_TENANT_ID
  });

  if (!companyContext) {
    return {
      success: false,
      error: 'Company not found',
      insights: []
    };
  }

  // Run SIVA tools for analysis
  const [qualityResult, timingResult, productResult] = await Promise.all([
    runCompanyQualityAnalysis(companyContext),
    runTimingAnalysis(companyContext),
    runProductMatchAnalysis(companyContext)
  ]);

  // Generate prioritized insights
  const insights = generateInsightsList(companyContext, qualityResult, timingResult, productResult);

  // Build response
  const response = {
    success: true,
    company: {
      id: companyContext.id,
      name: companyContext.name,
      sector: companyContext.sector,
      location: companyContext.location,
      signal_count: companyContext.signal_count
    },
    scores: {
      quality: qualityResult.score,
      timing: timingResult.score,
      product_fit: productResult.score,
      overall: Math.round((qualityResult.score + timingResult.score + productResult.score) / 3)
    },
    insights,
    signals_summary: {
      total: companyContext.signal_count,
      types: companyContext.signal_types,
      latest_date: companyContext.latest_signal_date,
      avg_confidence: Math.round((companyContext.avg_confidence || 0.5) * 100)
    },
    recommended_actions: generateRecommendedActions(companyContext, qualityResult, timingResult, productResult),
    analysis_time_ms: Date.now() - startTime,
    generated_at: new Date().toISOString()
  };

  // Cache result
  insightCache.set(cacheKey, { data: response, timestamp: Date.now() });

  return response;
}

/**
 * Run CompanyQuality analysis
 */
async function runCompanyQualityAnalysis(companyContext) {
  try {
    const input = {
      company_name: companyContext.name,
      domain: companyContext.domain,
      industry: companyContext.industry || companyContext.sector,
      employee_count: companyContext.employee_count,
      revenue_usd: companyContext.revenue_usd,
      signal_count: companyContext.signal_count,
      confidence_score: companyContext.confidence_score
    };

    const result = await companyQualityTool.execute(input);
    return {
      score: result.quality_score || Math.round((companyContext.quality_score || 0.5) * 100),
      tier: result.quality_tier || companyContext.quality_tier || 'B',
      breakdown: result.breakdown || companyContext.quality_breakdown,
      raw: result
    };
  } catch (error) {
    console.error('[ProactiveInsights] CompanyQuality error:', error.message);
    return {
      score: Math.round((companyContext.quality_score || 0.5) * 100),
      tier: companyContext.quality_tier || 'B',
      error: error.message
    };
  }
}

/**
 * Run Timing analysis
 */
async function runTimingAnalysis(companyContext) {
  try {
    const input = {
      company_name: companyContext.name,
      industry: companyContext.industry || companyContext.sector,
      recent_funding: companyContext.signals?.some(s =>
        s.type?.toLowerCase().includes('funding')
      ) || false,
      hiring_signals: companyContext.signals?.filter(s =>
        s.type?.toLowerCase().includes('hiring')
      ) || [],
      news_sentiment: companyContext.hiring_likelihood_score >= 4 ? 'positive' : 'neutral'
    };

    const result = await timingScoreTool.execute(input);
    return {
      score: result.timing_score || Math.round((companyContext.confidence_score || 0.5) * 100),
      urgency: result.urgency || inferUrgency(companyContext),
      optimal_window: result.optimal_window || 'Next 2 weeks',
      raw: result
    };
  } catch (error) {
    console.error('[ProactiveInsights] TimingScore error:', error.message);
    return {
      score: Math.round((companyContext.confidence_score || 0.5) * 100),
      urgency: inferUrgency(companyContext),
      error: error.message
    };
  }
}

/**
 * Run Product Match analysis
 */
async function runProductMatchAnalysis(companyContext) {
  try {
    const input = {
      company_name: companyContext.name,
      industry: companyContext.industry || companyContext.sector,
      employee_count: companyContext.employee_count,
      revenue_usd: companyContext.revenue_usd,
      geography: companyContext.location,
      active_signals: companyContext.signal_types || []
    };

    const result = await bankingProductMatchTool.execute(input);
    return {
      score: result.match_score || 70,
      products: result.matched_products || inferProducts(companyContext),
      primary_product: result.primary_product || inferProducts(companyContext)[0],
      raw: result
    };
  } catch (error) {
    console.error('[ProactiveInsights] ProductMatch error:', error.message);
    return {
      score: 70,
      products: inferProducts(companyContext),
      error: error.message
    };
  }
}

/**
 * Generate prioritized insights list
 */
function generateInsightsList(company, quality, timing, products) {
  const insights = [];

  // High-priority signal insights
  if (company.signal_count >= 3) {
    insights.push({
      priority: 1,
      type: 'signal_strength',
      icon: '🎯',
      title: 'Strong Signal Cluster',
      message: `${company.signal_count} hiring signals detected. This company is actively expanding.`,
      action: 'Prioritize outreach within 48 hours'
    });
  }

  // Timing insights
  if (timing.score >= 80) {
    insights.push({
      priority: 1,
      type: 'timing',
      icon: '⏰',
      title: 'Optimal Timing Window',
      message: `Timing score: ${timing.score}/100. ${timing.urgency} urgency.`,
      action: 'Reach out this week for best conversion probability'
    });
  } else if (timing.score >= 60) {
    insights.push({
      priority: 2,
      type: 'timing',
      icon: '📅',
      title: 'Good Timing',
      message: `Timing score: ${timing.score}/100. Standard sales cycle applies.`,
      action: 'Schedule outreach within 2 weeks'
    });
  }

  // Quality insights
  if (quality.tier === 'A' || quality.score >= 80) {
    insights.push({
      priority: 1,
      type: 'quality',
      icon: '⭐',
      title: 'High-Quality Prospect',
      message: `Quality tier: ${quality.tier} (${quality.score}/100). Strong fit for your offerings.`,
      action: 'Prepare personalized outreach with senior stakeholder focus'
    });
  }

  // Product fit insights
  if (products.products && products.products.length > 0) {
    insights.push({
      priority: 2,
      type: 'product_fit',
      icon: '🏦',
      title: 'Product Recommendations',
      message: `Best fit: ${products.primary_product}. ${products.products.length} products match this profile.`,
      action: `Lead with ${products.primary_product} in your pitch`
    });
  }

  // Sector-specific insights
  const sector = (company.sector || '').toLowerCase();
  if (sector.includes('tech') || sector.includes('technology')) {
    insights.push({
      priority: 3,
      type: 'sector',
      icon: '💻',
      title: 'Tech Sector Dynamics',
      message: 'Technology companies typically have faster decision cycles and prefer digital-first engagement.',
      action: 'Use LinkedIn + email combo, emphasize innovation'
    });
  } else if (sector.includes('bank') || sector.includes('financial')) {
    insights.push({
      priority: 3,
      type: 'sector',
      icon: '🏛️',
      title: 'Financial Services Context',
      message: 'Financial sector requires compliance-aware messaging and longer relationship building.',
      action: 'Focus on trust, compliance, and long-term partnership'
    });
  }

  // Signal type specific insights
  const signalTypes = company.signal_types || [];
  if (signalTypes.some(t => t?.toLowerCase().includes('expansion'))) {
    insights.push({
      priority: 2,
      type: 'expansion',
      icon: '📈',
      title: 'Expansion Mode Detected',
      message: 'Company is in active expansion. They likely need banking infrastructure to support growth.',
      action: 'Position as growth enabler, not just service provider'
    });
  }

  // Sort by priority
  insights.sort((a, b) => a.priority - b.priority);

  return insights;
}

/**
 * Generate recommended actions based on analysis
 */
function generateRecommendedActions(company, quality, timing, products) {
  const actions = [];

  // Primary action based on overall scores
  const overallScore = Math.round((quality.score + timing.score + products.score) / 3);

  if (overallScore >= 75) {
    actions.push({
      priority: 'high',
      action: 'Immediate Outreach',
      description: 'This is a high-priority prospect. Initiate contact within 24-48 hours.',
      channel: 'LinkedIn + Email'
    });
  } else if (overallScore >= 50) {
    actions.push({
      priority: 'medium',
      action: 'Scheduled Outreach',
      description: 'Good prospect. Add to weekly outreach cadence.',
      channel: 'Email'
    });
  } else {
    actions.push({
      priority: 'low',
      action: 'Nurture',
      description: 'Lower priority. Add to long-term nurture sequence.',
      channel: 'Newsletter'
    });
  }

  // Secondary actions
  if (company.signal_count >= 2) {
    actions.push({
      priority: 'medium',
      action: 'Research Deeper',
      description: `Review ${company.signal_count} signals for personalization hooks.`,
      channel: 'Internal'
    });
  }

  if (products.primary_product) {
    actions.push({
      priority: 'medium',
      action: 'Prepare Pitch',
      description: `Customize pitch deck for ${products.primary_product}.`,
      channel: 'Internal'
    });
  }

  return actions;
}

/**
 * Helper: Infer urgency from company context
 */
function inferUrgency(company) {
  if (company.hiring_likelihood_score >= 4) return 'High';
  if (company.hiring_likelihood_score >= 3) return 'Medium';
  return 'Normal';
}

/**
 * Helper: Infer products from company profile
 */
function inferProducts(company) {
  const products = [];
  const signals = company.signal_types || [];
  const employees = company.employee_count || 100;

  if (signals.some(s => s?.toLowerCase().includes('hiring')) || employees > 50) {
    products.push('Payroll Banking');
  }
  if (employees > 200) {
    products.push('Corporate Treasury');
  }
  if (signals.some(s => s?.toLowerCase().includes('expansion'))) {
    products.push('Trade Finance');
  }
  if (products.length === 0) {
    products.push('Business Banking', 'Corporate Accounts');
  }

  return products;
}

/**
 * Get dashboard insights for multiple companies
 * For showing on the main dashboard
 */
async function getDashboardInsights(tenantId, limit = 5) {
  const topCompanies = await getTopCompaniesForAnalysis(tenantId || DEMO_TENANT_ID, limit);

  const insights = await Promise.all(
    topCompanies.map(company =>
      generateProactiveInsights({
        companyId: company.id,
        tenantId: tenantId || DEMO_TENANT_ID
      })
    )
  );

  return {
    success: true,
    companies: insights.filter(i => i.success),
    summary: {
      total_analyzed: insights.length,
      high_priority: insights.filter(i => i.scores?.overall >= 75).length,
      avg_score: Math.round(
        insights.reduce((sum, i) => sum + (i.scores?.overall || 0), 0) / insights.length
      )
    },
    generated_at: new Date().toISOString()
  };
}

/**
 * Clear cache for a company (after data update)
 */
function clearInsightCache(companyId) {
  for (const [key] of insightCache) {
    if (key.startsWith(companyId)) {
      insightCache.delete(key);
    }
  }
}

module.exports = {
  generateProactiveInsights,
  getDashboardInsights,
  clearInsightCache
};
