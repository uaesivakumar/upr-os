/**
 * SIVA Rule Engine - Phase 5.2 → v2.0 (Sprint 22)
 *
 * Interprets and executes cognitive rules from cognitive_extraction_logic.json
 * Supports: formulas, decision trees, lookups, rule lists, computed variables,
 *           conditional logic, additive scoring, reasoning templates
 * Returns explainable outputs for every execution
 *
 * Sprint 22 Extensions:
 * - Computed variables with custom logic functions
 * - Conditional expressions (if/elif/else)
 * - Additive scoring rules (not just multiplicative)
 * - Reasoning template generation
 * - Key factors extraction
 */

import { create, all } from 'mathjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe math evaluation using mathjs
const math = create(all);

export class RuleEngine {
  constructor(rulesPath = null) {
    // Load cognitive rules
    const defaultPath = path.join(__dirname, 'cognitive_extraction_logic.json');
    const rulesFile = rulesPath || defaultPath;

    if (!fs.existsSync(rulesFile)) {
      throw new Error(`Rules file not found: ${rulesFile}`);
    }

    this.rulesData = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    this.version = this.rulesData.version;
    this.rules = this.rulesData.rules;
  }

  /**
   * Main execution method - dispatches to appropriate handler based on rule type
   */
  async execute(ruleName, input) {
    const rule = this.rules[ruleName];

    if (!rule) {
      throw new Error(`Rule not found: ${ruleName}`);
    }

    const startTime = Date.now();

    try {
      let result;
      const variables = {};
      const breakdown = [];

      switch (rule.type) {
        case 'formula':
          result = await this.executeFormula(rule, input, variables, breakdown);
          break;
        case 'decision_tree':
          result = await this.executeDecisionTree(rule, input, breakdown);
          break;
        case 'rule_list':
          result = await this.executeRuleList(rule, input, breakdown);
          break;
        case 'additive_scoring':
          result = await this.executeAdditiveScoring(rule, input, variables, breakdown);
          break;
        default:
          throw new Error(`Unknown rule type: ${rule.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        result,
        variables,
        breakdown,
        formula: rule.formula || null,
        confidence: this.calculateConfidence(breakdown),
        version: this.version,
        ruleName,
        ruleType: rule.type,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        error: error.message,
        ruleName,
        input,
        version: this.version,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute formula-based rules
   */
  async executeFormula(rule, input, variables, breakdown) {
    // Evaluate all variables first
    for (const [varName, varDef] of Object.entries(rule.variables)) {
      const value = await this.evaluateVariable(varDef, input);
      variables[varName] = value;

      breakdown.push({
        step: varName,
        value,
        reason: varDef.description || `Evaluated ${varName}`
      });
    }

    // Check edge cases
    let edgeCaseMultiplier = 1.0;
    if (rule.edge_cases) {
      for (const edgeCase of rule.edge_cases) {
        if (this.checkCondition(edgeCase.condition, input)) {
          edgeCaseMultiplier *= edgeCase.action.multiply;
          breakdown.push({
            step: 'edge_case',
            value: edgeCase.action.multiply,
            reason: edgeCase.reason
          });
        }
      }
    }

    // Evaluate formula using mathjs for safety
    let result = this.safeEval(rule.formula, variables);
    result *= edgeCaseMultiplier;

    // Clamp to output range if specified
    if (rule.output_range) {
      result = Math.max(rule.output_range[0], Math.min(rule.output_range[1], result));
    }

    return Math.round(result * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Execute decision tree rules
   */
  async executeDecisionTree(rule, input, breakdown) {
    // Walk through branches until condition matches
    for (const branch of rule.branches) {
      if (this.checkCondition(branch.condition, input)) {
        breakdown.push({
          step: 'decision',
          value: branch.output,
          reason: branch.reasoning
        });
        return branch.output;
      }
    }

    // Return fallback if no condition matched
    breakdown.push({
      step: 'fallback',
      value: rule.fallback,
      reason: 'No conditions matched, using fallback'
    });
    return rule.fallback;
  }

  /**
   * Execute rule list (multiple rules that can all apply)
   */
  async executeRuleList(rule, input, breakdown) {
    const matchedRules = [];

    for (const ruleItem of rule.rules) {
      if (this.checkCondition(ruleItem.condition, input)) {
        matchedRules.push({
          name: ruleItem.name,
          adjustment: ruleItem.adjustment,
          severity: ruleItem.severity,
          reason: ruleItem.reason
        });

        breakdown.push({
          step: ruleItem.name,
          value: ruleItem.adjustment,
          reason: ruleItem.reason,
          severity: ruleItem.severity
        });
      }
    }

    return matchedRules;
  }

  /**
   * Execute additive scoring rules (Sprint 22 - v2.0)
   * Supports computed variables, conditional logic, and additive scoring
   */
  async executeAdditiveScoring(rule, input, variables, breakdown) {
    let score = rule.base_score || 0;
    const reasoning = [];
    const keyFactors = [];
    let confidence = rule.base_confidence || 1.0;

    // Phase 1: Evaluate computed variables first
    if (rule.computed_variables) {
      for (const [varName, varDef] of Object.entries(rule.computed_variables)) {
        const value = await this.evaluateComputedVariable(varDef, input, variables);
        variables[varName] = value;

        breakdown.push({
          step: `computed_${varName}`,
          value,
          reason: varDef.description || `Computed ${varName} = ${value}`
        });
      }
    }

    // Phase 2: Evaluate scoring factors (additive)
    if (rule.scoring_factors) {
      for (const factor of rule.scoring_factors) {
        const factorResult = await this.evaluateScoringFactor(factor, input, variables);

        if (factorResult.applies) {
          score += factorResult.points;
          confidence += factorResult.confidence_adjustment || 0;

          reasoning.push({
            factor: factor.name,
            points: factorResult.points,
            explanation: factorResult.explanation
          });

          if (factorResult.key_factor) {
            keyFactors.push(factorResult.key_factor);
          }

          breakdown.push({
            step: factor.name,
            value: factorResult.points,
            reason: factorResult.explanation
          });
        }
      }
    }

    // Phase 3: Apply edge case adjustments (multiplicative)
    let adjustmentFactor = 1.0;
    const edgeCasesApplied = [];

    if (rule.edge_case_adjustments) {
      for (const edgeCase of rule.edge_case_adjustments) {
        if (this.checkCondition(edgeCase.condition, input, variables)) {
          adjustmentFactor *= edgeCase.multiplier;
          confidence = edgeCase.confidence_override || confidence;

          edgeCasesApplied.push(edgeCase.name);
          reasoning.push({
            factor: `Edge Case: ${edgeCase.name}`,
            points: Math.round(score * (edgeCase.multiplier - 1)),
            explanation: edgeCase.explanation
          });

          breakdown.push({
            step: `edge_case_${edgeCase.name}`,
            value: edgeCase.multiplier,
            reason: edgeCase.explanation
          });
        }
      }
    }

    // Apply adjustment factor
    score = Math.round(score * adjustmentFactor);

    // Phase 4: Normalization
    if (rule.output_range) {
      score = Math.max(rule.output_range[0], Math.min(rule.output_range[1], score));
    }

    // Phase 5: Confidence adjustments based on data completeness
    if (rule.confidence_adjustments) {
      for (const adjustment of rule.confidence_adjustments) {
        if (this.checkCondition(adjustment.condition, input, variables)) {
          confidence += adjustment.value;
        }
      }
    }

    // Ensure confidence bounds
    confidence = Math.min(1.0, Math.max(0.0, confidence));

    // Phase 6: Generate reasoning text if template provided
    let reasoningText = null;
    if (rule.reasoning_template) {
      reasoningText = this.generateReasoningText(rule.reasoning_template, variables, input);
    }

    return {
      score,
      reasoning,
      confidence: parseFloat(confidence.toFixed(2)),
      key_factors: keyFactors,
      edge_cases_applied: edgeCasesApplied,
      reasoning_text: reasoningText
    };
  }

  /**
   * Evaluate a computed variable (Sprint 22 - v2.0)
   */
  async evaluateComputedVariable(varDef, input, variables) {
    if (varDef.type === 'conditional') {
      // Conditional logic: if/elif/else
      for (const branch of varDef.branches) {
        if (branch.type === 'if' || branch.type === 'elif') {
          if (this.checkCondition(branch.condition, input, variables)) {
            return branch.value;
          }
        } else if (branch.type === 'else') {
          return branch.value;
        }
      }
      return varDef.default || null;
    }

    if (varDef.type === 'multi_condition') {
      // Multiple conditions (AND/OR logic)
      return this.evaluateMultiCondition(varDef, input, variables);
    }

    // Fallback to standard variable evaluation
    return this.evaluateVariable(varDef, input);
  }

  /**
   * Evaluate multi-condition logic
   */
  evaluateMultiCondition(varDef, input, variables) {
    const { logic, conditions, values } = varDef;

    if (logic === 'AND') {
      // All conditions must be true
      const allTrue = conditions.every(cond =>
        this.checkCondition(cond, input, variables)
      );
      return allTrue ? values.true : values.false;
    }

    if (logic === 'OR') {
      // At least one condition must be true
      const anyTrue = conditions.some(cond =>
        this.checkCondition(cond, input, variables)
      );
      return anyTrue ? values.true : values.false;
    }

    if (logic === 'COUNT') {
      // Count how many conditions are true
      const trueCount = conditions.filter(cond =>
        this.checkCondition(cond, input, variables)
      ).length;

      // Match count to value mapping
      for (const [count, value] of Object.entries(values)) {
        if (trueCount >= parseInt(count)) {
          return value;
        }
      }
      return varDef.default;
    }

    return varDef.default;
  }

  /**
   * Evaluate a scoring factor
   */
  async evaluateScoringFactor(factor, input, variables) {
    // Check if factor applies
    if (factor.condition && !this.checkCondition(factor.condition, input, variables)) {
      return { applies: false };
    }

    // Calculate points
    let points = 0;
    if (typeof factor.points === 'number') {
      points = factor.points;
    } else if (typeof factor.points === 'string') {
      // Formula-based points
      points = this.safeEval(factor.points, { ...variables, ...input });
    }

    // Generate explanation
    let explanation = factor.explanation;
    if (factor.explanation_template) {
      explanation = this.generateReasoningText(factor.explanation_template, variables, input);
    }

    return {
      applies: true,
      points,
      explanation,
      confidence_adjustment: factor.confidence_adjustment || 0,
      key_factor: factor.key_factor || null
    };
  }

  /**
   * Generate reasoning text from template
   */
  generateReasoningText(template, variables, input) {
    let text = template;

    // Replace variable placeholders {var_name}
    text = text.replace(/\{(\w+)\}/g, (match, varName) => {
      return variables[varName] || input[varName] || match;
    });

    // Replace nested placeholders {obj.field}
    text = text.replace(/\{([\w.]+)\}/g, (match, path) => {
      const value = this.getInputValue(path, { ...input, ...variables });
      return value !== undefined ? value : match;
    });

    return text;
  }

  /**
   * Evaluate a variable based on its type
   */
  async evaluateVariable(varDef, input) {
    switch (varDef.type) {
      case 'mapping':
        return this.evaluateMapping(varDef, input);
      case 'lookup_table':
        return this.evaluateLookupTable(varDef, input);
      case 'constant':
        return varDef.value;
      case 'formula':
        return this.safeEval(varDef.expression, input);
      default:
        throw new Error(`Unknown variable type: ${varDef.type}`);
    }
  }

  /**
   * Evaluate mapping variable (key-value lookup)
   */
  evaluateMapping(varDef, input) {
    const inputValue = this.getInputValue(varDef.input, input);

    if (varDef.map && varDef.map[inputValue] !== undefined) {
      return varDef.map[inputValue];
    }

    return varDef.default || 1.0;
  }

  /**
   * Evaluate lookup table (range-based lookup)
   */
  evaluateLookupTable(varDef, input) {
    const inputValue = this.getInputValue(varDef.input, input);

    for (const entry of varDef.table) {
      const [min, max] = entry.range;
      if (inputValue >= min && inputValue < max) {
        return entry.value;
      }
    }

    return varDef.default || 1.0;
  }

  /**
   * Check if a condition matches the input
   * Updated in Sprint 22 to support both input and computed variables
   */
  checkCondition(condition, input, variables = {}) {
    for (const [field, check] of Object.entries(condition)) {
      // Try to get value from variables first, then input
      let inputValue = variables[field];
      if (inputValue === undefined) {
        inputValue = this.getInputValue(field, input);
      }

      // Skip condition if value is explicitly null or undefined (unless checking for null)
      if (inputValue === null || inputValue === undefined) {
        // Only fail if the check isn't for null/undefined
        if (typeof check === 'object' && check.eq === null) {
          // Explicitly checking for null - continue
        } else if (check === null) {
          // Direct null comparison - continue
        } else {
          // Value is missing and we're not checking for null - condition fails
          return false;
        }
      }

      // Handle object-based checks (operators)
      if (typeof check === 'object' && !Array.isArray(check)) {
        for (const [operator, expectedValue] of Object.entries(check)) {
          switch (operator) {
            case 'eq':
              if (inputValue !== expectedValue) return false;
              break;
            case 'lt':
              if (inputValue >= expectedValue) return false;
              break;
            case 'lte':
              if (inputValue > expectedValue) return false;
              break;
            case 'gt':
              if (inputValue <= expectedValue) return false;
              break;
            case 'gte':
              if (inputValue < expectedValue) return false;
              break;
            case 'between':
              if (inputValue < expectedValue[0] || inputValue >= expectedValue[1]) return false;
              break;
            case 'in':
              if (!expectedValue.includes(inputValue)) return false;
              break;
            case 'contains':
              // String contains (case-insensitive)
              if (typeof inputValue !== 'string' ||
                  !inputValue.toLowerCase().includes(expectedValue.toLowerCase())) {
                return false;
              }
              break;
            case 'matches_any':
              // Check if inputValue contains any of the expectedValue strings
              if (typeof inputValue !== 'string') return false;
              const matches = expectedValue.some(val =>
                inputValue.toLowerCase().includes(val.toLowerCase())
              );
              if (!matches) return false;
              break;
            default:
              throw new Error(`Unknown operator: ${operator}`);
          }
        }
      } else {
        // Direct value comparison
        if (inputValue !== check) return false;
      }
    }

    return true;
  }

  /**
   * Safe formula evaluation using mathjs (no eval())
   */
  safeEval(formula, variables) {
    try {
      return math.evaluate(formula, variables);
    } catch (error) {
      throw new Error(`Formula evaluation error: ${error.message}`);
    }
  }

  /**
   * Get input value by field name (supports nested paths)
   */
  getInputValue(field, input) {
    if (field.includes('.')) {
      const parts = field.split('.');
      let value = input;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    }
    return input[field];
  }

  /**
   * Calculate confidence score based on breakdown
   */
  calculateConfidence(breakdown) {
    if (breakdown.length === 0) return 0.5;

    // Higher confidence if more steps executed successfully
    const stepsCompleted = breakdown.length;
    const confidenceBase = Math.min(0.95, 0.5 + (stepsCompleted * 0.1));

    return Math.round(confidenceBase * 100) / 100;
  }

  /**
   * Generate human-readable explanation
   */
  explain(executionResult) {
    if (!executionResult || !executionResult.breakdown) {
      return 'No execution result to explain';
    }

    const lines = [
      `Rule: ${executionResult.ruleName} (${executionResult.ruleType})`,
      `Version: ${executionResult.version}`,
      `Result: ${JSON.stringify(executionResult.result)}`,
      `Confidence: ${(executionResult.confidence * 100).toFixed(0)}%`,
      '',
      'Reasoning:'
    ];

    executionResult.breakdown.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step.step}: ${step.value} - ${step.reason}`);
    });

    if (executionResult.formula) {
      lines.push('');
      lines.push(`Formula: ${executionResult.formula}`);
    }

    lines.push('');
    lines.push(`Execution time: ${executionResult.executionTimeMs}ms`);

    return lines.join('\n');
  }

  /**
   * Get all available rules
   */
  listRules() {
    return Object.keys(this.rules).map(ruleName => ({
      name: ruleName,
      type: this.rules[ruleName].type,
      description: this.rules[ruleName].description
    }));
  }

  /**
   * Get rule details
   */
  getRuleDetails(ruleName) {
    return this.rules[ruleName];
  }

  /**
   * Get engine version
   */
  getVersion() {
    return {
      version: this.version,
      totalRules: Object.keys(this.rules).length,
      ruleTypes: [...new Set(Object.values(this.rules).map(r => r.type))],
      createdAt: this.rulesData.created_at
    };
  }
}

// Singleton instance
let engineInstance = null;

export function getRuleEngine(rulesPath = null) {
  if (!engineInstance || rulesPath) {
    engineInstance = new RuleEngine(rulesPath);
  }
  return engineInstance;
}

// Export default instance
export default getRuleEngine();
