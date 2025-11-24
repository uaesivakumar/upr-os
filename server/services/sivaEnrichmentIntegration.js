/**
 * SIVA Enrichment Integration Service
 * Sprint 20 Task 4: Wire SIVA tools into Enrichment Engine
 *
 * Integrates SIVA STRICT Tools (2, 5, 7, 8) into the enrichment pipeline:
 * - Tool 2 (ContactTier): Classify contact tier (STRATEGIC/GROWTH/TRANSACTIONAL)
 * - Tool 5 (BankingProductMatch): Match to Emirates NBD products
 * - Tool 7 (OpeningContext): Generate personalized opening context
 * - Tool 8 (CompositeScore): Generate unified Q-Score (0-100) and lead tier (HOT/WARM/COLD)
 *
 * Integration points:
 * 1. After runEnrichmentChain returns enriched contact data
 * 2. Before saving to hr_leads table
 * 3. Replace calculateLeadScore with CompositeScoreTool
 */

const ContactTierTool = require('../siva-tools/ContactTierToolStandalone');
const BankingProductMatchTool = require('../siva-tools/BankingProductMatchToolStandalone');
const OpeningContextTool = require('../siva-tools/OpeningContextToolStandalone');
const CompositeScoreTool = require('../siva-tools/CompositeScoreToolStandalone');
const agentPersistence = require('./agentPersistence');
const Sentry = require('@sentry/node');

class SivaEnrichmentIntegration {
  constructor() {
    // Initialize SIVA STRICT tools
    this.contactTierTool = new ContactTierTool();
    this.bankingProductMatchTool = new BankingProductMatchTool();
    this.openingContextTool = new OpeningContextTool();
    this.compositeScoreTool = new CompositeScoreTool();
  }

  /**
   * Process enriched contacts through SIVA STRICT tools
   *
   * @param {Object} enrichedContact - Enriched contact from Apollo/Hunter/etc
   * @param {Object} companyData - Company data (from discovery or database)
   * @param {Object} options - Processing options
   * @param {string} options.sessionId - Session ID for grouping decisions
   * @param {string} options.tenantId - Tenant ID
   * @param {string} options.signalId - Signal ID (if from discovery)
   * @returns {Promise<Object>} Enhanced lead with SIVA scoring
   */
  async processEnrichedContact(enrichedContact, companyData = {}, options = {}) {
    const { sessionId = null, tenantId = null, signalId = null } = options;
    const startTime = Date.now();

    console.log(`[SIVA Enrichment] Processing contact ${enrichedContact.email} through STRICT tools...`);

    try {
      const sivaEnrichment = {
        tools: {},
        passed: true,
        filterReason: null
      };

      // Step 1: Contact Tier Classification (Tool 2)
      const contactTierResult = await this.classifyContactTier(enrichedContact, {
        sessionId,
        tenantId,
        companyId: companyData.id || null,
        signalId
      });
      sivaEnrichment.tools.contactTier = contactTierResult;

      // Filter TRANSACTIONAL contacts if confidence is low
      if (contactTierResult.tier === 'TRANSACTIONAL' && contactTierResult.confidenceLevel === 'LOW') {
        sivaEnrichment.passed = false;
        sivaEnrichment.filterReason = 'Low-confidence TRANSACTIONAL contact - not suitable for outreach';
        return {
          enrichedContact: { ...enrichedContact, sivaEnrichment },
          passed: false,
          filterReason: sivaEnrichment.filterReason,
          qScore: 0,
          leadTier: 'COLD'
        };
      }

      // Step 2: Banking Product Matching (Tool 5)
      const bankingProductResult = await this.matchBankingProducts(enrichedContact, companyData, {
        sessionId,
        tenantId,
        companyId: companyData.id || null,
        contactId: enrichedContact.id || null,
        signalId
      });
      sivaEnrichment.tools.bankingProduct = bankingProductResult;

      // Step 3: Opening Context Generation (Tool 7)
      const openingContextResult = await this.generateOpeningContext(enrichedContact, companyData, bankingProductResult, {
        sessionId,
        tenantId,
        companyId: companyData.id || null,
        contactId: enrichedContact.id || null,
        signalId
      });
      sivaEnrichment.tools.openingContext = openingContextResult;

      // Step 4: Composite Q-Score (Tool 8) - Aggregates all SIVA tool outputs
      const compositeScoreResult = await this.generateCompositeScore(
        contactTierResult,
        companyData.sivaMetadata?.tools?.companyQuality || {},
        companyData.sivaMetadata?.tools?.timingScore || {},
        bankingProductResult,
        {
          sessionId,
          tenantId,
          companyId: companyData.id || null,
          contactId: enrichedContact.id || null,
          signalId
        }
      );
      sivaEnrichment.tools.compositeScore = compositeScoreResult;

      const executionTimeMs = Date.now() - startTime;

      console.log(`[SIVA Enrichment] Contact ${enrichedContact.email} processed:`,
        `Tier: ${contactTierResult.tier},`,
        `Q-Score: ${compositeScoreResult.qScore},`,
        `Lead Tier: ${compositeScoreResult.leadTier}`,
        `(${executionTimeMs}ms)`);

      return {
        enrichedContact: {
          ...enrichedContact,
          sivaEnrichment,
          // Attach key fields at top level for easy querying
          siva_contact_tier: contactTierResult.tier,
          siva_contact_confidence: contactTierResult.confidenceLevel,
          siva_banking_products: bankingProductResult.matched_products?.map(p => p.name) || [],
          siva_primary_product: bankingProductResult.primary_product || null,
          siva_opening_context: openingContextResult.opening_context || null,
          siva_q_score: compositeScoreResult.qScore,
          siva_lead_tier: compositeScoreResult.leadTier
        },
        passed: true,
        filterReason: null,
        qScore: compositeScoreResult.qScore,
        leadTier: compositeScoreResult.leadTier
      };

    } catch (error) {
      console.error('[SIVA Enrichment] Processing failed:', error);
      Sentry.captureException(error, {
        tags: {
          service: 'SivaEnrichmentIntegration',
          operation: 'processEnrichedContact',
          email: enrichedContact.email
        }
      });

      // Fail gracefully - return contact with default scores
      return {
        enrichedContact,
        passed: true,
        filterReason: null,
        qScore: 50,  // Default score
        leadTier: 'WARM',
        error: error.message
      };
    }
  }

  /**
   * Classify contact tier using Tool 2
   */
  async classifyContactTier(contact, options = {}) {
    const { sessionId, tenantId, companyId, signalId } = options;
    const startTime = Date.now();

    try {
      const input = {
        contactId: contact.id || null,
        name: contact.name || null,
        designation: contact.designation || contact.title || contact.job_title || null,
        seniority: contact.seniority_level || contact.seniority || null,
        department: contact.department || null,
        company_size: contact.company_size || contact.employee_count || null
      };

      const result = await this.contactTierTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'ContactTierTool',
        toolLayer: 'strict',
        primitiveName: 'SELECT_CONTACT_TIER',
        input,
        output: result,
        executionTimeMs,
        companyId,
        contactId: contact.id || null,
        signalId,
        sessionId,
        moduleCaller: 'enrichment',
        tenantId
      }).catch(err => console.error('Failed to persist ContactTier decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Enrichment] ContactTierTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'ContactTierTool',
          module: 'enrichment',
          email: contact.email
        }
      });

      // Return default GROWTH tier on error
      return {
        tier: 'GROWTH',
        confidenceLevel: 'LOW',
        metadata: {
          seniority_score: 50,
          department_score: 50,
          size_multiplier: 1.0,
          total_score: 50,
          error: error.message
        }
      };
    }
  }

  /**
   * Match banking products using Tool 5
   */
  async matchBankingProducts(contact, company, options = {}) {
    const { sessionId, tenantId, companyId, contactId, signalId } = options;
    const startTime = Date.now();

    try {
      const input = {
        companyId,
        companyName: company.name || company.company_name || null,
        industry: company.industry || company.sector || null,
        employee_count: company.employee_count || company.company_size || null,
        revenue: company.revenue || null,
        contact_tier: contact.sivaEnrichment?.tools?.contactTier?.tier || 'GROWTH'
      };

      const result = await this.bankingProductMatchTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'BankingProductMatchTool',
        toolLayer: 'strict',
        primitiveName: 'MATCH_BANKING_PRODUCTS',
        input,
        output: result,
        executionTimeMs,
        companyId,
        contactId,
        signalId,
        sessionId,
        moduleCaller: 'enrichment',
        tenantId
      }).catch(err => console.error('Failed to persist BankingProductMatch decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Enrichment] BankingProductMatchTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'BankingProductMatchTool',
          module: 'enrichment',
          companyId
        }
      });

      // Return default product match on error
      return {
        matched_products: [],
        primary_product: null,
        reasoning: `Error matching products: ${error.message}`
      };
    }
  }

  /**
   * Generate opening context using Tool 7
   */
  async generateOpeningContext(contact, company, bankingProductResult, options = {}) {
    const { sessionId, tenantId, companyId, contactId, signalId } = options;
    const startTime = Date.now();

    try {
      const input = {
        contactId,
        companyId,
        signal_type: company.signal_type || 'hiring',
        signal_details: company.signal_details || {},
        contact_tier: contact.sivaEnrichment?.tools?.contactTier?.tier || 'GROWTH',
        banking_product: bankingProductResult.primary_product || null
      };

      const result = await this.openingContextTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'OpeningContextTool',
        toolLayer: 'strict',
        primitiveName: 'GENERATE_OPENING_CONTEXT',
        input,
        output: result,
        executionTimeMs,
        companyId,
        contactId,
        signalId,
        sessionId,
        moduleCaller: 'enrichment',
        tenantId
      }).catch(err => console.error('Failed to persist OpeningContext decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Enrichment] OpeningContextTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'OpeningContextTool',
          module: 'enrichment',
          contactId
        }
      });

      // Return generic opening on error
      return {
        opening_context: 'Based on your recent activity, I thought you might be interested in...',
        tone: 'PROFESSIONAL',
        reasoning: `Error generating context: ${error.message}`
      };
    }
  }

  /**
   * Generate composite Q-Score using Tool 8
   */
  async generateCompositeScore(contactTier, companyQuality, timingScore, bankingProduct, options = {}) {
    const { sessionId, tenantId, companyId, contactId, signalId } = options;
    const startTime = Date.now();

    try {
      const input = {
        companyId,
        contactId,
        signalId,
        // Input from Foundation tools (from discovery)
        company_quality_tier: companyQuality.tier || 'GOOD',
        company_quality_score: companyQuality.score || 75,
        timing_score: timingScore.timing_score || 75,
        timing_category: timingScore.category || 'GOOD',
        // Input from STRICT tools (from enrichment)
        contact_tier: contactTier.tier || 'GROWTH',
        contact_confidence: contactTier.confidenceLevel || 'MEDIUM',
        banking_product_match: bankingProduct.primary_product || null,
        product_count: bankingProduct.matched_products?.length || 0
      };

      const result = await this.compositeScoreTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'CompositeScoreTool',
        toolLayer: 'strict',
        primitiveName: 'GENERATE_COMPOSITE_SCORE',
        input,
        output: result,
        executionTimeMs,
        companyId,
        contactId,
        signalId,
        sessionId,
        moduleCaller: 'enrichment',
        tenantId
      }).catch(err => console.error('Failed to persist CompositeScore decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Enrichment] CompositeScoreTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'CompositeScoreTool',
          module: 'enrichment',
          contactId
        }
      });

      // Return default score on error
      return {
        qScore: 50,
        leadTier: 'WARM',
        reasoning: `Error calculating Q-Score: ${error.message}`
      };
    }
  }
}

module.exports = new SivaEnrichmentIntegration();
