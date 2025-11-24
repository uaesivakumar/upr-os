/**
 * Collaborative Decision Service
 * Sprint 46 - Multi-Agent Reflection & Meta-Cognition System
 *
 * Enables:
 * - Multi-agent collaborative decision-making
 * - Proposal collection and evaluation
 * - Voting mechanisms
 * - Consensus building algorithms
 * - Disagreement resolution
 * - Collective learning extraction
 *
 * "None of us is as smart as all of us" - Ken Blanchard
 */

import pool from '../db.js';

class CollaborativeDecisionService {
  constructor() {
    this.db = pool;
    this.consensusMethods = this.initializeConsensusMethods();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize consensus building methods
   */
  initializeConsensusMethods() {
    return {
      UNANIMOUS: {
        description: 'All agents must agree',
        threshold: 1.0,
        min_agents: 2
      },
      MAJORITY: {
        description: 'More than 50% agreement',
        threshold: 0.51,
        min_agents: 3
      },
      SUPERMAJORITY: {
        description: '2/3 or more agreement',
        threshold: 0.67,
        min_agents: 3
      },
      WEIGHTED: {
        description: 'Weighted by expertise and confidence',
        threshold: 0.6,
        min_agents: 2
      },
      LEADER_DECIDES: {
        description: 'Lead agent makes final call after consultation',
        threshold: 0.0,
        min_agents: 2
      },
      EXPERT_DECIDES: {
        description: 'Highest expertise agent decides',
        threshold: 0.0,
        min_agents: 2
      }
    };
  }

  /**
   * Initiate collaborative decision
   *
   * @param {Object} params - Collaboration parameters
   * @returns {Object} Collaborative decision record
   */
  async initiateCollaborativeDecision(params) {
    const {
      lead_agent_id,
      participating_agents,
      decision_context,
      consensus_method = 'MAJORITY',
      time_limit_minutes = 60
    } = params;

    // Validate
    if (!participating_agents || participating_agents.length < 1) {
      throw new Error('At least 2 agents (including lead) required for collaboration');
    }

    const method = this.consensusMethods[consensus_method];
    if (!method) {
      throw new Error(`Unknown consensus method: ${consensus_method}`);
    }

    const totalAgents = participating_agents.length + 1; // +1 for lead
    if (totalAgents < method.min_agents) {
      throw new Error(`${consensus_method} requires at least ${method.min_agents} agents`);
    }

    // Create collaboration record
    const result = await this.db.query(
      `INSERT INTO collaborative_decisions (
        lead_agent_id,
        participating_agents,
        decision_context,
        consensus_method,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, 'IN_PROGRESS', NOW())
      RETURNING *`,
      [
        lead_agent_id,
        participating_agents,
        JSON.stringify(decision_context),
        consensus_method
      ]
    );

    return result.rows[0];
  }

  /**
   * Collect proposals from participating agents
   *
   * @param {String} collaborationId - Collaboration ID
   * @param {Array} proposals - Agent proposals
   * @returns {Object} Updated collaboration
   */
  async collectProposals(collaborationId, proposals) {
    // Get collaboration
    const collab = await this.getCollaboration(collaborationId);
    if (!collab) {
      throw new Error('Collaboration not found');
    }

    // Validate proposals
    this.validateProposals(proposals, collab);

    // Analyze proposals
    const analysis = this.analyzeProposals(proposals);

    // Store proposals
    await this.db.query(
      `UPDATE collaborative_decisions
       SET individual_proposals = $1
       WHERE id = $2`,
      [JSON.stringify(proposals), collaborationId]
    );

    return {
      collaboration_id: collaborationId,
      proposal_count: proposals.length,
      analysis: analysis
    };
  }

  /**
   * Validate proposals
   */
  validateProposals(proposals, collaboration) {
    const requiredAgents = [
      collaboration.lead_agent_id,
      ...collaboration.participating_agents
    ];

    // Check all agents submitted
    const submittedAgents = proposals.map(p => p.agent_id);
    const missingAgents = requiredAgents.filter(a => !submittedAgents.includes(a));

    if (missingAgents.length > 0) {
      throw new Error(`Missing proposals from agents: ${missingAgents.join(', ')}`);
    }

    // Validate proposal structure
    proposals.forEach(proposal => {
      if (!proposal.agent_id || !proposal.recommendation) {
        throw new Error('Invalid proposal structure');
      }
    });
  }

  /**
   * Analyze proposals for similarities and differences
   */
  analyzeProposals(proposals) {
    // Group by recommendation
    const groupedByRec = {};
    proposals.forEach(p => {
      const rec = JSON.stringify(p.recommendation);
      if (!groupedByRec[rec]) {
        groupedByRec[rec] = [];
      }
      groupedByRec[rec].push(p.agent_id);
    });

    // Find consensus areas
    const totalAgents = proposals.length;
    const majoritySize = Math.ceil(totalAgents / 2);

    const consensusAreas = Object.entries(groupedByRec)
      .filter(([rec, agents]) => agents.length >= majoritySize)
      .map(([rec, agents]) => ({
        recommendation: JSON.parse(rec),
        support: agents.length,
        support_pct: (agents.length / totalAgents) * 100
      }));

    // Find disagreement areas
    const disagreements = Object.entries(groupedByRec)
      .filter(([rec, agents]) => agents.length < majoritySize)
      .map(([rec, agents]) => ({
        recommendation: JSON.parse(rec),
        support: agents.length,
        agents: agents
      }));

    // Calculate confidence aggregate
    const confidences = proposals.map(p => p.confidence || 0.5);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return {
      total_proposals: totalAgents,
      consensus_areas: consensusAreas,
      disagreement_areas: disagreements,
      unique_recommendations: Object.keys(groupedByRec).length,
      average_confidence: avgConfidence
    };
  }

  /**
   * Conduct voting
   *
   * @param {String} collaborationId - Collaboration ID
   * @param {Array} votes - Agent votes
   * @returns {Object} Voting results
   */
  async conductVoting(collaborationId, votes) {
    const collab = await this.getCollaboration(collaborationId);
    if (!collab) {
      throw new Error('Collaboration not found');
    }

    // Tally votes
    const tallyResults = this.tallyVotes(votes, collab);

    // Store voting results
    await this.db.query(
      `UPDATE collaborative_decisions
       SET voting_results = $1
       WHERE id = $2`,
      [JSON.stringify(tallyResults), collaborationId]
    );

    return tallyResults;
  }

  /**
   * Tally votes
   */
  tallyVotes(votes, collaboration) {
    const voteCount = {};
    const voterInfo = {};

    votes.forEach(vote => {
      const option = vote.vote_for;
      if (!voteCount[option]) {
        voteCount[option] = 0;
        voterInfo[option] = [];
      }
      voteCount[option]++;
      voterInfo[option].push({
        agent_id: vote.agent_id,
        confidence: vote.confidence,
        reasoning: vote.reasoning
      });
    });

    // Sort by vote count
    const sortedOptions = Object.entries(voteCount)
      .sort(([, a], [, b]) => b - a)
      .map(([option, count]) => ({
        option,
        votes: count,
        percentage: (count / votes.length) * 100,
        voters: voterInfo[option]
      }));

    const winner = sortedOptions[0];
    const totalVotes = votes.length;

    return {
      total_votes: totalVotes,
      results: sortedOptions,
      winner: winner.option,
      winner_votes: winner.votes,
      winner_percentage: winner.percentage,
      is_tie: sortedOptions.length > 1 && sortedOptions[0].votes === sortedOptions[1].votes
    };
  }

  /**
   * Build consensus
   *
   * @param {String} collaborationId - Collaboration ID
   * @returns {Object} Consensus decision
   */
  async buildConsensus(collaborationId) {
    const collab = await this.getCollaboration(collaborationId);
    if (!collab) {
      throw new Error('Collaboration not found');
    }

    const proposals = collab.individual_proposals || [];
    const votingResults = collab.voting_results;

    // Apply consensus method
    const consensus = this.applyConsensusMethod(
      collab.consensus_method,
      proposals,
      votingResults,
      collab
    );

    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(
      consensus.decision,
      proposals
    );

    // Identify dissenting agents
    const dissent = this.identifyDissent(
      consensus.decision,
      proposals,
      collab
    );

    // Calculate confidence aggregate
    const confidenceAggregate = this.calculateConfidenceAggregate(
      proposals,
      consensus.decision
    );

    // Update database
    await this.db.query(
      `UPDATE collaborative_decisions
       SET final_decision = $1,
           agreement_level = $2,
           confidence_aggregate = $3,
           dissenting_agents = $4,
           dissent_reasons = $5,
           status = 'COMPLETED'
       WHERE id = $6`,
      [
        JSON.stringify(consensus.decision),
        agreementLevel,
        confidenceAggregate,
        dissent.agents,
        JSON.stringify(dissent.reasons),
        collaborationId
      ]
    );

    return {
      collaboration_id: collaborationId,
      final_decision: consensus.decision,
      consensus_method: collab.consensus_method,
      agreement_level: agreementLevel,
      confidence: confidenceAggregate,
      dissent: dissent,
      reasoning: consensus.reasoning
    };
  }

  /**
   * Apply consensus method
   */
  applyConsensusMethod(method, proposals, votingResults, collaboration) {
    switch (method) {
      case 'UNANIMOUS':
        return this.applyUnanimous(proposals);

      case 'MAJORITY':
      case 'SUPERMAJORITY':
        return this.applyMajority(votingResults, method);

      case 'WEIGHTED':
        return this.applyWeighted(proposals);

      case 'LEADER_DECIDES':
        return this.applyLeaderDecides(proposals, collaboration.lead_agent_id);

      case 'EXPERT_DECIDES':
        return this.applyExpertDecides(proposals);

      default:
        throw new Error(`Unknown consensus method: ${method}`);
    }
  }

  /**
   * Unanimous consensus
   */
  applyUnanimous(proposals) {
    // All must agree
    const firstRec = JSON.stringify(proposals[0].recommendation);
    const allAgree = proposals.every(p =>
      JSON.stringify(p.recommendation) === firstRec
    );

    if (!allAgree) {
      throw new Error('Unanimous consensus not reached - proposals differ');
    }

    return {
      decision: proposals[0].recommendation,
      reasoning: 'All agents unanimously agreed on this decision'
    };
  }

  /**
   * Majority/Supermajority consensus
   */
  applyMajority(votingResults, method) {
    if (!votingResults || !votingResults.winner) {
      throw new Error('Voting results required for majority consensus');
    }

    const threshold = this.consensusMethods[method].threshold;
    const winnerPct = votingResults.winner_percentage / 100;

    if (winnerPct < threshold) {
      throw new Error(`${method} threshold not met: ${winnerPct.toFixed(2)} < ${threshold}`);
    }

    return {
      decision: votingResults.winner,
      reasoning: `${method} consensus reached with ${votingResults.winner_percentage.toFixed(1)}% agreement`
    };
  }

  /**
   * Weighted consensus
   */
  applyWeighted(proposals) {
    // Weight by confidence and expertise (if available)
    const weightedScores = {};

    proposals.forEach(proposal => {
      const rec = JSON.stringify(proposal.recommendation);
      const weight = (proposal.confidence || 0.5) * (proposal.expertise || 1.0);

      if (!weightedScores[rec]) {
        weightedScores[rec] = 0;
      }
      weightedScores[rec] += weight;
    });

    // Find highest weighted
    const sorted = Object.entries(weightedScores).sort(([, a], [, b]) => b - a);
    const winner = sorted[0];

    return {
      decision: JSON.parse(winner[0]),
      reasoning: `Weighted consensus based on confidence and expertise (score: ${winner[1].toFixed(2)})`
    };
  }

  /**
   * Leader decides
   */
  applyLeaderDecides(proposals, leadAgentId) {
    const leaderProposal = proposals.find(p => p.agent_id === leadAgentId);

    if (!leaderProposal) {
      throw new Error('Leader proposal not found');
    }

    return {
      decision: leaderProposal.recommendation,
      reasoning: 'Lead agent made final decision after considering all proposals'
    };
  }

  /**
   * Expert decides
   */
  applyExpertDecides(proposals) {
    // Find highest expertise agent
    const expertProposal = proposals.reduce((max, p) =>
      (p.expertise || 0) > (max.expertise || 0) ? p : max
    );

    return {
      decision: expertProposal.recommendation,
      reasoning: `Expert agent (expertise: ${expertProposal.expertise || 'N/A'}) made final decision`
    };
  }

  /**
   * Calculate agreement level
   */
  calculateAgreementLevel(finalDecision, proposals) {
    const finalStr = JSON.stringify(finalDecision);
    const agreeing = proposals.filter(p =>
      JSON.stringify(p.recommendation) === finalStr
    ).length;

    return agreeing / proposals.length;
  }

  /**
   * Identify dissenting agents
   */
  identifyDissent(finalDecision, proposals, collaboration) {
    const finalStr = JSON.stringify(finalDecision);
    const dissenting = proposals.filter(p =>
      JSON.stringify(p.recommendation) !== finalStr
    );

    const dissentingAgents = dissenting.map(p => p.agent_id);
    const dissentReasons = dissenting.map(p => ({
      agent_id: p.agent_id,
      preferred_option: p.recommendation,
      reasoning: p.reasoning,
      concerns: p.concerns || []
    }));

    return {
      agents: dissentingAgents,
      count: dissentingAgents.length,
      reasons: dissentReasons
    };
  }

  /**
   * Calculate aggregate confidence
   */
  calculateConfidenceAggregate(proposals, finalDecision) {
    const finalStr = JSON.stringify(finalDecision);

    // Average confidence of agents who agreed
    const agreeing = proposals.filter(p =>
      JSON.stringify(p.recommendation) === finalStr
    );

    if (agreeing.length === 0) {
      // No direct agreement, take weighted average
      const confidences = proposals.map(p => p.confidence || 0.5);
      return confidences.reduce((a, b) => a + b, 0) / confidences.length;
    }

    const agreeingConfidences = agreeing.map(p => p.confidence || 0.5);
    return agreeingConfidences.reduce((a, b) => a + b, 0) / agreeingConfidences.length;
  }

  /**
   * Resolve disagreements
   *
   * @param {String} collaborationId - Collaboration ID
   * @param {String} resolution_method - How to resolve
   * @returns {Object} Resolution result
   */
  async resolveDisagreements(collaborationId, resolutionMethod = 'DISCUSSION') {
    const collab = await this.getCollaboration(collaborationId);
    if (!collab) {
      throw new Error('Collaboration not found');
    }

    if (!collab.dissenting_agents || collab.dissenting_agents.length === 0) {
      return {
        resolution_needed: false,
        message: 'No disagreements to resolve'
      };
    }

    let resolution;

    switch (resolutionMethod) {
      case 'DISCUSSION':
        resolution = this.resolveViaDiscussion(collab);
        break;

      case 'COMPROMISE':
        resolution = this.resolveViaCompromise(collab);
        break;

      case 'DEFER_TO_DATA':
        resolution = this.resolveDeferToData(collab);
        break;

      case 'ESCALATE':
        resolution = this.resolveViaEscalation(collab);
        break;

      default:
        throw new Error(`Unknown resolution method: ${resolutionMethod}`);
    }

    return resolution;
  }

  resolveViaDiscussion(collaboration) {
    return {
      method: 'DISCUSSION',
      action: 'Facilitate structured discussion among dissenting agents',
      steps: [
        'Each dissenting agent presents key concerns',
        'Majority explains rationale for decision',
        'Identify common ground and areas of concern',
        'Revise decision if critical concerns identified'
      ],
      expected_outcome: 'Better understanding and potential decision refinement'
    };
  }

  resolveViaCompromise(collaboration) {
    const dissentReasons = collaboration.dissent_reasons || [];

    return {
      method: 'COMPROMISE',
      action: 'Find middle ground that addresses key concerns',
      concerns_to_address: dissentReasons.map(d => d.concerns).flat(),
      suggestion: 'Modify decision to incorporate valid concerns while maintaining core direction',
      expected_outcome: 'Decision that better represents all viewpoints'
    };
  }

  resolveDeferToData(collaboration) {
    return {
      method: 'DEFER_TO_DATA',
      action: 'Gather additional data to resolve disagreement objectively',
      steps: [
        'Identify testable claims in disagreement',
        'Collect relevant data or evidence',
        'Re-evaluate proposals with new information',
        'Make data-informed decision'
      ],
      expected_outcome: 'Objective resolution based on evidence'
    };
  }

  resolveViaEscalation(collaboration) {
    return {
      method: 'ESCALATE',
      action: 'Escalate to higher authority or external mediator',
      reason: 'Disagreement cannot be resolved at current level',
      next_steps: [
        'Document disagreement and all viewpoints',
        'Present to designated authority',
        'Accept authority decision',
        'Document learnings from disagreement'
      ]
    };
  }

  /**
   * Extract collective learning
   *
   * @param {String} collaborationId - Collaboration ID
   * @returns {Object} Collective learnings
   */
  async extractCollectiveLearning(collaborationId) {
    const collab = await this.getCollaboration(collaborationId);
    if (!collab) {
      throw new Error('Collaboration not found');
    }

    const proposals = collab.individual_proposals || [];

    // Synthesis of insights
    const insights = this.synthesizeInsights(proposals);

    // Best practices observed
    const bestPractices = this.identifyBestPractices(collab);

    // Lessons learned
    const lessons = this.extractLessons(collab);

    return {
      collaboration_id: collaborationId,
      insights: insights,
      best_practices: bestPractices,
      lessons_learned: lessons,
      collective_wisdom: this.generateCollectiveWisdom(insights, lessons)
    };
  }

  synthesizeInsights(proposals) {
    const allReasoning = proposals.map(p => p.reasoning).filter(r => r);

    return {
      diverse_perspectives: proposals.length,
      common_themes: this.findCommonThemes(allReasoning),
      unique_insights: this.findUniqueInsights(proposals),
      knowledge_sharing: 'Agents shared different aspects of problem understanding'
    };
  }

  findCommonThemes(reasoningArray) {
    // Simple keyword frequency analysis
    const words = reasoningArray.join(' ').toLowerCase().split(/\s+/);
    const wordFreq = {};

    words.forEach(word => {
      if (word.length > 4) { // Ignore short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word, freq]) => ({ theme: word, frequency: freq }));
  }

  findUniqueInsights(proposals) {
    // Proposals mentioned by only one agent
    const recommendations = {};

    proposals.forEach(p => {
      const rec = JSON.stringify(p.recommendation);
      if (!recommendations[rec]) {
        recommendations[rec] = [];
      }
      recommendations[rec].push(p.agent_id);
    });

    const unique = Object.entries(recommendations)
      .filter(([, agents]) => agents.length === 1)
      .map(([rec, agents]) => ({
        agent: agents[0],
        insight: 'Unique perspective provided'
      }));

    return unique.length;
  }

  identifyBestPractices(collaboration) {
    const practices = [];

    if (collaboration.agreement_level >= 0.8) {
      practices.push('High agreement reached - effective consensus building');
    }

    if (collaboration.confidence_aggregate >= 0.7) {
      practices.push('Strong collective confidence - thorough analysis');
    }

    if (collaboration.dissenting_agents && collaboration.dissenting_agents.length > 0) {
      practices.push('Dissenting views documented - healthy debate culture');
    }

    return practices;
  }

  extractLessons(collaboration) {
    const lessons = [];

    const method = collaboration.consensus_method;
    const agreement = collaboration.agreement_level;

    lessons.push({
      topic: 'Consensus Method',
      lesson: `${method} resulted in ${(agreement * 100).toFixed(0)}% agreement`,
      application: agreement >= 0.7
        ? `${method} worked well for this decision type`
        : `Consider alternative method for similar decisions`
    });

    if (collaboration.dissenting_agents?.length > 0) {
      lessons.push({
        topic: 'Managing Dissent',
        lesson: `${collaboration.dissenting_agents.length} agents dissented`,
        application: 'Ensure dissenting views are heard and addressed'
      });
    }

    return lessons;
  }

  generateCollectiveWisdom(insights, lessons) {
    return `Collaboration of ${insights.diverse_perspectives} agents generated diverse perspectives. ` +
           `${lessons.length} key lessons learned about effective collaboration. ` +
           `Collective intelligence exceeded individual capabilities.`;
  }

  /**
   * Query methods
   */

  async getCollaboration(collaborationId) {
    const result = await this.db.query(
      'SELECT * FROM collaborative_decisions WHERE id = $1',
      [collaborationId]
    );
    return result.rows[0];
  }

  async getAgentCollaborations(agentId, limit = 20) {
    const result = await this.db.query(
      `SELECT * FROM collaborative_decisions
       WHERE lead_agent_id = $1 OR $1 = ANY(participating_agents)
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  async getCollaborationStats(agentId) {
    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_collaborations,
        AVG(agreement_level) as avg_agreement,
        AVG(confidence_aggregate) as avg_confidence,
        COUNT(*) FILTER (WHERE lead_agent_id = $1) as led_count
      FROM collaborative_decisions
      WHERE lead_agent_id = $1 OR $1 = ANY(participating_agents)`,
      [agentId]
    );
    return result.rows[0];
  }
}

// Singleton instance
const collaborativeDecisionService = new CollaborativeDecisionService();

export default collaborativeDecisionService;
