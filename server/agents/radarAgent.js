// server/agents/radarAgent.js
// RadarAgent - AI agent for autonomous UAE company discovery
// v3.0 - 100% SIVA Integration (Phase 2 - MCP Architecture)
import { createRequire } from 'module';
import pool from '../db.js';
import SerpTool from '../tools/serp.js';
import CrawlerTool from '../tools/crawler.js';
import RadarService from '../services/radar.js';
import SignalConfidenceService from '../services/signalConfidence.js';

// SIVA Tools Integration (ALL 15 Tools - Centralized Intelligence)
const require = createRequire(import.meta.url);
const Tool1_CompanyQuality = require('../siva-tools/CompanyQualityToolStandalone.js');
const Tool4_EdgeCases = require('../siva-tools/EdgeCasesToolStandalone.js');
const Tool8_CompositeScore = require('../siva-tools/CompositeScoreToolStandalone.js');
const Tool13_HiringSignalExtraction = require('../siva-tools/HiringSignalExtractionToolStandalone.js');
const Tool14_SourceReliability = require('../siva-tools/SourceReliabilityToolStandalone.js');
const Tool15_SignalDeduplication = require('../siva-tools/SignalDeduplicationToolStandalone.js');

// Initialize SIVA tool instances (100% Centralized MCP)
const companyQualityTool = new Tool1_CompanyQuality();
const edgeCasesTool = new Tool4_EdgeCases();
const compositeScoreTool = new Tool8_CompositeScore();
const hiringSignalExtractionTool = new Tool13_HiringSignalExtraction();
const sourceReliabilityTool = new Tool14_SourceReliability();
const signalDeduplicationTool = new Tool15_SignalDeduplication();

class RadarAgent {
  constructor() {
    this.companySchema = {
      type: 'object',
      required: ['legal_name', 'domain', 'uae_confidence'],
      properties: {
        legal_name: { type: 'string' },
        domain: { type: 'string' },
        primary_industry: { type: 'string' },
        uae_confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'object' }
      }
    };

    // SIVA integration metrics (Phase 2 - 100% MCP)
    this.sivaMetrics = {
      // Extraction layer (Tool 13)
      totalExtracted: 0,
      extractionConfidence: 0,

      // Source filtering (Tool 14)
      sourceFiltered: 0,
      avgSourceReliability: 0,

      // Deduplication (Tool 15)
      duplicatesFiltered: 0,

      // Quality gates (Tools 1, 4, 8)
      totalEvaluated: 0,
      sivaApproved: 0,
      sivaRejected: 0,
      avgQualityScore: 0,
      avgCompositeScore: 0
    };
  }

  /**
   * Run discovery from a source
   * @param {object} params - { sourceId, sourceName, sourceType, runId, tenantId, budgetLimitUsd }
   * @returns {Promise<object>} Discovery results
   */
  async runDiscovery(params) {
    const {
      sourceId,
      sourceName,
      sourceType,
      runId,
      tenantId,
      budgetLimitUsd = 2.00
    } = params;

    const startTime = Date.now();
    let totalCost = 0;
    const companiesFound = [];
    const errors = [];

    try {
      // Get search query from source metadata
      const source = await this.getSourceQuery(sourceId);

      // 1. Search via SERP
      const searchResults = await SerpTool.search({
        query: source.query,
        location: 'United Arab Emirates',
        engine: sourceType === 'news' ? 'google_news' : 'google',
        num: 10,
        runId,
        tenantId,
        sourceId
      });

      totalCost += searchResults.metadata?.costUsd || 0;

      // Check budget
      if (totalCost >= budgetLimitUsd) {
        console.warn(`[RadarAgent] Budget limit reached: $${totalCost}`);
        return this.buildResult(companiesFound, totalCost, startTime, errors);
      }

      // 2. Crawl top results
      const urlsToCrawl = searchResults.results.slice(0, 5).map(r => r.link).filter(Boolean);

      const crawlResults = await CrawlerTool.crawlBatch(urlsToCrawl, {
        concurrency: 3,
        runId,
        tenantId,
        sourceId
      });

      totalCost += crawlResults.length * 0.001; // COST_PER_CRAWL

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: 100% SIVA INTEGRATION - MCP Architecture
      // Tool 14 → Tool 13 → Tool 15 → Tool 1 → Tool 4 → Tool 8 → Save
      // ═══════════════════════════════════════════════════════════════

      for (const crawlResult of crawlResults) {
        if (!crawlResult.success) continue;

        // Check budget before processing
        if (totalCost >= budgetLimitUsd) {
          console.warn(`[RadarAgent] Budget limit reached: $${totalCost}`);
          break;
        }

        try {
          // ─────────────────────────────────────────────────────────
          // STEP 1: Tool 14 - Source Reliability Scoring (STRICT)
          // ─────────────────────────────────────────────────────────
          const sourceUrl = new URL(crawlResult.url);
          const sourceDomain = sourceUrl.hostname.replace(/^www\./, '');

          const reliabilityResult = await sourceReliabilityTool.execute({
            source_url: crawlResult.url,
            source_domain: sourceDomain,
            source_type: sourceType === 'news' ? 'NEWS' : 'CORPORATE_WEBSITE',
            tenant_id: tenantId
          });

          console.log(`[RadarAgent] 📊 Tool 14: Source "${sourceDomain}" → ${reliabilityResult.reliability_score}/100 (${reliabilityResult.source_tier})`);

          // Filter low-quality sources (threshold: 50)
          if (reliabilityResult.reliability_score < 50) {
            this.sivaMetrics.sourceFiltered++;
            console.log(`[RadarAgent] ❌ Source filtered (score < 50): ${sourceDomain}`);
            continue;
          }

          // Update metrics
          const currentAvg = this.sivaMetrics.avgSourceReliability || 0;
          const totalSources = (this.sivaMetrics.totalExtracted || 0) + 1;
          this.sivaMetrics.avgSourceReliability =
            ((currentAvg * (totalSources - 1)) + reliabilityResult.reliability_score) / totalSources;

          // ─────────────────────────────────────────────────────────
          // STEP 2: Tool 13 - Hiring Signal Extraction (DELEGATED)
          // ─────────────────────────────────────────────────────────
          const extractionInput = {
            source: {
              url: crawlResult.url,
              domain: sourceDomain,
              published_at: null // crawlResult doesn't include date
            },
            content: {
              title: crawlResult.title || 'Untitled',
              body_text: crawlResult.rawText || '',
              snippet: crawlResult.rawText?.substring(0, 300) || ''
            },
            context: {
              search_query: source.query,
              source_type: sourceType === 'news' ? 'NEWS' : 'CORPORATE_WEBSITE',
              request_id: runId
            }
          };

          const extractionResult = await hiringSignalExtractionTool.execute(extractionInput);

          console.log(`[RadarAgent] 🤖 Tool 13: Extracted ${extractionResult.signals.length} signals (confidence: ${(extractionResult.metadata.extraction_confidence * 100).toFixed(0)}%)`);

          // Update metrics
          this.sivaMetrics.totalExtracted += extractionResult.signals.length;
          this.sivaMetrics.extractionConfidence = extractionResult.metadata.extraction_confidence;

          // Track cost
          totalCost += extractionResult.metadata.cost_usd;

          // ─────────────────────────────────────────────────────────
          // STEP 3-8: Process Each Extracted Signal
          // ─────────────────────────────────────────────────────────
          for (const signal of extractionResult.signals) {
            // ─────────────────────────────────────────────────────────
            // STEP 3: Tool 15 - Signal Deduplication (STRICT)
            // ─────────────────────────────────────────────────────────
            const dedupeInput = {
              company_name: signal.company_name,
              company_domain: signal.company_domain,
              signal_type: signal.signal_type,
              tenant_id: tenantId,
              lookback_days: 30
            };

            const dedupeResult = await signalDeduplicationTool.execute(dedupeInput, pool);

            console.log(`[RadarAgent] 🔍 Tool 15: "${signal.company_name}" → Duplicate: ${dedupeResult.is_duplicate} (confidence: ${(dedupeResult.duplicate_confidence * 100).toFixed(0)}%)`);

            if (dedupeResult.is_duplicate) {
              this.sivaMetrics.duplicatesFiltered++;
              console.log(`[RadarAgent] ⏭️  Skipping duplicate: ${signal.company_name} (existing signal: ${dedupeResult.existing_signal_id})`);
              continue;
            }

            // ─────────────────────────────────────────────────────────
            // STEP 4: Tool 1 - Company Quality Scoring (STRICT)
            // ─────────────────────────────────────────────────────────
            this.sivaMetrics.totalEvaluated++;

            const domain = signal.company_domain || `${signal.company_name.toLowerCase().replace(/\s+/g, '-')}.ae`;
            const hasAeDomain = domain.endsWith('.ae');
            const hasUaeAddress = signal.uae_presence_confidence === 'CONFIRMED';

            const qualityInput = {
              company_name: signal.company_name,
              domain: domain,
              industry: signal.industry || 'Unknown',
              uae_signals: {
                has_ae_domain: hasAeDomain,
                has_uae_address: hasUaeAddress,
                linkedin_location: signal.location || undefined
              },
              size_bucket: 'midsize',
              size: signal.employee_count_mentioned || 100,
              salary_indicators: {
                salary_level: 'medium',
                avg_salary: 12833 // UAE market average
              }
            };

            const qualityResult = await companyQualityTool.execute(qualityInput);

            console.log(`[RadarAgent] ✅ Tool 1: Quality score: ${qualityResult.quality_score}/100`);

            // ─────────────────────────────────────────────────────────
            // STEP 5: Tool 4 - Edge Cases Detection (STRICT)
            // ─────────────────────────────────────────────────────────
            const edgeCasesInput = {
              company_profile: {
                name: signal.company_name,
                domain: domain,
                industry: signal.industry || 'Unknown',
                sector: 'private',
                country: 'AE',
                size: signal.employee_count_mentioned || 100
              }
            };

            const edgeCasesResult = await edgeCasesTool.execute(edgeCasesInput);

            console.log(`[RadarAgent] 🚨 Tool 4: Blockers: ${edgeCasesResult.has_blockers}, Warnings: ${edgeCasesResult.warnings.length}`);

            // ─────────────────────────────────────────────────────────
            // STEP 6: Tool 8 - Composite Score (STRICT)
            // ─────────────────────────────────────────────────────────
            const compositeInput = {
              company_quality_score: qualityResult.quality_score,
              contact_tier: 'TIER_2', // Default (no contact info yet)
              timing_score: signal.hiring_likelihood * 20, // Convert 1-5 to 0-100
              edge_cases: {
                has_blockers: edgeCasesResult.has_blockers,
                warnings: edgeCasesResult.warnings,
                blockers: edgeCasesResult.blockers
              }
            };

            const compositeResult = await compositeScoreTool.execute(compositeInput);

            console.log(`[RadarAgent] 🎯 Tool 8: Composite score: ${compositeResult.composite_score}/100`);

            // ─────────────────────────────────────────────────────────
            // STEP 7: Quality Gate Decision
            // ─────────────────────────────────────────────────────────
            const qualityScore = qualityResult.quality_score;
            const hasBlockers = edgeCasesResult.has_blockers;
            const qualityThreshold = 60;

            // Track metrics
            this.sivaMetrics.avgQualityScore =
              ((this.sivaMetrics.avgQualityScore * (this.sivaMetrics.totalEvaluated - 1)) + qualityScore) /
              this.sivaMetrics.totalEvaluated;

            this.sivaMetrics.avgCompositeScore =
              ((this.sivaMetrics.avgCompositeScore * (this.sivaMetrics.totalEvaluated - 1)) + compositeResult.composite_score) /
              this.sivaMetrics.totalEvaluated;

            if (qualityScore >= qualityThreshold && !hasBlockers) {
              // ✅ SIVA APPROVED
              this.sivaMetrics.sivaApproved++;

              console.log(`[RadarAgent] ✅ SIVA APPROVED: ${signal.company_name} (Q: ${qualityScore}, C: ${compositeResult.composite_score})`);

              try {
                // ─────────────────────────────────────────────────────────
                // STEP 8: Save Signal with Full SIVA Metadata
                // ─────────────────────────────────────────────────────────
                const savedSignal = await this.saveCompany({
                  // Original signal data (mapped from Tool 13)
                  company: signal.company_name,
                  domain: signal.company_domain,
                  sector: signal.industry,
                  trigger_type: signal.signal_type,
                  description: signal.trigger_description,
                  hiring_likelihood_score: signal.hiring_likelihood,
                  hiring_likelihood: signal.hiring_likelihood >= 4 ? 'High' :
                                    signal.hiring_likelihood >= 3 ? 'Medium' : 'Low',
                  geo_status: signal.uae_presence_confidence?.toLowerCase() || 'ambiguous',
                  geo_hints: signal.key_facts || [],
                  location: signal.location,
                  source_url: crawlResult.url,
                  source_date: null,
                  evidence_quote: null,
                  evidence_note: signal.trigger_description,
                  role_cluster: {
                    roles: signal.roles_mentioned || [],
                    horizon: '0-18m'
                  },
                  notes: null,
                  runId,
                  tenantId,

                  // SIVA metadata (Phase 2 - All 15 Tools)
                  siva_tool13_extraction: extractionResult.metadata,
                  siva_tool14_source_reliability: reliabilityResult.reliability_score,
                  siva_tool14_source_tier: reliabilityResult.source_tier,
                  siva_tool15_duplicate_check: dedupeResult,
                  siva_tool1_quality_score: qualityScore,
                  siva_tool1_confidence: qualityResult.confidence,
                  siva_tool4_edge_cases: edgeCasesResult.warnings,
                  siva_tool4_blockers: edgeCasesResult.blockers,
                  siva_tool8_composite_score: compositeResult.composite_score,
                  siva_evaluated: true,
                  siva_phase: 2 // Phase 2 = 100% MCP
                });

                if (savedSignal) {
                  companiesFound.push(savedSignal);
                  console.log(`[RadarAgent] 💾 Saved with Phase 2 SIVA metadata: ${signal.company_name}`);
                }
              } catch (saveError) {
                console.error(`[RadarAgent] ❌ Failed to save signal "${signal.company_name}":`, saveError.message);
                errors.push({ company: signal.company_name, error: saveError.message });
              }
            } else {
              // ❌ SIVA REJECTED
              this.sivaMetrics.sivaRejected++;

              const rejectionReason = hasBlockers
                ? `Blockers: ${edgeCasesResult.blockers.join(', ')}`
                : `Low quality score: ${qualityScore} < ${qualityThreshold}`;

              console.log(`[RadarAgent] ❌ SIVA REJECTED: ${signal.company_name} - ${rejectionReason}`);

              errors.push({
                company: signal.company_name,
                error: 'SIVA_REJECTED',
                reason: rejectionReason,
                quality_score: qualityScore,
                composite_score: compositeResult.composite_score,
                blockers: edgeCasesResult.blockers
              });
            }
          }

        } catch (error) {
          console.error(`[RadarAgent] SIVA pipeline failed for ${crawlResult.url}:`, error);
          errors.push({ url: crawlResult.url, error: error.message });

          // Create dead letter
          await RadarService.createDeadLetter({
            runId,
            sourceId,
            rawData: crawlResult,
            failureReason: error.message,
            tenantId
          });
        }
      }

      return this.buildResult(companiesFound, totalCost, startTime, errors);

    } catch (error) {
      console.error(`[RadarAgent] Discovery failed:`, error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REMOVED: extractCompanies(), parseCompaniesJson(), validateCompany()
  // Now handled by Tool 13: HiringSignalExtractionTool (DELEGATED)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save hiring signal to hiring_signals table (PHASE 2 - SIVA 100% MCP)
   * @param {object} signal - Hiring signal data with Phase 2 SIVA metadata
   * @returns {Promise<object|null>} Saved signal or null if error
   */
  async saveCompany(signal) {
    const {
      company,
      domain,
      sector,
      trigger_type,
      description,
      hiring_likelihood_score,
      hiring_likelihood,
      geo_status,
      geo_hints,
      location,
      source_url,
      source_date,
      evidence_quote,
      evidence_note,
      role_cluster,
      notes,
      runId,
      tenantId,

      // SIVA Phase 2 Metadata (All 15 Tools - MCP Architecture)
      siva_tool13_extraction,
      siva_tool14_source_reliability,
      siva_tool14_source_tier,
      siva_tool15_duplicate_check,
      siva_tool1_quality_score,
      siva_tool1_confidence,
      siva_tool4_edge_cases,
      siva_tool4_blockers,
      siva_tool8_composite_score,
      siva_evaluated,
      siva_phase
    } = signal;

    // Build comprehensive SIVA Phase 2 metadata object
    const sivaMetadata = siva_evaluated ? {
      siva_phase: siva_phase || 2,
      siva_evaluated: true,

      // Extraction metadata (Tool 13)
      extraction: {
        signals_found: siva_tool13_extraction?.signals_found,
        extraction_confidence: siva_tool13_extraction?.extraction_confidence,
        model_used: siva_tool13_extraction?.model_used,
        cost_usd: siva_tool13_extraction?.cost_usd
      },

      // Source reliability (Tool 14)
      source: {
        reliability_score: siva_tool14_source_reliability,
        source_tier: siva_tool14_source_tier
      },

      // Deduplication check (Tool 15)
      deduplication: {
        is_duplicate: siva_tool15_duplicate_check?.is_duplicate,
        duplicate_confidence: siva_tool15_duplicate_check?.duplicate_confidence,
        signals_checked: siva_tool15_duplicate_check?.metadata?.signals_checked
      },

      // Quality gates (Tools 1, 4, 8)
      quality: {
        quality_score: siva_tool1_quality_score,
        confidence: siva_tool1_confidence,
        edge_cases: siva_tool4_edge_cases,
        blockers: siva_tool4_blockers,
        composite_score: siva_tool8_composite_score
      }
    } : null;

    // Combine notes with SIVA Phase 2 metadata
    const combinedNotes = sivaMetadata
      ? `${notes || ''}\n\n[SIVA_PHASE2_METADATA] ${JSON.stringify(sivaMetadata, null, 2)}`.trim()
      : notes;

    // ═══════════════════════════════════════════════════════════════
    // SPRINT 18 TASK 7: SIGNAL CONFIDENCE SCORING
    // Calculate confidence score based on source quality, freshness, and completeness
    // ═══════════════════════════════════════════════════════════════
    const confidenceScore = SignalConfidenceService.calculateConfidence({
      sourceReliabilityScore: siva_tool14_source_reliability,
      sourceDate: source_date,
      description,
      evidenceQuote: evidence_quote,
      company,
      domain,
      triggerType: trigger_type
    });

    const sourceType = SignalConfidenceService.extractSourceType(source_url);

    try {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 2 CHANGE: REMOVED ON CONFLICT LOGIC
      // Deduplication now handled by Tool 15 (SignalDeduplicationTool)
      // Before saving, Tool 15 already checked for duplicates
      // If we reach this point, signal is NOT a duplicate
      // ═══════════════════════════════════════════════════════════════
      const result = await pool.query(
        `INSERT INTO hiring_signals (
          tenant_id,
          run_id,
          company,
          domain,
          sector,
          trigger_type,
          description,
          hiring_likelihood_score,
          hiring_likelihood,
          geo_status,
          geo_hints,
          location,
          source_url,
          source_date,
          evidence_quote,
          evidence_note,
          role_cluster,
          notes,
          confidence_score,
          source_type,
          review_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'pending')
        RETURNING *`,
        [
          tenantId,
          runId,
          company,
          domain,
          sector,
          trigger_type,
          description,
          hiring_likelihood_score,
          hiring_likelihood,
          geo_status,
          geo_hints || [],
          location,
          source_url,
          source_date,
          evidence_quote,
          evidence_note,
          role_cluster ? JSON.stringify(role_cluster) : null,
          combinedNotes, // Include comprehensive SIVA Phase 2 metadata
          confidenceScore, // Sprint 18 Task 7: Confidence scoring
          sourceType // Sprint 18 Task 7: Source type classification
        ]
      );

      return result.rows[0];
    } catch (err) {
      console.error('[RadarAgent] Failed to save hiring signal:', err.message);
      console.error('[RadarAgent] Error details:', err.stack);
      return null;
    }
  }

  /**
   * Get source query from database
   * @param {string} sourceId - Source ID
   * @returns {Promise<object>} Source with query
   */
  async getSourceQuery(sourceId) {
    const result = await pool.query(
      'SELECT * FROM discovery_sources WHERE source_id = $1',
      [sourceId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const source = result.rows[0];
    return {
      ...source,
      query: source.metadata?.query || `${source.name} UAE companies`
    };
  }

  /**
   * Build discovery result object (PHASE 2 - 100% MCP Metrics)
   * @param {Array} companies - Companies found
   * @param {number} totalCost - Total cost
   * @param {number} startTime - Start timestamp
   * @param {Array} errors - Errors encountered
   * @returns {object} Result object
   */
  buildResult(companies, totalCost, startTime, errors) {
    // Calculate SIVA Phase 2 metrics
    const sivaApprovalRate = this.sivaMetrics.totalEvaluated > 0
      ? ((this.sivaMetrics.sivaApproved / this.sivaMetrics.totalEvaluated) * 100).toFixed(1)
      : 0;

    return {
      companiesFound: companies.length,
      companies: companies.filter(Boolean),
      costUsd: parseFloat(totalCost.toFixed(4)),
      latencyMs: Date.now() - startTime,
      errors,

      // ═══════════════════════════════════════════════════════════════
      // SIVA PHASE 2 METRICS - 100% MCP Architecture
      // Full pipeline: Tool14 → Tool13 → Tool15 → Tool1 → Tool4 → Tool8
      // ═══════════════════════════════════════════════════════════════
      siva_metrics: {
        // Extraction layer (Tool 13)
        total_extracted: this.sivaMetrics.totalExtracted,
        extraction_confidence: this.sivaMetrics.extractionConfidence,

        // Source filtering (Tool 14)
        sources_filtered: this.sivaMetrics.sourceFiltered,
        avg_source_reliability: parseFloat((this.sivaMetrics.avgSourceReliability || 0).toFixed(1)),

        // Deduplication (Tool 15)
        duplicates_filtered: this.sivaMetrics.duplicatesFiltered,

        // Quality gates (Tools 1, 4, 8)
        total_evaluated: this.sivaMetrics.totalEvaluated,
        siva_approved: this.sivaMetrics.sivaApproved,
        siva_rejected: this.sivaMetrics.sivaRejected,
        approval_rate_pct: parseFloat(sivaApprovalRate),
        avg_quality_score: parseFloat((this.sivaMetrics.avgQualityScore || 0).toFixed(1)),
        avg_composite_score: parseFloat((this.sivaMetrics.avgCompositeScore || 0).toFixed(1)),

        // Phase indicator
        siva_phase: 2,
        siva_architecture: 'MCP' // Model Context Protocol - 100% centralized
      }
    };
  }
}

export default new RadarAgent();
