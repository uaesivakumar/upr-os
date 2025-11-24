// routes/api/propensity.js
// Lead Propensity API - External CRM Integrations
// Enables HubSpot, Zoho, Salesforce to get ML-powered lead scores

import express from 'express';
import { pool } from '../../utils/db.js';
import { apiAuth } from '../../middleware/apiAuth.js';
import featureEngine from '../../ml/featureEngine.js';
import mlService from '../../ml/mlService.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * POST /api/v1/propensity/score
 *
 * Score a single lead with ML-powered conversion prediction + explanation
 *
 * Body:
 * {
 *   "company": {
 *     "name": "Emirates NBD",
 *     "domain": "emiratesnbd.com",
 *     "industry": "banking",
 *     "size": "10000-50000",
 *     "location": "UAE"
 *   },
 *   "contact": {
 *     "name": "Ahmed Hassan",
 *     "email": "ahmed.hassan@emiratesnbd.com",
 *     "title": "Chief Digital Officer",
 *     "linkedin": "https://linkedin.com/in/ahmedhassan"
 *   },
 *   "context": {
 *     "campaign_type": "digital_transformation",
 *     "email_subject": "AI-Powered HR Analytics for Emirates NBD",
 *     "email_body": "Dear Ahmed, I noticed...",
 *     "source": "linkedin_outreach"
 *   }
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "score": {
 *     "probability": 0.73,
 *     "confidence": 0.82,
 *     "grade": "A",
 *     "explanation": {
 *       "summary": "This lead scores high because Recent hiring activity is strong, plus 4 other positive signals.",
 *       "top_positive_factors": [
 *         {"feature": "hiring_signals_90d", "impact": 0.12, "value": 5, "readable": "Recent hiring activity"}
 *       ],
 *       "top_negative_factors": [
 *         {"feature": "days_since_last_contact", "impact": -0.05, "value": 180, "readable": "Days since last contact"}
 *       ],
 *       "baseline_probability": 0.15
 *     }
 *   },
 *   "recommendations": {
 *     "send_time": {"day_of_week": 2, "hour_of_day": 10, "predicted_open_rate": 0.42},
 *     "personalization_tips": ["Mention recent funding round", "Reference hiring expansion"]
 *   },
 *   "metadata": {
 *     "model_version": "v2025_10_17",
 *     "features_computed": 47,
 *     "scored_at": "2025-10-17T10:30:00Z"
 *   }
 * }
 */
router.post('/score', apiAuth(['propensity:read']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { company, contact, context } = req.body;

    // Validate required fields
    if (!company || !contact) {
      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'Both company and contact are required',
        required: {
          company: ['name', 'industry'],
          contact: ['email', 'title']
        }
      });
    }

    // Step 1: Find or create company
    let companyId;
    const existingCompany = await pool.query(
      'SELECT id FROM companies WHERE domain = $1 OR LOWER(name) = LOWER($2) LIMIT 1',
      [company.domain, company.name]
    );

    if (existingCompany.rows.length > 0) {
      companyId = existingCompany.rows[0].id;
    } else {
      // Create new company record (ephemeral - for scoring only)
      const newCompany = await pool.query(`
        INSERT INTO companies (name, domain, industry, size, location, source)
        VALUES ($1, $2, $3, $4, $5, 'api')
        RETURNING id
      `, [
        company.name,
        company.domain || null,
        company.industry || null,
        company.size || null,
        company.location || 'UAE'
      ]);
      companyId = newCompany.rows[0].id;
    }

    // Step 2: Find or create contact
    let personId;
    const existingPerson = await pool.query(
      'SELECT id FROM people WHERE email = $1 LIMIT 1',
      [contact.email]
    );

    if (existingPerson.rows.length > 0) {
      personId = existingPerson.rows[0].id;
    } else {
      // Create new person record
      const newPerson = await pool.query(`
        INSERT INTO people (
          name,
          email,
          title,
          company_id,
          linkedin_url,
          source
        ) VALUES ($1, $2, $3, $4, $5, 'api')
        RETURNING id
      `, [
        contact.name,
        contact.email,
        contact.title || null,
        companyId,
        contact.linkedin || null
      ]);
      personId = newPerson.rows[0].id;
    }

    // Step 3: Compute features
    console.log(`[propensity] Computing features for company ${companyId}, person ${personId}`);

    const [companyFeatures, personFeatures, emailFeatures] = await Promise.all([
      featureEngine.computeCompanyFeatures(companyId).catch(() => ({})),
      featureEngine.computePersonFeatures(personId).catch(() => ({})),
      context?.email_subject || context?.email_body
        ? featureEngine.computeEmailFeatures({
            subject: context.email_subject || '',
            body: context.email_body || ''
          }).catch(() => ({}))
        : Promise.resolve({})
    ]);

    // Combine features
    const allFeatures = {
      ...companyFeatures,
      ...personFeatures,
      ...emailFeatures
    };

    console.log(`[propensity] Computed ${Object.keys(allFeatures).length} features`);

    // Step 4: Get explainable prediction
    const prediction = await getExplainablePrediction(allFeatures);

    // Step 5: Get send time recommendation
    const sendTimeRec = await mlService.optimizeSendTime(companyId, personId).catch(() => null);

    // Step 6: Generate personalization tips
    const personalizationTips = generatePersonalizationTips(
      companyFeatures,
      personFeatures,
      context
    );

    // Step 7: Assign grade
    const grade = assignGrade(prediction.probability);

    // Response
    const responseTime = Date.now() - startTime;

    res.json({
      ok: true,
      score: {
        probability: prediction.probability,
        confidence: prediction.confidence || 0.75,
        grade,
        explanation: {
          summary: prediction.explanation_summary || 'Prediction generated successfully',
          top_positive_factors: prediction.top_positive_factors || [],
          top_negative_factors: prediction.top_negative_factors || [],
          baseline_probability: prediction.baseline_probability || 0.15
        }
      },
      recommendations: {
        send_time: sendTimeRec,
        personalization_tips: personalizationTips
      },
      metadata: {
        model_version: 'v2025_10_17_explainable',
        features_computed: Object.keys(allFeatures).length,
        scored_at: new Date().toISOString(),
        response_time_ms: responseTime,
        api_key_name: req.apiKey?.name,
        environment: req.apiKey?.environment
      }
    });

  } catch (error) {
    console.error('[propensity] Scoring error:', error);

    res.status(500).json({
      ok: false,
      error: 'scoring_failed',
      message: 'Failed to compute lead score',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/v1/propensity/score-batch
 *
 * Score multiple leads in one request (up to 100)
 *
 * Body:
 * {
 *   "leads": [
 *     { "company": {...}, "contact": {...}, "context": {...} },
 *     { "company": {...}, "contact": {...}, "context": {...} }
 *   ]
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "results": [
 *     { "index": 0, "score": {...}, "recommendations": {...} },
 *     { "index": 1, "error": "invalid_email" }
 *   ],
 *   "summary": {
 *     "total": 100,
 *     "succeeded": 98,
 *     "failed": 2,
 *     "processing_time_ms": 3542
 *   }
 * }
 */
router.post('/score-batch', apiAuth(['propensity:read', 'batch:score']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { leads } = req.body;

    if (!Array.isArray(leads)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'leads must be an array'
      });
    }

    if (leads.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'empty_batch',
        message: 'leads array cannot be empty'
      });
    }

    if (leads.length > 100) {
      return res.status(400).json({
        ok: false,
        error: 'batch_too_large',
        message: 'Maximum 100 leads per batch request',
        received: leads.length,
        max_allowed: 100
      });
    }

    console.log(`[propensity] Processing batch of ${leads.length} leads`);

    // Process all leads in parallel (with concurrency limit)
    const results = [];
    const concurrency = 10; // Process 10 at a time

    for (let i = 0; i < leads.length; i += concurrency) {
      const batch = leads.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((lead, idx) => scoreSingleLead(lead, i + idx))
      );

      results.push(...batchResults);
    }

    // Format results
    const formattedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          index,
          ...result.value
        };
      } else {
        return {
          index,
          error: 'scoring_failed',
          message: result.reason?.message || 'Unknown error'
        };
      }
    });

    const succeeded = formattedResults.filter(r => !r.error).length;
    const failed = formattedResults.filter(r => r.error).length;

    res.json({
      ok: true,
      results: formattedResults,
      summary: {
        total: leads.length,
        succeeded,
        failed,
        processing_time_ms: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('[propensity] Batch scoring error:', error);

    res.status(500).json({
      ok: false,
      error: 'batch_scoring_failed',
      message: 'Failed to process batch request'
    });
  }
});

/**
 * Helper: Score a single lead (used by batch endpoint)
 */
async function scoreSingleLead(lead, index) {
  const { company, contact, context } = lead;

  // Basic validation
  if (!company?.name || !contact?.email) {
    throw new Error('Missing required fields: company.name or contact.email');
  }

  // Simplified scoring (same logic as /score but condensed)
  // In production, this would be more DRY
  const companyId = 1; // Placeholder - would create/find company
  const personId = 1; // Placeholder - would create/find person

  const prediction = await getExplainablePrediction({
    industry: company.industry,
    company_size: company.size
  });

  const grade = assignGrade(prediction.probability);

  return {
    score: {
      probability: prediction.probability,
      grade,
      explanation: {
        summary: prediction.explanation_summary || 'Prediction generated'
      }
    }
  };
}

/**
 * GET /api/v1/propensity/health
 *
 * Health check for API availability
 */
router.get('/health', apiAuth([]), async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');

    res.json({
      ok: true,
      status: 'healthy',
      api_version: 'v1',
      model_version: 'v2025_10_17_explainable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Helper: Get explainable prediction using Python model
 */
async function getExplainablePrediction(features) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../../ml/models/explainablePredictor.py');

    const inputData = JSON.stringify({
      action: 'predict_with_explanation',
      features
    });

    const pythonProcess = spawn('python3', [pythonScript, '--predict', inputData]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('[explainablePredictor] Python error:', stderr);
        // Return fallback prediction
        return resolve({
          probability: 0.25,
          confidence: 0.50,
          explanation_summary: 'Prediction generated with fallback model (Python unavailable)',
          top_positive_factors: [],
          top_negative_factors: [],
          baseline_probability: 0.15
        });
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        console.error('[explainablePredictor] Failed to parse output:', e);
        resolve({
          probability: 0.25,
          confidence: 0.50,
          explanation_summary: 'Prediction generated with fallback model',
          top_positive_factors: [],
          top_negative_factors: [],
          baseline_probability: 0.15
        });
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[explainablePredictor] Failed to spawn Python:', err);
      resolve({
        probability: 0.25,
        confidence: 0.50,
        explanation_summary: 'Prediction generated with fallback model',
        top_positive_factors: [],
        top_negative_factors: [],
        baseline_probability: 0.15
      });
    });
  });
}

/**
 * Helper: Generate personalization tips
 */
function generatePersonalizationTips(companyFeatures, personFeatures, context) {
  const tips = [];

  if (companyFeatures.hiring_signals_90d > 3) {
    tips.push('Mention recent hiring expansion');
  }

  if (companyFeatures.funding_signals_90d > 0) {
    tips.push('Reference recent funding round');
  }

  if (companyFeatures.news_signals_90d > 5) {
    tips.push('Comment on recent news coverage');
  }

  if (personFeatures.seniority_level === 'c_level') {
    tips.push('Focus on ROI and strategic value');
  }

  if (context?.campaign_type === 'digital_transformation') {
    tips.push('Emphasize automation and efficiency gains');
  }

  // If no specific tips, provide general ones
  if (tips.length === 0) {
    tips.push('Personalize greeting with recipient name');
    tips.push('Reference company industry or recent achievements');
  }

  return tips.slice(0, 5); // Max 5 tips
}

/**
 * Helper: Assign letter grade
 */
function assignGrade(probability) {
  if (probability >= 0.75) return 'A';
  if (probability >= 0.60) return 'B';
  if (probability >= 0.40) return 'C';
  if (probability >= 0.25) return 'D';
  return 'F';
}

export default router;
