/**
 * AI Sales Manager Welcome Dashboard
 * Provides intelligent, contextual welcome messages and action items
 */

import express from 'express';
import pg from 'pg';
const { Pool } = pg;

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /api/ai-welcome/dashboard
 * Returns personalized welcome message and actionable insights
 */
router.get('/dashboard', async (req, res) => {
  try {
    const username = req.user?.username || 'there';

    // Gather intelligence from database
    const intelligence = await gatherIntelligence();

    // Generate AI welcome message based on context
    const welcomeMessage = generateWelcomeMessage(username, intelligence);

    // Generate prioritized action items
    const actionItems = generateActionItems(intelligence);

    // Get agent insights
    const agentInsights = await getAgentInsights();

    res.json({
      ok: true,
      welcome: {
        greeting: welcomeMessage.greeting,
        message: welcomeMessage.message,
        tone: welcomeMessage.tone, // 'urgent', 'celebrate', 'neutral', 'encouraging'
        timestamp: new Date().toISOString()
      },
      actionItems: actionItems,
      insights: agentInsights,
      stats: intelligence
    });

  } catch (error) {
    console.error('Error generating AI welcome:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to generate welcome dashboard'
    });
  }
});

/**
 * Gather all relevant intelligence from database
 */
async function gatherIntelligence() {
  const queries = {
    // New hiring signals in last 7 days
    newHiringSignals: `
      SELECT COUNT(*) as count,
             array_agg(DISTINCT company_name ORDER BY company_name LIMIT 5) as companies
      FROM hiring_signals
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `,

    // Hot hiring signals
    hotHiringSignals: `
      SELECT COUNT(*) as count,
             array_agg(DISTINCT company_name ORDER BY company_name LIMIT 5) as companies
      FROM v_hiring_hot
    `,

    // New leads this week
    newLeads: `
      SELECT COUNT(*) as count
      FROM hr_leads
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `,

    // High priority leads (score > 80)
    highPriorityLeads: `
      SELECT COUNT(*) as count,
             array_agg(company_name ORDER BY lead_score DESC LIMIT 3) as top_companies
      FROM hr_leads
      WHERE lead_score > 80
    `,

    // Pending outreach generations
    pendingOutreach: `
      SELECT COUNT(*) as count
      FROM outreach_generations
      WHERE created_at >= NOW() - INTERVAL '48 hours'
    `,

    // Agent decisions today
    agentActivity: `
      SELECT COUNT(*) as count,
             COUNT(DISTINCT agent_type) as active_agents
      FROM agent_core.agent_decisions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `,

    // Leads needing attention (no activity in 7 days)
    staleLeads: `
      SELECT COUNT(*) as count
      FROM hr_leads
      WHERE updated_at < NOW() - INTERVAL '7 days'
      AND status NOT IN ('closed', 'converted')
    `
  };

  const results = {};

  for (const [key, query] of Object.entries(queries)) {
    try {
      const result = await pool.query(query);
      results[key] = result.rows[0];
    } catch (error) {
      console.error(`Error running query for ${key}:`, error.message);
      results[key] = { count: 0 };
    }
  }

  return results;
}

/**
 * Generate contextual welcome message based on intelligence
 */
function generateWelcomeMessage(username, intelligence) {
  const hour = new Date().getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  if (hour >= 17) timeGreeting = 'Good evening';

  // Determine most important thing to highlight
  const newHiring = parseInt(intelligence.newHiringSignals?.count || 0);
  const hotHiring = parseInt(intelligence.hotHiringSignals?.count || 0);
  const highPriority = parseInt(intelligence.highPriorityLeads?.count || 0);
  const pendingOutreach = parseInt(intelligence.pendingOutreach?.count || 0);
  const staleLeads = parseInt(intelligence.staleLeads?.count || 0);
  const agentDecisions = parseInt(intelligence.agentActivity?.count || 0);

  let message, tone;

  // Priority 1: Hot hiring signals (urgent)
  if (hotHiring > 0) {
    const companies = intelligence.hotHiringSignals.companies?.slice(0, 3).join(', ') || 'companies';
    message = `🔥 Great news! I've found ${hotHiring} hot hiring signal${hotHiring > 1 ? 's' : ''} from ${companies}. These companies are actively expanding - perfect timing to reach out!`;
    tone = 'urgent';
  }
  // Priority 2: New hiring signals (encouraging)
  else if (newHiring > 0) {
    const companies = intelligence.newHiringSignals.companies?.slice(0, 2).join(' and ') || 'companies';
    message = `📈 I discovered ${newHiring} new hiring signal${newHiring > 1 ? 's' : ''} this week from ${companies}. Ready to action them?`;
    tone = 'encouraging';
  }
  // Priority 3: High priority leads (celebrate)
  else if (highPriority > 0) {
    const topCompanies = intelligence.highPriorityLeads.top_companies?.slice(0, 2).join(' and ') || 'companies';
    message = `⭐ You have ${highPriority} high-priority lead${highPriority > 1 ? 's' : ''} scoring above 80! Top prospects: ${topCompanies}. Let's close them!`;
    tone = 'celebrate';
  }
  // Priority 4: Pending outreach (action needed)
  else if (pendingOutreach > 0) {
    message = `✉️ You have ${pendingOutreach} outreach message${pendingOutreach > 1 ? 's' : ''} ready to send. Want to review and send them now?`;
    tone = 'neutral';
  }
  // Priority 5: Stale leads (gentle reminder)
  else if (staleLeads > 0) {
    message = `⏰ ${staleLeads} lead${staleLeads > 1 ? 's have' : ' has'} been inactive for a week. Time to re-engage and revive the conversation!`;
    tone = 'neutral';
  }
  // Priority 6: Agent activity (informational)
  else if (agentDecisions > 0) {
    message = `🤖 Our AI agents made ${agentDecisions} decision${agentDecisions > 1 ? 's' : ''} today, analyzing leads and optimizing your pipeline. Everything's running smoothly!`;
    tone = 'neutral';
  }
  // Default: Encouraging message
  else {
    message = `All systems running smoothly! Your pipeline is healthy. Ready to add new companies or review analytics?`;
    tone = 'neutral';
  }

  return {
    greeting: `${timeGreeting}, ${username}!`,
    message,
    tone
  };
}

/**
 * Generate prioritized action items
 */
function generateActionItems(intelligence) {
  const items = [];

  const hotHiring = parseInt(intelligence.hotHiringSignals?.count || 0);
  const newHiring = parseInt(intelligence.newHiringSignals?.count || 0);
  const highPriority = parseInt(intelligence.highPriorityLeads?.count || 0);
  const pendingOutreach = parseInt(intelligence.pendingOutreach?.count || 0);
  const staleLeads = parseInt(intelligence.staleLeads?.count || 0);

  // Action item 1: Hot hiring signals
  if (hotHiring > 0) {
    items.push({
      id: 'hot-hiring-signals',
      title: `Review ${hotHiring} Hot Hiring Signals`,
      description: `Companies actively expanding their teams - highest conversion potential`,
      priority: 'urgent',
      icon: '🔥',
      action: {
        type: 'navigate',
        route: '/hiring-signals?filter=hot'
      },
      count: hotHiring
    });
  }

  // Action item 2: High priority leads
  if (highPriority > 0) {
    items.push({
      id: 'high-priority-leads',
      title: `Action ${highPriority} High-Score Leads`,
      description: `Leads scoring above 80 - ready for personalized outreach`,
      priority: 'high',
      icon: '⭐',
      action: {
        type: 'navigate',
        route: '/leads/all?score_min=80'
      },
      count: highPriority
    });
  }

  // Action item 3: New hiring signals
  if (newHiring > 0 && hotHiring === 0) {
    items.push({
      id: 'new-hiring-signals',
      title: `Explore ${newHiring} New Hiring Signals`,
      description: `Fresh hiring activity detected this week`,
      priority: 'medium',
      icon: '📈',
      action: {
        type: 'navigate',
        route: '/hiring-signals?period=week'
      },
      count: newHiring
    });
  }

  // Action item 4: Pending outreach
  if (pendingOutreach > 0) {
    items.push({
      id: 'pending-outreach',
      title: `Send ${pendingOutreach} Pending Outreach`,
      description: `AI-generated personalized messages ready for review`,
      priority: 'medium',
      icon: '✉️',
      action: {
        type: 'navigate',
        route: '/outreach'
      },
      count: pendingOutreach
    });
  }

  // Action item 5: Stale leads
  if (staleLeads > 0) {
    items.push({
      id: 'stale-leads',
      title: `Re-engage ${staleLeads} Inactive Leads`,
      description: `Leads with no activity in 7+ days - time to follow up`,
      priority: 'low',
      icon: '⏰',
      action: {
        type: 'navigate',
        route: '/leads/all?stale=true'
      },
      count: staleLeads
    });
  }

  // Always add: Discover new companies
  items.push({
    id: 'discover-companies',
    title: 'Discover New Companies',
    description: 'Use RADAR to find more high-potential prospects',
    priority: 'low',
    icon: '🎯',
    action: {
      type: 'navigate',
      route: '/radar'
    }
  });

  return items.slice(0, 5); // Max 5 action items
}

/**
 * Get insights from AI agents
 */
async function getAgentInsights() {
  try {
    // Get recent agent decisions with recommendations
    const result = await pool.query(`
      SELECT
        agent_type,
        decision,
        reasoning,
        confidence,
        created_at
      FROM agent_core.agent_decisions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND reasoning IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 3
    `);

    return result.rows.map(row => ({
      agent: row.agent_type,
      insight: row.reasoning,
      confidence: row.confidence,
      timestamp: row.created_at
    }));

  } catch (error) {
    console.error('Error fetching agent insights:', error.message);
    return [];
  }
}

export default router;
