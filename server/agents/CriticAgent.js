/**
 * Critic Agent
 * Specializes in critiquing decisions, identifying risks, and suggesting alternatives
 */

import { BaseAgent } from './BaseAgent.js';

export class CriticAgent extends BaseAgent {
  constructor(config = {}, connectionConfig = null) {
    const capabilities = [
      'decision_critique',
      'risk_identification',
      'alternative_suggestion',
      'assumption_challenging',
      'quality_evaluation'
    ];

    super('Critic', capabilities, config, connectionConfig);
  }

  /**
   * Process critique task
   */
  async process(task, context = {}) {
    await this.updateStatus('BUSY');
    const startTime = Date.now();

    try {
      const { taskType, data, options = {} } = task;

      let result;
      switch (taskType) {
        case 'critique':
          result = await this.critique(data, context);
          break;
        case 'identify_risks':
          result = await this.identifyRisks(data, options);
          break;
        case 'suggest_alternatives':
          result = await this.suggestAlternatives(data, options);
          break;
        case 'challenge_assumptions':
          result = await this.challengeAssumptions(data);
          break;
        case 'evaluate_quality':
          result = await this.evaluateQuality(data, options);
          break;
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }

      const duration = Date.now() - startTime;
      await this.updateMetrics(true, duration);
      await this.updateStatus('IDLE');

      return {
        success: true,
        result,
        agentId: this.agentId,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.updateMetrics(false, duration);
      await this.updateStatus('ERROR');

      return {
        success: false,
        error: error.message,
        agentId: this.agentId,
        duration
      };
    }
  }

  /**
   * Provide comprehensive critique of a decision
   */
  async critique(decision, context = {}) {
    const { decisionType, details, rationale } = decision;

    const strengths = [];
    const weaknesses = [];
    const risks = [];
    const improvements = [];

    // Analyze based on decision type
    if (decisionType === 'lead_assignment') {
      return await this.critiqueLeadAssignment(details);
    } else if (decisionType === 'scoring') {
      return await this.critiqueScoring(details);
    } else if (decisionType === 'outreach') {
      return await this.critiqueOutreach(details);
    }

    // Generic critique
    if (rationale) {
      strengths.push('Decision includes clear rationale');
    } else {
      weaknesses.push('No rationale provided for decision');
    }

    if (details && Object.keys(details).length > 3) {
      strengths.push('Decision based on multiple factors');
    } else {
      weaknesses.push('Limited factors considered in decision');
    }

    return {
      overallAssessment: this.calculateCritiqueScore(strengths, weaknesses, risks),
      strengths,
      weaknesses,
      risks,
      improvements,
      recommendation: this.generateRecommendation(strengths, weaknesses, risks)
    };
  }

  /**
   * Critique lead assignment decision
   */
  async critiqueLeadAssignment(assignment) {
    const { opportunityId, assignedTo, reason, priority } = assignment;

    const strengths = [];
    const weaknesses = [];
    const risks = [];
    const improvements = [];

    // Get lead score for validation
    const query = `
      SELECT ls.*, ol.state
      FROM lead_scores ls
      JOIN opportunity_lifecycle ol ON ls.opportunity_id = ol.opportunity_id
      WHERE ls.opportunity_id = $1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      weaknesses.push('Lead has no score - assignment may be premature');
      risks.push('HIGH: Assigning unscored lead could waste rep time');
      improvements.push('Calculate lead score before assignment');
    } else {
      const lead = result.rows[0];

      strengths.push(`Lead has score: ${lead.lead_score} (${lead.grade})`);

      // Check if assignment matches grade
      const expectedTier = this.getExpectedTier(lead.grade);

      if (assignedTo && assignedTo.includes(expectedTier.toLowerCase())) {
        strengths.push(`Assignment matches grade level (${expectedTier})`);
      } else {
        weaknesses.push('Assignment tier may not match lead grade');
        improvements.push(`Consider assigning to ${expectedTier} tier rep`);
      }

      // Check priority alignment
      if (lead.grade.startsWith('A') && priority !== 'URGENT') {
        weaknesses.push('High-grade lead not marked as urgent');
        improvements.push('Set priority to URGENT for A+/A grade leads');
      }

      // Check for decay
      if (lead.decay_applied && lead.decay_rate > 0.2) {
        risks.push('MEDIUM: Lead shows decay - may need re-engagement first');
        improvements.push('Consider re-engagement activities before assignment');
      }
    }

    // Check rep capacity (only if assignedTo is a valid UUID)
    try {
      const capacityQuery = `
        SELECT COUNT(*) as active_leads
        FROM lead_assignments
        WHERE assigned_to = $1 AND status = 'ACTIVE'
      `;

      const capacityResult = await this.pool.query(capacityQuery, [assignedTo]);
      const activeLeads = parseInt(capacityResult.rows[0].active_leads);

      if (activeLeads > 15) {
        risks.push(`MEDIUM: Rep has ${activeLeads} active leads - may be overloaded`);
        improvements.push('Consider load-balancing across team');
      } else if (activeLeads < 5) {
        strengths.push(`Rep has capacity (${activeLeads} active leads)`);
      }
    } catch (error) {
      // If capacity check fails (e.g., invalid UUID), note it as a weakness
      weaknesses.push('Unable to verify rep capacity');
    }

    return {
      overallAssessment: this.calculateCritiqueScore(strengths, weaknesses, risks),
      strengths,
      weaknesses,
      risks,
      improvements,
      recommendation: this.generateRecommendation(strengths, weaknesses, risks)
    };
  }

  /**
   * Critique scoring decision
   */
  async critiqueScoring(scoring) {
    const { opportunityId, leadScore, grade, components } = scoring;

    const strengths = [];
    const weaknesses = [];
    const risks = [];
    const improvements = [];

    // Validate score components
    if (components) {
      const { qScore, engagementScore, fitScore } = components;

      if (qScore && engagementScore && fitScore) {
        strengths.push('All score components present');

        // Check for imbalance
        const max = Math.max(qScore, engagementScore, fitScore);
        const min = Math.min(qScore, engagementScore, fitScore);

        if (max / min > 5) {
          weaknesses.push('Significant imbalance in score components');
          improvements.push('Investigate why one component is much higher/lower');
        }

        // Check if engagement is too low
        if (engagementScore < 40) {
          risks.push('LOW: Low engagement score may indicate cold lead');
          improvements.push('Consider warming up lead before heavy investment');
        }
      } else {
        weaknesses.push('Missing score components');
      }
    }

    // Compare with historical patterns
    const avgQuery = `
      SELECT AVG(lead_score) as avg_score
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '30 days'
    `;

    const avgResult = await this.pool.query(avgQuery);
    const avgScore = parseFloat(avgResult.rows[0].avg_score);

    if (leadScore > avgScore * 1.5) {
      risks.push('MEDIUM: Score significantly above average - verify accuracy');
    } else if (leadScore < avgScore * 0.5) {
      risks.push('LOW: Score significantly below average - lead may not be qualified');
    }

    return {
      overallAssessment: this.calculateCritiqueScore(strengths, weaknesses, risks),
      strengths,
      weaknesses,
      risks,
      improvements,
      recommendation: this.generateRecommendation(strengths, weaknesses, risks)
    };
  }

  /**
   * Critique outreach decision
   */
  async critiqueOutreach(outreach) {
    const { channel, timing, personalization, content } = outreach;

    const strengths = [];
    const weaknesses = [];
    const risks = [];
    const improvements = [];

    if (personalization && personalization.level === 'high') {
      strengths.push('High level of personalization');
    } else {
      weaknesses.push('Limited personalization may reduce effectiveness');
      improvements.push('Increase personalization with company-specific details');
    }

    if (channel === 'email' && timing === 'business_hours') {
      strengths.push('Optimal timing for email outreach');
    } else if (channel === 'email' && timing === 'off_hours') {
      weaknesses.push('Email sent during off-hours may get buried');
      improvements.push('Schedule for optimal business hours');
    }

    if (!content || content.length < 100) {
      risks.push('MEDIUM: Content may be too brief to convey value');
      improvements.push('Expand content to better communicate value proposition');
    }

    return {
      overallAssessment: this.calculateCritiqueScore(strengths, weaknesses, risks),
      strengths,
      weaknesses,
      risks,
      improvements,
      recommendation: this.generateRecommendation(strengths, weaknesses, risks)
    };
  }

  /**
   * Identify risks in an action or decision
   */
  async identifyRisks(action, constraints = {}) {
    const risks = [];

    // Check for missing critical data
    if (!action.data || Object.keys(action.data).length < 3) {
      risks.push({
        type: 'DATA_INSUFFICIENCY',
        severity: 'MEDIUM',
        description: 'Insufficient data for informed decision',
        mitigation: 'Gather more data before proceeding'
      });
    }

    // Check for timing risks
    if (action.urgent && !action.validated) {
      risks.push({
        type: 'HASTY_DECISION',
        severity: 'MEDIUM',
        description: 'Urgent decision without validation',
        mitigation: 'Quick validation check before execution'
      });
    }

    // Check for resource risks
    if (action.resourceIntensive && constraints.limitedResources) {
      risks.push({
        type: 'RESOURCE_CONSTRAINT',
        severity: 'HIGH',
        description: 'Resource-intensive action with limited resources',
        mitigation: 'Prioritize or defer until resources available'
      });
    }

    return {
      totalRisks: risks.length,
      highSeverity: risks.filter(r => r.severity === 'HIGH').length,
      risks,
      overallRisk: this.calculateOverallRisk(risks)
    };
  }

  /**
   * Suggest alternatives to a proposed action
   */
  async suggestAlternatives(proposal, options = {}) {
    const { maxAlternatives = 3 } = options;
    const alternatives = [];

    // Generate alternatives based on proposal type
    if (proposal.type === 'lead_assignment') {
      alternatives.push({
        approach: 'Round-robin assignment',
        rationale: 'Distribute workload evenly across team',
        tradeoffs: 'May not optimize for expertise match'
      });

      alternatives.push({
        approach: 'Skills-based assignment',
        rationale: 'Match lead to rep with relevant expertise',
        tradeoffs: 'May create uneven workload distribution'
      });

      alternatives.push({
        approach: 'Automated nurture first',
        rationale: 'Warm up lead before human assignment',
        tradeoffs: 'Slower but more efficient use of rep time'
      });
    } else {
      // Generic alternatives
      alternatives.push({
        approach: 'Staged approach',
        rationale: 'Break into smaller steps with validation',
        tradeoffs: 'Slower but lower risk'
      });

      alternatives.push({
        approach: 'Pilot test',
        rationale: 'Test on small sample before full rollout',
        tradeoffs: 'Requires more time for testing phase'
      });
    }

    return {
      proposedApproach: proposal.approach,
      alternatives: alternatives.slice(0, maxAlternatives),
      recommendation: alternatives[0]
    };
  }

  /**
   * Challenge assumptions in reasoning
   */
  async challengeAssumptions(reasoning) {
    const { assumptions = [], conclusion } = reasoning;

    const challenges = [];

    for (const assumption of assumptions) {
      challenges.push({
        assumption,
        challenge: await this.formulateChallenge(assumption),
        counterExample: await this.findCounterExample(assumption)
      });
    }

    return {
      assumptionsChallenged: challenges.length,
      challenges,
      alternativeConclusions: this.generateAlternativeConclusions(challenges)
    };
  }

  /**
   * Evaluate quality of output/decision
   */
  async evaluateQuality(output, criteria = {}) {
    const { standards = {} } = criteria;

    const scores = {
      completeness: this.evaluateCompleteness(output),
      accuracy: 0.85, // Placeholder - would need ground truth
      relevance: this.evaluateRelevance(output, criteria),
      timeliness: 0.9 // Placeholder
    };

    const overallQuality = Object.values(scores).reduce((a, b) => a + b, 0) / 4;

    return {
      overallQuality,
      scores,
      meetsStandards: overallQuality >= (standards.threshold || 0.7),
      feedback: this.generateQualityFeedback(scores)
    };
  }

  // Helper methods
  getExpectedTier(grade) {
    if (['A+', 'A'].includes(grade)) return 'SENIOR';
    if (['B+', 'B'].includes(grade)) return 'MID_LEVEL';
    return 'JUNIOR';
  }

  calculateCritiqueScore(strengths, weaknesses, risks) {
    const strengthScore = strengths.length * 0.2;
    const weaknessScore = weaknesses.length * -0.15;
    const riskScore = risks.length * -0.25;

    const rawScore = 0.7 + strengthScore + weaknessScore + riskScore;
    return Math.max(0, Math.min(1, rawScore));
  }

  generateRecommendation(strengths, weaknesses, risks) {
    const highRisks = risks.filter(r => r.includes('HIGH')).length;

    if (highRisks > 0) {
      return 'REJECT - High risks identified that should be addressed first';
    }

    if (weaknesses.length > strengths.length) {
      return 'REVISE - Weaknesses outweigh strengths, needs improvement';
    }

    if (risks.length > 2) {
      return 'CONDITIONAL - Proceed with caution and mitigation measures';
    }

    return 'APPROVE - Decision appears sound with acceptable trade-offs';
  }

  calculateOverallRisk(risks) {
    if (risks.length === 0) return 'LOW';

    const hasHigh = risks.some(r => r.severity === 'HIGH');
    const hasMultipleMedium = risks.filter(r => r.severity === 'MEDIUM').length >= 2;

    if (hasHigh) return 'HIGH';
    if (hasMultipleMedium) return 'MEDIUM';
    return 'LOW';
  }

  async formulateChallenge(assumption) {
    return `What if ${assumption} is not always true?`;
  }

  async findCounterExample(assumption) {
    return 'Consider cases where conditions differ from the norm';
  }

  generateAlternativeConclusions(challenges) {
    return ['Alternative conclusion based on challenged assumptions'];
  }

  evaluateCompleteness(output) {
    const expectedFields = ['result', 'confidence', 'reasoning'];
    const present = expectedFields.filter(f => output[f]).length;
    return present / expectedFields.length;
  }

  evaluateRelevance(output, criteria) {
    // Check if output addresses the criteria
    return 0.85; // Placeholder
  }

  generateQualityFeedback(scores) {
    const feedback = [];

    if (scores.completeness < 0.7) {
      feedback.push('Output is incomplete - missing key information');
    }

    if (scores.relevance < 0.7) {
      feedback.push('Output may not be relevant to the request');
    }

    if (feedback.length === 0) {
      feedback.push('Output meets quality standards');
    }

    return feedback;
  }
}

export default CriticAgent;
