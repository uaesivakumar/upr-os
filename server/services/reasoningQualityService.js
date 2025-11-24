/**
 * Reasoning Quality Service
 * Sprint 46 - Multi-dimensional reasoning assessment
 *
 * Capabilities:
 * - 5-dimensional reasoning scoring (Logic, Evidence, Coherence, Depth, Clarity)
 * - Logical fallacy detection
 * - Reasoning pattern analysis
 * - Improvement suggestion generation
 * - Quality tier classification
 */

import pool from '../db.js';

class ReasoningQualityService {
  constructor() {
    this.db = pool;
  }

  async initialize() {
    // Pool is already initialized
  }

  /**
   * Score reasoning quality across all dimensions
   */
  async scoreReasoning(params) {
    const {
      decision_id,
      agent_id,
      reasoning_text,
      reasoning_steps = [],
      evidence = [],
      confidence,
      context = {}
    } = params;

    // Calculate dimensional scores
    const logicScore = this.calculateLogicScore(reasoning_text, reasoning_steps);
    const evidenceScore = this.calculateEvidenceScore(evidence, reasoning_steps);
    const coherenceScore = this.calculateCoherenceScore(reasoning_text, reasoning_steps);
    const depthScore = this.calculateDepthScore(reasoning_steps, context);
    const clarityScore = this.calculateClarityScore(reasoning_text);

    // Calculate overall quality (weighted average)
    const overallQuality = Math.round(
      logicScore * 0.25 +
      evidenceScore * 0.25 +
      coherenceScore * 0.20 +
      depthScore * 0.20 +
      clarityScore * 0.10
    );

    // Detect fallacies
    const fallaciesDetected = this.detectFallacies(reasoning_text, reasoning_steps);

    // Identify strengths and weaknesses
    const strengths = this.identifyStrengths({
      logicScore, evidenceScore, coherenceScore, depthScore, clarityScore
    });
    const weaknesses = this.identifyWeaknesses({
      logicScore, evidenceScore, coherenceScore, depthScore, clarityScore,
      fallaciesDetected
    });

    // Generate improvement suggestions
    const suggestions = this.generateImprovementSuggestions({
      logicScore, evidenceScore, coherenceScore, depthScore, clarityScore,
      weaknesses, fallaciesDetected
    });

    // Store in database
    const query = `
      INSERT INTO reasoning_quality_scores (
        decision_id,
        agent_id,
        overall_quality,
        logic_score,
        evidence_score,
        coherence_score,
        depth_score,
        clarity_score,
        reasoning_strengths,
        reasoning_weaknesses,
        fallacies_detected,
        improvement_suggestions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      decision_id,
      agent_id,
      overallQuality,
      logicScore,
      evidenceScore,
      coherenceScore,
      depthScore,
      clarityScore,
      strengths,
      weaknesses,
      fallaciesDetected,
      suggestions
    ]);

    return result.rows[0];
  }

  /**
   * Calculate logic score - validity of logical reasoning
   */
  calculateLogicScore(reasoning_text, reasoning_steps) {
    let score = 70; // Base score

    // Check for logical structure
    const hasStructure = reasoning_steps.length > 0;
    if (hasStructure) {
      score += 10;

      // Check for proper conclusion from premises
      const hasClearConclusion = reasoning_steps.some(step =>
        step.type === 'conclusion' || step.type === 'final'
      );
      if (hasClearConclusion) score += 5;

      // Check for logical connectors
      const logicalConnectors = ['therefore', 'thus', 'hence', 'because', 'since', 'if', 'then', 'given that'];
      const connectorCount = logicalConnectors.filter(connector =>
        reasoning_text.toLowerCase().includes(connector)
      ).length;
      score += Math.min(connectorCount * 2, 10);
    }

    // Check for contradictions (reduce score)
    const contradictionPatterns = ['however, I also said', 'contradicts', 'on the other hand'];
    const hasContradictions = contradictionPatterns.some(pattern =>
      reasoning_text.toLowerCase().includes(pattern)
    );
    if (hasContradictions) score -= 15;

    // Check for circular reasoning
    if (this.hasCircularReasoning(reasoning_text)) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate evidence score - quality and relevance of evidence
   */
  calculateEvidenceScore(evidence, reasoning_steps) {
    let score = 50; // Base score

    if (!evidence || evidence.length === 0) {
      return 40; // Low score for no evidence
    }

    // Score based on evidence quantity
    score += Math.min(evidence.length * 5, 20);

    // Score based on evidence types
    const evidenceTypes = new Set(evidence.map(e => e.type || 'unspecified'));
    if (evidenceTypes.has('data')) score += 10;
    if (evidenceTypes.has('expert')) score += 8;
    if (evidenceTypes.has('research')) score += 10;
    if (evidenceTypes.has('observation')) score += 5;

    // Check if evidence is actually cited in reasoning
    const citedEvidence = evidence.filter(e => {
      const text = JSON.stringify(reasoning_steps).toLowerCase();
      return text.includes((e.source || '').toLowerCase()) ||
             text.includes((e.description || '').toLowerCase());
    });
    const citationRate = citedEvidence.length / evidence.length;
    score += citationRate * 15;

    // Check for evidence quality indicators
    evidence.forEach(e => {
      if (e.confidence && e.confidence > 0.8) score += 2;
      if (e.source && e.source.length > 0) score += 1;
    });

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate coherence score - internal consistency
   */
  calculateCoherenceScore(reasoning_text, reasoning_steps) {
    let score = 75; // Base score

    if (reasoning_steps.length === 0) {
      return 60; // Lower for unstructured reasoning
    }

    // Check for step-by-step progression by analyzing content
    if (reasoning_steps.length > 1) {
      let connectedSteps = 0;
      for (let i = 1; i < reasoning_steps.length; i++) {
        const prevStep = (reasoning_steps[i - 1].description || reasoning_steps[i - 1].reasoning || '').toLowerCase();
        const currStep = (reasoning_steps[i].description || reasoning_steps[i].reasoning || '').toLowerCase();

        // Extract key words (>4 chars) from previous step
        const prevWords = prevStep.split(/\s+/).filter(w => w.length > 4);

        // Check if current step references any key words from previous step
        const hasConnection = prevWords.some(word => currStep.includes(word));
        if (hasConnection) connectedSteps++;
      }

      const connectionRate = connectedSteps / (reasoning_steps.length - 1);
      score += connectionRate * 10; // Up to +10 for well-connected steps
    }

    // Check for consistent terminology
    const keyTerms = this.extractKeyTerms(reasoning_text);
    const termConsistency = this.checkTermConsistency(reasoning_text, keyTerms);
    score += termConsistency * 10;

    // Detect topic discontinuity by analyzing semantic similarity
    if (reasoning_steps.length >= 3) {
      const stepTexts = reasoning_steps.map(s =>
        (s.description || s.reasoning || '').toLowerCase()
      );

      let disconnectedSteps = 0;
      for (let i = 1; i < stepTexts.length; i++) {
        const prevWords = new Set(stepTexts[i-1].split(/\s+/).filter(w => w.length > 4));
        const currWords = stepTexts[i].split(/\s+/).filter(w => w.length > 4);

        // Calculate word overlap
        const overlap = currWords.filter(w => prevWords.has(w)).length;
        const overlapRate = currWords.length > 0 ? overlap / currWords.length : 0;

        // If very low overlap (<10%), likely a topic change
        if (overlapRate < 0.1 && currWords.length > 3) {
          disconnectedSteps++;
        }
      }

      score -= disconnectedSteps * 5; // Penalize disconnected reasoning
    }

    // Check for supporting relationships
    const supportChain = reasoning_steps.filter(step =>
      step.type === 'support' || step.type === 'evidence'
    ).length;
    if (supportChain > 0) score += Math.min(supportChain * 3, 10);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate depth score - thoroughness of analysis
   */
  calculateDepthScore(reasoning_steps, context) {
    let score = 60; // Base score

    // Score based on number of reasoning steps
    score += Math.min(reasoning_steps.length * 3, 15);

    // Check for consideration of alternatives
    const considersAlternatives = reasoning_steps.some(step =>
      step.type === 'alternative' || step.type === 'counterargument'
    );
    if (considersAlternatives) score += 15;

    // Check for multi-level reasoning (thinking about thinking)
    const hasMetaReasoning = reasoning_steps.some(step =>
      step.description?.toLowerCase().includes('considering') ||
      step.description?.toLowerCase().includes('evaluating') ||
      step.description?.toLowerCase().includes('assessing')
    );
    if (hasMetaReasoning) score += 10;

    // Check for causal analysis
    const causalKeywords = ['because', 'leads to', 'causes', 'results in', 'due to'];
    const hasCausalAnalysis = reasoning_steps.some(step =>
      causalKeywords.some(kw => step.description?.toLowerCase().includes(kw))
    );
    if (hasCausalAnalysis) score += 10;

    // Check for contextual awareness
    if (context && Object.keys(context).length > 3) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate clarity score - understandability
   */
  calculateClarityScore(reasoning_text) {
    let score = 75; // Base score

    if (!reasoning_text || reasoning_text.length === 0) {
      return 30;
    }

    // Check length (not too short, not too long)
    const wordCount = reasoning_text.split(/\s+/).length;
    if (wordCount > 20 && wordCount < 300) {
      score += 10;
    } else if (wordCount >= 300) {
      score -= 5; // Penalize verbosity
    }

    // Check for clear structure indicators
    const structureIndicators = ['first', 'second', 'finally', 'in conclusion', 'to summarize'];
    const hasStructure = structureIndicators.some(indicator =>
      reasoning_text.toLowerCase().includes(indicator)
    );
    if (hasStructure) score += 10;

    // Penalize excessive jargon (proxy: very long words)
    const words = reasoning_text.split(/\s+/);
    const longWords = words.filter(w => w.length > 12).length;
    const jargonRatio = longWords / words.length;
    if (jargonRatio > 0.15) score -= 10;

    // Check for clarity markers
    const clarityMarkers = ['clearly', 'specifically', 'in other words', 'that is'];
    const hasClarityMarkers = clarityMarkers.some(marker =>
      reasoning_text.toLowerCase().includes(marker)
    );
    if (hasClarityMarkers) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect logical fallacies
   */
  detectFallacies(reasoning_text, reasoning_steps) {
    const fallacies = [];
    const lowerText = reasoning_text.toLowerCase();

    // Ad hominem
    if (lowerText.includes('stupid') || lowerText.includes('idiot') ||
        lowerText.includes('incompetent') || lowerText.includes('wrong because you')) {
      fallacies.push('AD_HOMINEM: Attacking the person rather than the argument');
    }

    // Appeal to authority
    if ((lowerText.includes('expert') || lowerText.includes('authority')) &&
        lowerText.includes('says so')) {
      fallacies.push('APPEAL_TO_AUTHORITY: Relying solely on expert opinion without evidence');
    }

    // False dichotomy
    if ((lowerText.includes('only two') ||
         (lowerText.includes('either') && lowerText.includes('or'))) &&
        (lowerText.includes('option') || lowerText.includes('way') || lowerText.includes('choice'))) {
      fallacies.push('FALSE_DICHOTOMY: Presenting only two options when more exist');
    }

    // Slippery slope
    if ((lowerText.includes('will lead to') || lowerText.includes('will')) &&
        (lowerText.includes('eventually') || lowerText.includes('inevitably') ||
         lowerText.includes('disaster') || lowerText.includes('collapse'))) {
      fallacies.push('SLIPPERY_SLOPE: Assuming one thing will inevitably lead to another');
    }

    // Hasty generalization
    if ((lowerText.includes('all') || lowerText.includes('always') ||
         lowerText.includes('never')) &&
        reasoning_steps.length < 3) {
      fallacies.push('HASTY_GENERALIZATION: Drawing broad conclusions from limited evidence');
    }

    // Circular reasoning
    if (this.hasCircularReasoning(reasoning_text)) {
      fallacies.push('CIRCULAR_REASONING: Using the conclusion to support the premise');
    }

    // Straw man
    if (lowerText.includes('they claim') && lowerText.includes('but actually')) {
      fallacies.push('STRAW_MAN: Misrepresenting an argument to make it easier to attack');
    }

    return fallacies;
  }

  /**
   * Check for circular reasoning
   */
  hasCircularReasoning(reasoning_text) {
    const lowerText = reasoning_text.toLowerCase();

    // Pattern 1: Explicit circular patterns
    const circularPatterns = [
      /(\w+) is true because (\w+) is true/,
      /proves itself/,
      /true because.*true/,
      /valid because.*valid/,
      /correct because.*correct/
    ];

    if (circularPatterns.some(pattern => pattern.test(lowerText))) {
      return true;
    }

    // Pattern 2: Check if conclusion appears in premises
    const sentences = reasoning_text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 2) return false;

    const conclusion = sentences[sentences.length - 1].toLowerCase();
    const premises = sentences.slice(0, -1).join(' ').toLowerCase();

    // Check for significant overlap
    const conclusionWords = new Set(conclusion.split(/\s+/).filter(w => w.length > 4));
    const premiseWords = premises.split(/\s+/).filter(w => w.length > 4);

    let overlapCount = 0;
    conclusionWords.forEach(word => {
      if (premiseWords.includes(word)) overlapCount++;
    });

    return overlapCount > conclusionWords.size * 0.6;
  }

  /**
   * Extract key terms from text
   */
  extractKeyTerms(text) {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by']);

    const meaningfulWords = words.filter(w =>
      w.length > 4 && !stopWords.has(w)
    );

    // Count frequency
    const freq = {};
    meaningfulWords.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });

    // Return words that appear more than once
    return Object.keys(freq).filter(w => freq[w] > 1);
  }

  /**
   * Check terminology consistency
   */
  checkTermConsistency(text, keyTerms) {
    if (keyTerms.length === 0) return 0.5;

    // Check if key terms are used consistently vs. having many synonyms
    const synonymVariations = keyTerms.filter(term => {
      // Simple heuristic: if a term appears with slight variations
      const pattern = new RegExp(term.slice(0, -2), 'gi');
      const matches = text.match(pattern) || [];
      return matches.length > 1;
    });

    return 1 - (synonymVariations.length / keyTerms.length);
  }

  /**
   * Detect abrupt topic changes
   */
  detectAbruptTopicChanges(reasoning_steps) {
    if (reasoning_steps.length < 3) return 0;

    let changes = 0;
    for (let i = 1; i < reasoning_steps.length; i++) {
      const prevStep = reasoning_steps[i - 1];
      const currStep = reasoning_steps[i];

      // Check if current step references previous
      const references = currStep.depends_on || [];
      if (!references.includes(prevStep.id) && i > 1) {
        changes++;
      }
    }

    return changes;
  }

  /**
   * Identify reasoning strengths
   */
  identifyStrengths(scores) {
    const strengths = [];

    if (scores.logicScore >= 80) {
      strengths.push('Strong logical structure and valid reasoning chain');
    }
    if (scores.evidenceScore >= 80) {
      strengths.push('Well-supported with relevant evidence');
    }
    if (scores.coherenceScore >= 80) {
      strengths.push('Highly coherent and internally consistent');
    }
    if (scores.depthScore >= 80) {
      strengths.push('Thorough analysis with consideration of alternatives');
    }
    if (scores.clarityScore >= 80) {
      strengths.push('Clear and well-articulated reasoning');
    }

    // Multi-dimensional strength
    const avgScore = (scores.logicScore + scores.evidenceScore + scores.coherenceScore +
                     scores.depthScore + scores.clarityScore) / 5;
    if (avgScore >= 75 && strengths.length >= 3) {
      strengths.push('Balanced reasoning across multiple dimensions');
    }

    return strengths.length > 0 ? strengths : ['Basic reasoning structure present'];
  }

  /**
   * Identify reasoning weaknesses
   */
  identifyWeaknesses(params) {
    const { logicScore, evidenceScore, coherenceScore, depthScore, clarityScore, fallaciesDetected } = params;
    const weaknesses = [];

    if (logicScore < 60) {
      weaknesses.push('Weak logical structure - reasoning steps may not follow logically');
    }
    if (evidenceScore < 60) {
      weaknesses.push('Insufficient evidence - claims need better support');
    }
    if (coherenceScore < 60) {
      weaknesses.push('Lack of coherence - reasoning may be inconsistent or disjointed');
    }
    if (depthScore < 60) {
      weaknesses.push('Shallow analysis - needs deeper exploration of the problem');
    }
    if (clarityScore < 60) {
      weaknesses.push('Unclear expression - reasoning is difficult to follow');
    }

    if (fallaciesDetected.length > 0) {
      weaknesses.push(`Logical fallacies detected: ${fallaciesDetected.length} fallacy(ies)`);
    }

    return weaknesses;
  }

  /**
   * Generate improvement suggestions
   */
  generateImprovementSuggestions(params) {
    const { logicScore, evidenceScore, coherenceScore, depthScore, clarityScore,
            weaknesses, fallaciesDetected } = params;
    const suggestions = [];

    if (logicScore < 70) {
      suggestions.push('Structure reasoning with clear premises → inference → conclusion');
      suggestions.push('Use logical connectors (therefore, because, thus) to show relationships');
    }

    if (evidenceScore < 70) {
      suggestions.push('Support claims with specific data, research, or expert opinions');
      suggestions.push('Cite sources for evidence and explain their relevance');
    }

    if (coherenceScore < 70) {
      suggestions.push('Ensure each reasoning step builds on the previous one');
      suggestions.push('Use consistent terminology throughout the analysis');
    }

    if (depthScore < 70) {
      suggestions.push('Consider alternative explanations or approaches');
      suggestions.push('Analyze cause-and-effect relationships more thoroughly');
      suggestions.push('Examine assumptions and their validity');
    }

    if (clarityScore < 70) {
      suggestions.push('Break down complex reasoning into clearer steps');
      suggestions.push('Use simpler language where possible');
      suggestions.push('Add structural markers (First, Second, Finally)');
    }

    if (fallaciesDetected.length > 0) {
      suggestions.push('Review reasoning for logical fallacies and correct them');
      fallaciesDetected.forEach(fallacy => {
        suggestions.push(`Address: ${fallacy}`);
      });
    }

    // High-level suggestion if multiple weaknesses
    if (weaknesses.length >= 3) {
      suggestions.unshift('Consider restructuring the entire reasoning approach');
    }

    return suggestions;
  }

  /**
   * Get reasoning quality for a decision
   */
  async getReasoningQuality(decisionId) {
    const query = `
      SELECT * FROM reasoning_quality_scores
      WHERE decision_id = $1
      ORDER BY scored_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [decisionId]);
    return result.rows[0];
  }

  /**
   * Get agent's reasoning quality trends
   */
  async getAgentReasoningTrends(agentId, days = 30) {
    const query = `
      SELECT
        DATE(scored_at) as date,
        AVG(overall_quality) as avg_quality,
        AVG(logic_score) as avg_logic,
        AVG(evidence_score) as avg_evidence,
        AVG(coherence_score) as avg_coherence,
        AVG(depth_score) as avg_depth,
        AVG(clarity_score) as avg_clarity,
        COUNT(*) as count
      FROM reasoning_quality_scores
      WHERE agent_id = $1
        AND scored_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(scored_at)
      ORDER BY date DESC
    `;

    const result = await this.db.query(query, [agentId]);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.db.end();
  }
}

// Singleton instance
const reasoningQualityService = new ReasoningQualityService();

export default reasoningQualityService;
