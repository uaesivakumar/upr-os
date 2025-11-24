/**
 * Safety Guardrails Service
 * Sprint 32 - Task 7
 *
 * Implements:
 * - Content moderation
 * - Brand compliance checking
 * - Spam filter avoidance
 */

class SafetyGuardrails {
  constructor() {
    // Brand compliance rules (Emirates NBD standards)
    this.brandRules = {
      never_use: [
        'limited time offer',
        'act now',
        'urgent',
        'don\'t miss out',
        'exclusive deal',
        'guaranteed',
        'risk-free',
        'no obligation',
        'free money',
        'click here',
        'buy now',
        'special promotion'
      ],
      required_elements: [
        // Professional sign-off must be present
        'Best regards',
        'Emirates NBD'
      ],
      tone_guidelines: {
        max_exclamation_marks: 1,
        no_all_caps_words: true,
        professional_language_only: true
      }
    };

    // Spam indicators
    this.spamIndicators = {
      excessive_punctuation: /!{2,}|\?{2,}/,
      all_caps_words: /\b[A-Z]{4,}\b/g,
      suspicious_links: /(bit\.ly|tinyurl|goo\.gl)/i,
      excessive_emojis: /([\u{1F600}-\u{1F64F}]){3,}/u,
      money_symbols: /\$\$+|💰|💵|💴|💷|💶/,
      pressure_words: /(hurry|urgent|limited|exclusive|special|act now|don't wait)/gi
    };

    // Content moderation (inappropriate content)
    this.inappropriatePatterns = {
      profanity: /\b(damn|hell|crap|shit)\b/gi,
      discriminatory: /(based on|because of).*(religion|race|gender|age|nationality)/i,
      aggressive: /(must|have to|need to|should).*(immediately|now|today)/gi
    };

    // Compliance categories
    this.complianceCategories = [
      'brand_compliance',
      'spam_check',
      'content_moderation',
      'tone_check',
      'length_check'
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // BRAND COMPLIANCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Check brand compliance
   */
  checkBrandCompliance(content) {
    const violations = [];
    const warnings = [];

    // Check for prohibited phrases
    this.brandRules.never_use.forEach(phrase => {
      if (content.toLowerCase().includes(phrase.toLowerCase())) {
        violations.push({
          type: 'prohibited_phrase',
          phrase,
          severity: 'high',
          message: `Contains prohibited phrase: "${phrase}"`
        });
      }
    });

    // Check for required elements
    const hasSignOff = content.includes('Best regards') || content.includes('Kind regards');
    if (!hasSignOff) {
      violations.push({
        type: 'missing_signoff',
        severity: 'medium',
        message: 'Missing professional sign-off'
      });
    }

    if (!content.includes('Emirates NBD')) {
      violations.push({
        type: 'missing_brand',
        severity: 'medium',
        message: 'Missing Emirates NBD brand reference'
      });
    }

    // Check exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > this.brandRules.tone_guidelines.max_exclamation_marks) {
      warnings.push({
        type: 'excessive_exclamation',
        count: exclamationCount,
        severity: 'low',
        message: `Too many exclamation marks (${exclamationCount})`
      });
    }

    return {
      passed: violations.length === 0,
      violations,
      warnings,
      category: 'brand_compliance'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SPAM CHECKING
  // ═══════════════════════════════════════════════════════════

  /**
   * Check for spam indicators
   */
  checkSpam(content) {
    const flags = [];
    let spamScore = 0;

    // Excessive punctuation
    if (this.spamIndicators.excessive_punctuation.test(content)) {
      flags.push({
        type: 'excessive_punctuation',
        severity: 'medium',
        message: 'Contains excessive punctuation (!! or ??)'
      });
      spamScore += 20;
    }

    // All caps words
    const capsMatches = content.match(this.spamIndicators.all_caps_words);
    if (capsMatches && capsMatches.length > 0) {
      flags.push({
        type: 'all_caps',
        words: capsMatches,
        severity: 'medium',
        message: `Contains ${capsMatches.length} all-caps words`
      });
      spamScore += (capsMatches.length * 10);
    }

    // Suspicious links
    if (this.spamIndicators.suspicious_links.test(content)) {
      flags.push({
        type: 'suspicious_link',
        severity: 'high',
        message: 'Contains shortened URL (potential spam)'
      });
      spamScore += 50;
    }

    // Excessive emojis
    if (this.spamIndicators.excessive_emojis.test(content)) {
      flags.push({
        type: 'excessive_emojis',
        severity: 'low',
        message: 'Contains excessive emojis'
      });
      spamScore += 15;
    }

    // Pressure words
    const pressureMatches = content.match(this.spamIndicators.pressure_words);
    if (pressureMatches && pressureMatches.length > 2) {
      flags.push({
        type: 'pressure_language',
        words: pressureMatches,
        severity: 'high',
        message: `Contains ${pressureMatches.length} pressure words`
      });
      spamScore += (pressureMatches.length * 15);
    }

    return {
      passed: spamScore < 50,
      spam_score: spamScore,
      flags,
      category: 'spam_check',
      risk_level: spamScore > 70 ? 'HIGH' : spamScore > 40 ? 'MEDIUM' : 'LOW'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CONTENT MODERATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Check for inappropriate content
   */
  checkContent(content) {
    const flags = [];

    // Profanity check
    const profanityMatches = content.match(this.inappropriatePatterns.profanity);
    if (profanityMatches) {
      flags.push({
        type: 'profanity',
        matches: profanityMatches,
        severity: 'high',
        message: 'Contains inappropriate language'
      });
    }

    // Discriminatory language
    if (this.inappropriatePatterns.discriminatory.test(content)) {
      flags.push({
        type: 'discriminatory',
        severity: 'critical',
        message: 'Contains potentially discriminatory language'
      });
    }

    // Aggressive language
    const aggressiveMatches = content.match(this.inappropriatePatterns.aggressive);
    if (aggressiveMatches && aggressiveMatches.length > 2) {
      flags.push({
        type: 'aggressive_tone',
        matches: aggressiveMatches,
        severity: 'medium',
        message: 'Tone may be perceived as aggressive or demanding'
      });
    }

    return {
      passed: flags.filter(f => f.severity === 'critical' || f.severity === 'high').length === 0,
      flags,
      category: 'content_moderation'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TONE CHECKING
  // ═══════════════════════════════════════════════════════════

  /**
   * Check tone appropriateness
   */
  checkTone(content, expectedTone = 'professional') {
    const flags = [];

    // Word count for tone assessment
    const wordCount = content.split(/\s+/).length;

    // Too short (seems abrupt)
    if (wordCount < 50) {
      flags.push({
        type: 'too_brief',
        word_count: wordCount,
        severity: 'low',
        message: 'Message may be too brief for professional outreach'
      });
    }

    // Too long (may lose attention)
    if (wordCount > 300) {
      flags.push({
        type: 'too_verbose',
        word_count: wordCount,
        severity: 'low',
        message: 'Message may be too long'
      });
    }

    // Check for appropriate formality based on expected tone
    if (expectedTone === 'formal') {
      // Check for contractions (informal)
      const contractions = content.match(/\b(I'm|you're|we're|don't|can't|won't|it's)\b/gi);
      if (contractions && contractions.length > 0) {
        flags.push({
          type: 'informal_language',
          examples: contractions.slice(0, 3),
          severity: 'low',
          message: 'Contains contractions (consider formal tone)'
        });
      }
    }

    return {
      passed: true, // Tone is advisory, not blocking
      flags,
      word_count: wordCount,
      category: 'tone_check'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LENGTH CHECKING
  // ═══════════════════════════════════════════════════════════

  /**
   * Check message length constraints
   */
  checkLength(content, messageType = 'email') {
    const flags = [];

    const constraints = {
      email: { min: 100, max: 500, subject_max: 60 },
      linkedin: { min: 50, max: 300 },
      sms: { min: 20, max: 160 }
    };

    const limits = constraints[messageType] || constraints.email;
    const charCount = content.length;

    if (charCount < limits.min) {
      flags.push({
        type: 'too_short',
        char_count: charCount,
        min_required: limits.min,
        severity: 'medium',
        message: `Content too short (${charCount} chars, min ${limits.min})`
      });
    }

    if (charCount > limits.max) {
      flags.push({
        type: 'too_long',
        char_count: charCount,
        max_allowed: limits.max,
        severity: 'medium',
        message: `Content too long (${charCount} chars, max ${limits.max})`
      });
    }

    return {
      passed: flags.length === 0,
      flags,
      char_count: charCount,
      category: 'length_check'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // COMPREHENSIVE SAFETY CHECK
  // ═══════════════════════════════════════════════════════════

  /**
   * Run all safety checks
   */
  runSafetyChecks(content, options = {}) {
    const {
      expected_tone = 'professional',
      message_type = 'email',
      strict_mode = false
    } = options;

    const results = {
      brand_compliance: this.checkBrandCompliance(content),
      spam_check: this.checkSpam(content),
      content_moderation: this.checkContent(content),
      tone_check: this.checkTone(content, expected_tone),
      length_check: this.checkLength(content, message_type)
    };

    // Aggregate results
    const allViolations = [];
    const allWarnings = [];
    let overallPassed = true;

    for (const [category, result] of Object.entries(results)) {
      if (!result.passed) {
        overallPassed = false;
      }

      if (result.violations) {
        allViolations.push(...result.violations.map(v => ({ ...v, category })));
      }

      if (result.flags) {
        const criticalFlags = result.flags.filter(f =>
          f.severity === 'critical' || f.severity === 'high'
        );
        const warningFlags = result.flags.filter(f =>
          f.severity === 'medium' || f.severity === 'low'
        );

        allViolations.push(...criticalFlags.map(f => ({ ...f, category })));
        allWarnings.push(...warningFlags.map(f => ({ ...f, category })));
      }

      if (result.warnings) {
        allWarnings.push(...result.warnings.map(w => ({ ...w, category })));
      }
    }

    // In strict mode, warnings become violations
    if (strict_mode) {
      allViolations.push(...allWarnings);
      allWarnings.length = 0;
    }

    return {
      passed: strict_mode ? (allViolations.length === 0) : overallPassed,
      overall_safety_score: this.calculateSafetyScore(results),
      violations: allViolations,
      warnings: allWarnings,
      detailed_results: results,
      recommendations: this.generateRecommendations(allViolations, allWarnings)
    };
  }

  /**
   * Calculate overall safety score (0-100)
   */
  calculateSafetyScore(results) {
    let score = 100;

    // Deduct points for violations
    if (results.brand_compliance.violations) {
      score -= (results.brand_compliance.violations.length * 10);
    }

    if (results.spam_check.spam_score) {
      score -= (results.spam_check.spam_score * 0.5);
    }

    if (results.content_moderation.flags) {
      results.content_moderation.flags.forEach(flag => {
        if (flag.severity === 'critical') score -= 30;
        else if (flag.severity === 'high') score -= 15;
        else if (flag.severity === 'medium') score -= 5;
      });
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(violations, warnings) {
    const recommendations = [];

    violations.forEach(v => {
      if (v.type === 'prohibited_phrase') {
        recommendations.push(`Remove prohibited phrase: "${v.phrase}"`);
      } else if (v.type === 'missing_signoff') {
        recommendations.push('Add professional sign-off (e.g., "Best regards")');
      } else if (v.type === 'missing_brand') {
        recommendations.push('Include "Emirates NBD" in signature');
      } else if (v.type === 'pressure_language') {
        recommendations.push('Remove pressure words to avoid spam filters');
      }
    });

    warnings.forEach(w => {
      if (w.type === 'too_brief') {
        recommendations.push('Consider adding more context (currently too brief)');
      } else if (w.type === 'too_verbose') {
        recommendations.push('Consider shortening message for better engagement');
      }
    });

    return recommendations;
  }
}

module.exports = { SafetyGuardrails };
