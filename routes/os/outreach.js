/**
 * UPR OS Outreach Endpoint
 * Sprint 64: Unified OS API Layer
 * VS2.3: Persona-Specific AI Outreach
 *
 * POST /api/os/outreach
 *
 * Unified outreach generation with persona and channel support.
 * Now with AI-powered persona-specific outreach via SIVA.
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';
import { generateOutreachEmail } from '../../utils/llm.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES
} from './types.js';
// VS2.3: AI Outreach Service
import { generateAIOutreach } from '../../services/siva/aiOutreachService.js';

const router = express.Router();

/**
 * Outreach templates by channel and tone
 */
const OUTREACH_TEMPLATES = {
  email: {
    formal: {
      greeting: 'Dear {name}',
      closing: 'Best regards'
    },
    friendly: {
      greeting: 'Hi {name}',
      closing: 'Cheers'
    },
    direct: {
      greeting: '{name}',
      closing: 'Thanks'
    }
  },
  linkedin: {
    formal: {
      greeting: 'Dear {name}',
      closing: 'Best regards'
    },
    friendly: {
      greeting: 'Hi {name}',
      closing: 'Looking forward to connecting!'
    },
    direct: {
      greeting: 'Hi {name}',
      closing: 'Let me know!'
    }
  }
};

/**
 * POST /api/os/outreach
 *
 * Generate outreach content for leads
 *
 * Request Body:
 * {
 *   "leads": [
 *     {
 *       "id": "uuid",
 *       "name": "John Doe",
 *       "designation": "VP Sales",
 *       "company": "Acme Corp",
 *       "industry": "Banking"
 *     }
 *   ],
 *   "options": {
 *     "channel": "email",           // email | linkedin | call
 *     "tone": "friendly",           // formal | friendly | direct
 *     "template_id": "uuid",        // Optional: use existing template
 *     "personalization_level": "high",  // low | medium | high
 *     "profile": "banking_employee",
 *     "context": {                  // Additional context for personalization
 *       "campaign": "Q4 Outreach",
 *       "product": "Premium Radar"
 *     }
 *   }
 * }
 *
 * Response: OSResponse with generated outreach content
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const {
      leads = [],
      options = {}
    } = req.body;

    const {
      channel = 'email',
      tone = 'friendly',
      template_id,
      personalization_level = 'medium',
      profile = OS_PROFILES.DEFAULT,
      context = {},
      ai_outreach = false // VS2.3: Enable SIVA AI-powered outreach
    } = options;

    console.log(`[OS:Outreach] Request ${requestId} - ${leads.length} leads, Channel: ${channel}`);

    if (leads.length === 0) {
      return res.status(400).json(createOSError({
        error: 'At least one lead is required',
        code: 'OS_OUTREACH_INVALID_INPUT',
        endpoint: '/api/os/outreach',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Get template if provided
    let template = null;
    if (template_id) {
      const templateResult = await pool.query(
        'SELECT id, name, subject, body FROM email_templates WHERE id = $1',
        [template_id]
      );
      if (templateResult.rows.length > 0) {
        template = templateResult.rows[0];
      }
    }

    // Generate outreach for each lead
    const outreachResults = await Promise.all(leads.map(async (lead) => {
      try {
        let content;

        // VS2.3: Use SIVA AI outreach if enabled
        if (ai_outreach) {
          console.log(`[OS:Outreach] Using SIVA AI for ${lead.name}`);
          content = await generateAIOutreach(lead, {
            channel,
            tone,
            profile,
            personalization_level,
            context
          }, lead.score);
        } else {
          content = await generateOutreachContent(lead, {
            channel,
            tone,
            template,
            personalization_level,
            profile,
            context
          });
        }

        return {
          lead_id: lead.id,
          lead_name: lead.name,
          success: true,
          content
        };
      } catch (error) {
        console.error(`[OS:Outreach] Failed for lead ${lead.id}:`, error);
        return {
          lead_id: lead.id,
          lead_name: lead.name,
          success: false,
          error: error.message
        };
      }
    }));

    const successCount = outreachResults.filter(r => r.success).length;
    const executionTimeMs = Date.now() - startTime;

    const confidence = Math.round((successCount / leads.length) * 100);

    const response = createOSResponse({
      success: successCount > 0,
      data: {
        outreach: outreachResults,
        summary: {
          total: leads.length,
          successful: successCount,
          failed: leads.length - successCount
        },
        config: {
          channel,
          tone,
          personalization_level,
          used_template: !!template
        }
      },
      reason: `Generated outreach for ${successCount}/${leads.length} leads via ${channel}`,
      confidence,
      profile,
      endpoint: '/api/os/outreach',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Outreach] Request ${requestId} completed in ${executionTimeMs}ms`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Outreach] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/outreach',
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OUTREACH_ERROR',
      endpoint: '/api/os/outreach',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * Generate outreach content for a single lead
 * @private
 */
async function generateOutreachContent(lead, options) {
  const { channel, tone, template, personalization_level, profile, context } = options;

  const templateConfig = OUTREACH_TEMPLATES[channel]?.[tone] || OUTREACH_TEMPLATES.email.friendly;

  // If template provided, populate it
  if (template) {
    return {
      channel,
      subject: populateTemplate(template.subject, lead, context),
      body: populateTemplate(template.body, lead, context),
      greeting: templateConfig.greeting.replace('{name}', lead.name?.split(' ')[0] || 'there'),
      closing: templateConfig.closing,
      personalization_notes: [],
      template_used: template.id
    };
  }

  // Generate AI-powered content
  if (personalization_level === 'high') {
    try {
      const aiContent = await generateOutreachEmail({
        name: lead.name,
        designation: lead.designation,
        company_name: lead.company,
        industry: lead.industry
      });

      if (aiContent && !aiContent.subject?.toLowerCase().includes('error')) {
        return {
          channel,
          subject: aiContent.subject,
          body: aiContent.body,
          greeting: templateConfig.greeting.replace('{name}', lead.name?.split(' ')[0] || 'there'),
          closing: templateConfig.closing,
          personalization_notes: aiContent.personalization_notes || [],
          ai_generated: true
        };
      }
    } catch (error) {
      console.warn('[OS:Outreach] AI generation failed, falling back to template');
    }
  }

  // Fallback: Generate based on profile
  const content = generateProfileBasedContent(lead, profile, channel, tone, context);

  return {
    channel,
    ...content,
    greeting: templateConfig.greeting.replace('{name}', lead.name?.split(' ')[0] || 'there'),
    closing: templateConfig.closing,
    personalization_notes: [],
    fallback_generated: true
  };
}

/**
 * Populate template with lead data
 * @private
 */
function populateTemplate(text, lead, context) {
  if (!text) return '';

  return text
    .replace(/\{\{lead_name\}\}/g, lead.name || '')
    .replace(/\{\{first_name\}\}/g, lead.name?.split(' ')[0] || '')
    .replace(/\{\{company_name\}\}/g, lead.company || '')
    .replace(/\{\{designation\}\}/g, lead.designation || '')
    .replace(/\{\{industry\}\}/g, lead.industry || '')
    .replace(/\{\{campaign\}\}/g, context.campaign || '')
    .replace(/\{\{product\}\}/g, context.product || 'our solution');
}

/**
 * Generate profile-based content
 * @private
 */
function generateProfileBasedContent(lead, profile, channel, tone, context) {
  const firstName = lead.name?.split(' ')[0] || 'there';
  const company = lead.company || 'your organization';
  const designation = lead.designation || 'professional';

  const profileContent = {
    [OS_PROFILES.BANKING_EMPLOYEE]: {
      subject: `Helping ${company} find top banking talent`,
      body: `I noticed ${company} is in the banking sector, and I wanted to reach out about how we're helping similar organizations identify and engage top talent.\n\nOur platform has helped banks reduce time-to-hire by 40% while improving candidate quality.\n\nWould you be open to a brief conversation about your current hiring challenges?`
    },
    [OS_PROFILES.BANKING_CORPORATE]: {
      subject: `Strategic partnership opportunity for ${company}`,
      body: `I'm reaching out regarding a strategic opportunity that's been helping corporate banking teams like ${company} drive better outcomes.\n\nOur enterprise intelligence platform provides real-time market signals that leading banks are using to identify opportunities before their competitors.\n\nI'd welcome the chance to share some relevant case studies.`
    },
    [OS_PROFILES.INSURANCE_INDIVIDUAL]: {
      subject: `Quick question, ${firstName}`,
      body: `I came across your profile and noticed your experience in insurance. I'm curious - how is ${company} currently approaching lead generation?\n\nWe've been working with insurance professionals to improve their prospecting efficiency, and I thought there might be some synergies worth exploring.`
    },
    [OS_PROFILES.RECRUITMENT_HIRING]: {
      subject: `${company} + Smart Hiring Signals`,
      body: `Given your role as ${designation} at ${company}, I thought you'd find this interesting.\n\nWe're helping recruitment teams discover hiring signals 2-3 weeks before jobs are posted publicly. This head start is transforming how top recruiters operate.\n\nCurious if this aligns with how you're thinking about competitive advantage?`
    },
    default: {
      subject: `Quick note for ${firstName} at ${company}`,
      body: `I wanted to reach out because I think there's an opportunity for ${company} to leverage better market intelligence.\n\nWe help organizations like yours discover actionable insights that drive growth.\n\nWould you be open to a brief chat to see if there's a fit?`
    }
  };

  const content = profileContent[profile] || profileContent.default;

  // Adjust tone
  if (tone === 'formal') {
    content.body = content.body.replace(/I'm /g, 'I am ').replace(/We're /g, 'We are ');
  } else if (tone === 'direct') {
    content.subject = content.subject.replace(/opportunity|strategic|Quick question/gi, 'Idea');
  }

  return content;
}

/**
 * POST /api/os/outreach/preview
 * Preview outreach without sending
 */
router.post('/preview', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { lead, options = {} } = req.body;

    if (!lead) {
      return res.status(400).json({
        success: false,
        error: 'Lead data is required for preview'
      });
    }

    const content = await generateOutreachContent(lead, {
      channel: options.channel || 'email',
      tone: options.tone || 'friendly',
      personalization_level: options.personalization_level || 'medium',
      profile: options.profile || OS_PROFILES.DEFAULT,
      context: options.context || {}
    });

    res.json({
      success: true,
      preview: content,
      execution_time_ms: Date.now() - startTime,
      request_id: requestId
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/outreach/templates
 * Get available outreach templates
 */
router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, subject, created_at FROM email_templates ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      templates: result.rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/outreach/health
 * Health check for outreach service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-outreach',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
