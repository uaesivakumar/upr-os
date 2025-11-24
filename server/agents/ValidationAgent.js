/**
 * Validation Agent
 * Specializes in validating data quality, decisions, and compliance
 */

import { BaseAgent } from './BaseAgent.js';

export class ValidationAgent extends BaseAgent {
  constructor(config = {}, connectionConfig = null) {
    const capabilities = [
      'data_validation',
      'quality_checking',
      'compliance_verification',
      'decision_validation',
      'schema_validation'
    ];

    super('Validation', capabilities, config, connectionConfig);
  }

  /**
   * Process validation task
   */
  async process(task, context = {}) {
    await this.updateStatus('BUSY');
    const startTime = Date.now();

    try {
      const { taskType, data, rules, options = {} } = task;

      let result;
      switch (taskType) {
        case 'validate_data':
          result = await this.validateData(data, rules);
          break;
        case 'validate_decision':
          result = await this.validateDecision(data, rules);
          break;
        case 'check_compliance':
          result = await this.checkCompliance(data, rules);
          break;
        case 'verify_quality':
          result = await this.verifyQuality(data, options);
          break;
        case 'cross_validate':
          result = await this.crossValidate(data, options);
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
   * Validate data against schema
   */
  async validateData(data, schema) {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (schema.required) {
      for (const field of schema.required) {
        if (!data[field]) {
          errors.push({
            field,
            type: 'MISSING_REQUIRED',
            message: `Required field '${field}' is missing`
          });
        }
      }
    }

    // Type validation
    if (schema.types) {
      for (const [field, expectedType] of Object.entries(schema.types)) {
        if (data[field]) {
          const actualType = typeof data[field];
          if (actualType !== expectedType) {
            errors.push({
              field,
              type: 'TYPE_MISMATCH',
              message: `Field '${field}' should be ${expectedType}, got ${actualType}`
            });
          }
        }
      }
    }

    // Range validation
    if (schema.ranges) {
      for (const [field, range] of Object.entries(schema.ranges)) {
        if (data[field] !== undefined) {
          const value = data[field];
          if (range.min !== undefined && value < range.min) {
            errors.push({
              field,
              type: 'OUT_OF_RANGE',
              message: `Field '${field}' (${value}) is below minimum (${range.min})`
            });
          }
          if (range.max !== undefined && value > range.max) {
            errors.push({
              field,
              type: 'OUT_OF_RANGE',
              message: `Field '${field}' (${value}) exceeds maximum (${range.max})`
            });
          }
        }
      }
    }

    // Pattern validation
    if (schema.patterns) {
      for (const [field, pattern] of Object.entries(schema.patterns)) {
        if (data[field]) {
          const regex = new RegExp(pattern);
          if (!regex.test(data[field])) {
            warnings.push({
              field,
              type: 'PATTERN_MISMATCH',
              message: `Field '${field}' does not match expected pattern`
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateValidationScore(errors, warnings)
    };
  }

  /**
   * Validate a decision against business rules
   */
  async validateDecision(decision, rules) {
    const violations = [];
    const passes = [];

    for (const rule of rules) {
      const { name, condition, severity = 'MEDIUM' } = rule;

      try {
        const passed = await this.evaluateCondition(condition, decision);

        if (passed) {
          passes.push({ rule: name, severity });
        } else {
          violations.push({
            rule: name,
            severity,
            message: `Decision violates rule: ${name}`
          });
        }
      } catch (error) {
        violations.push({
          rule: name,
          severity: 'ERROR',
          message: `Failed to evaluate rule: ${error.message}`
        });
      }
    }

    return {
      valid: violations.length === 0,
      passed: passes.length,
      violations,
      complianceRate: passes.length / (passes.length + violations.length)
    };
  }

  /**
   * Check compliance with policies
   */
  async checkCompliance(action, policies) {
    const checks = [];

    for (const policy of policies) {
      const { name, requirements } = policy;

      const compliant = await this.checkPolicyRequirements(action, requirements);

      checks.push({
        policy: name,
        compliant,
        details: compliant ? 'All requirements met' : 'Some requirements not met'
      });
    }

    const allCompliant = checks.every(c => c.compliant);

    return {
      compliant: allCompliant,
      checks,
      message: allCompliant ? 'Action is compliant with all policies' : 'Action has compliance issues'
    };
  }

  /**
   * Verify quality of an entity
   */
  async verifyQuality(entity, standards = {}) {
    const { entityType = 'lead', threshold = 0.7 } = standards;

    if (entityType === 'lead' && entity.opportunityId) {
      return await this.verifyLeadQuality(entity.opportunityId, threshold);
    }

    // Generic quality check
    const qualityFactors = {
      completeness: this.calculateCompleteness(entity),
      consistency: this.calculateConsistency(entity),
      accuracy: 0.8, // Placeholder - would need actual verification
      timeliness: this.calculateTimeliness(entity)
    };

    const overallQuality = Object.values(qualityFactors).reduce((a, b) => a + b, 0) / 4;

    return {
      quality: overallQuality,
      meetsThreshold: overallQuality >= threshold,
      factors: qualityFactors,
      recommendation: overallQuality >= threshold ? 'ACCEPT' : 'REJECT'
    };
  }

  /**
   * Verify lead quality specifically
   */
  async verifyLeadQuality(opportunityId, threshold) {
    // Check if lead has required data
    const query = `
      SELECT
        ol.*,
        ls.lead_score,
        ls.grade,
        COUNT(ot.id) as touchpoint_count
      FROM opportunity_lifecycle ol
      LEFT JOIN lead_scores ls ON ol.opportunity_id = ls.opportunity_id
      LEFT JOIN opportunity_touchpoints ot ON ol.opportunity_id = ot.opportunity_id
      WHERE ol.opportunity_id = $1
      GROUP BY ol.opportunity_id, ol.state, ol.trigger_type, ol.entered_at, ol.metadata, ls.lead_score, ls.grade
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      return {
        quality: 0,
        meetsThreshold: false,
        error: 'Lead not found',
        recommendation: 'REJECT'
      };
    }

    const lead = result.rows[0];

    // Calculate quality factors
    const hasScore = lead.lead_score !== null;
    const hasMetadata = lead.metadata && Object.keys(lead.metadata).length > 0;
    const hasTouchpoints = parseInt(lead.touchpoint_count) > 0;
    const hasGoodScore = lead.lead_score >= 5000;

    const quality = (
      (hasScore ? 0.3 : 0) +
      (hasMetadata ? 0.3 : 0) +
      (hasTouchpoints ? 0.2 : 0) +
      (hasGoodScore ? 0.2 : 0)
    );

    return {
      quality,
      meetsThreshold: quality >= threshold,
      factors: {
        hasScore,
        hasMetadata,
        hasTouchpoints,
        hasGoodScore
      },
      leadScore: lead.lead_score,
      grade: lead.grade,
      recommendation: quality >= threshold ? 'ACCEPT' : 'NEEDS_IMPROVEMENT'
    };
  }

  /**
   * Cross-validate result against multiple sources
   */
  async crossValidate(result, sources) {
    const validations = [];

    // Validate against recent similar leads
    if (result.leadScore) {
      const query = `
        SELECT AVG(lead_score) as avg, STDDEV(lead_score) as stddev
        FROM lead_scores
        WHERE calculated_at >= NOW() - INTERVAL '30 days'
      `;

      const stats = await this.pool.query(query);
      const { avg, stddev } = stats.rows[0];

      const zScore = Math.abs((result.leadScore - parseFloat(avg)) / parseFloat(stddev));

      validations.push({
        source: 'historical_comparison',
        valid: zScore < 3,
        details: `Score is ${zScore.toFixed(2)} standard deviations from mean`
      });
    }

    // Check consistency with grade
    if (result.leadScore && result.grade) {
      const expectedGrade = this.calculateExpectedGrade(result.leadScore);
      validations.push({
        source: 'grade_consistency',
        valid: expectedGrade === result.grade,
        details: `Expected ${expectedGrade}, got ${result.grade}`
      });
    }

    return {
      crossValidated: validations.every(v => v.valid),
      validations,
      confidence: validations.filter(v => v.valid).length / validations.length
    };
  }

  // Helper methods
  async evaluateCondition(condition, data) {
    // Simple condition evaluation
    const { field, operator, value } = condition;

    if (!data[field]) return false;

    switch (operator) {
      case 'equals':
        return data[field] === value;
      case 'greater_than':
        return data[field] > value;
      case 'less_than':
        return data[field] < value;
      case 'contains':
        return String(data[field]).includes(value);
      default:
        return false;
    }
  }

  async checkPolicyRequirements(action, requirements) {
    // Check each requirement
    for (const req of requirements) {
      if (!action[req.field]) return false;

      if (req.value && action[req.field] !== req.value) {
        return false;
      }
    }

    return true;
  }

  calculateCompleteness(entity) {
    const totalFields = Object.keys(entity).length;
    const filledFields = Object.values(entity).filter(v => v !== null && v !== undefined && v !== '').length;

    return totalFields > 0 ? filledFields / totalFields : 0;
  }

  calculateConsistency(entity) {
    // Check for internal consistency
    // For now, return high consistency
    return 0.9;
  }

  calculateTimeliness(entity) {
    if (entity.createdAt) {
      const age = Date.now() - new Date(entity.createdAt).getTime();
      const daysSinceCreation = age / (1000 * 60 * 60 * 24);

      // Fresher data is more timely
      if (daysSinceCreation < 7) return 1.0;
      if (daysSinceCreation < 30) return 0.8;
      if (daysSinceCreation < 90) return 0.6;
      return 0.4;
    }

    return 0.5; // Default if no timestamp
  }

  calculateValidationScore(errors, warnings) {
    if (errors.length === 0 && warnings.length === 0) return 1.0;

    const errorPenalty = errors.length * 0.2;
    const warningPenalty = warnings.length * 0.05;

    return Math.max(0, 1.0 - errorPenalty - warningPenalty);
  }

  calculateExpectedGrade(score) {
    if (score >= 8000) return 'A+';
    if (score >= 6000) return 'A';
    if (score >= 4000) return 'B+';
    if (score >= 2000) return 'B';
    if (score >= 1000) return 'C';
    return 'D';
  }
}

export default ValidationAgent;
