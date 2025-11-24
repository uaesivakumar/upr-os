/**
 * Dataset Validation Service
 *
 * Enterprise-grade validation for training datasets with comprehensive
 * quality checks, data integrity verification, and compliance validation.
 */

const pool = require('../config/database');

class DatasetValidationService {
  /**
   * Validate entire dataset
   */
  static async validateDataset(datasetId) {
    console.log(`[DatasetValidation] Validating dataset: ${datasetId}`);

    const validation = {
      datasetId,
      validatedAt: new Date(),
      overallStatus: 'pending',
      checks: {},
      errors: [],
      warnings: [],
      recommendations: []
    };

    try {
      // Run all validation checks
      validation.checks.schema = await this._validateSchema(datasetId);
      validation.checks.dataQuality = await this._validateDataQuality(datasetId);
      validation.checks.distribution = await this._validateDistribution(datasetId);
      validation.checks.completeness = await this._validateCompleteness(datasetId);
      validation.checks.consistency = await this._validateConsistency(datasetId);
      validation.checks.integrity = await this._validateIntegrity(datasetId);

      // Determine overall status
      validation.overallStatus = this._determineOverallStatus(validation.checks);

      // Generate recommendations
      validation.recommendations = this._generateRecommendations(validation.checks);

      console.log(`[DatasetValidation] Validation complete: ${validation.overallStatus}`);

      return validation;

    } catch (error) {
      console.error('[DatasetValidation] Validation error:', error);
      validation.overallStatus = 'error';
      validation.errors.push(error.message);
      return validation;
    }
  }

  /**
   * Validate dataset schema compliance
   */
  static async _validateSchema(datasetId) {
    const check = {
      name: 'Schema Validation',
      status: 'pass',
      issues: []
    };

    const examples = await pool.query(
      'SELECT * FROM training.examples WHERE dataset_id = $1 LIMIT 100',
      [datasetId]
    );

    for (const example of examples.rows) {
      // Validate JSON structure
      if (typeof example.input_data !== 'object') {
        check.issues.push({
          exampleId: example.id,
          severity: 'error',
          message: 'input_data is not a valid JSON object'
        });
      }

      if (typeof example.expected_output !== 'object') {
        check.issues.push({
          exampleId: example.id,
          severity: 'error',
          message: 'expected_output is not a valid JSON object'
        });
      }

      // Validate required fields exist
      if (!example.example_type) {
        check.issues.push({
          exampleId: example.id,
          severity: 'error',
          message: 'Missing example_type'
        });
      }
    }

    if (check.issues.length > 0) {
      check.status = check.issues.some(i => i.severity === 'error') ? 'fail' : 'warning';
    }

    check.summary = `Checked ${examples.rows.length} examples, found ${check.issues.length} issues`;

    return check;
  }

  /**
   * Validate data quality metrics
   */
  static async _validateDataQuality(datasetId) {
    const check = {
      name: 'Data Quality',
      status: 'pass',
      metrics: {},
      issues: []
    };

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_examples,
        AVG(quality_score) as avg_quality,
        MIN(quality_score) as min_quality,
        MAX(quality_score) as max_quality,
        COUNT(*) FILTER (WHERE quality_score >= 90) as gold_count,
        COUNT(*) FILTER (WHERE quality_score >= 75 AND quality_score < 90) as silver_count,
        COUNT(*) FILTER (WHERE quality_score >= 60 AND quality_score < 75) as bronze_count,
        COUNT(*) FILTER (WHERE quality_score < 60) as rejected_count,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated_count,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending_count
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = result.rows[0];

    check.metrics = {
      totalExamples: parseInt(stats.total_examples),
      avgQuality: parseFloat(stats.avg_quality || 0).toFixed(2),
      minQuality: parseFloat(stats.min_quality || 0),
      maxQuality: parseFloat(stats.max_quality || 0),
      goldCount: parseInt(stats.gold_count),
      silverCount: parseInt(stats.silver_count),
      bronzeCount: parseInt(stats.bronze_count),
      rejectedCount: parseInt(stats.rejected_count),
      validatedCount: parseInt(stats.validated_count),
      pendingCount: parseInt(stats.pending_count)
    };

    // Quality thresholds
    if (check.metrics.avgQuality < 70) {
      check.issues.push({
        severity: 'error',
        message: `Average quality score (${check.metrics.avgQuality}) below acceptable threshold (70)`
      });
      check.status = 'fail';
    } else if (check.metrics.avgQuality < 80) {
      check.issues.push({
        severity: 'warning',
        message: `Average quality score (${check.metrics.avgQuality}) below recommended threshold (80)`
      });
      check.status = 'warning';
    }

    // Validation coverage
    const validationRate = (check.metrics.validatedCount / check.metrics.totalExamples) * 100;
    if (validationRate < 50) {
      check.issues.push({
        severity: 'warning',
        message: `Only ${validationRate.toFixed(1)}% of examples validated`
      });
      if (check.status === 'pass') check.status = 'warning';
    }

    check.summary = `${check.metrics.totalExamples} examples, avg quality ${check.metrics.avgQuality}`;

    return check;
  }

  /**
   * Validate data distribution across example types
   */
  static async _validateDistribution(datasetId) {
    const check = {
      name: 'Distribution Analysis',
      status: 'pass',
      distribution: {},
      issues: []
    };

    const result = await pool.query(
      `SELECT
        example_type,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality
      FROM training.examples
      WHERE dataset_id = $1
      GROUP BY example_type
      ORDER BY count DESC`,
      [datasetId]
    );

    check.distribution = result.rows.reduce((acc, row) => {
      acc[row.example_type] = {
        count: parseInt(row.count),
        avgQuality: parseFloat(row.avg_quality || 0).toFixed(2)
      };
      return acc;
    }, {});

    // Check for severe imbalance
    const counts = Object.values(check.distribution).map(d => d.count);
    if (counts.length > 1) {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const imbalanceRatio = max / min;

      if (imbalanceRatio > 10) {
        check.issues.push({
          severity: 'warning',
          message: `Severe class imbalance detected (ratio: ${imbalanceRatio.toFixed(1)}:1)`
        });
        check.status = 'warning';
      }
    }

    check.summary = `${Object.keys(check.distribution).length} example types`;

    return check;
  }

  /**
   * Validate dataset completeness
   */
  static async _validateCompleteness(datasetId) {
    const check = {
      name: 'Completeness Check',
      status: 'pass',
      coverage: {},
      issues: []
    };

    // Check for missing required fields
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE input_data IS NULL OR input_data = '{}') as missing_input,
        COUNT(*) FILTER (WHERE expected_output IS NULL OR expected_output = '{}') as missing_output,
        COUNT(*) FILTER (WHERE example_type IS NULL OR example_type = '') as missing_type,
        COUNT(*) FILTER (WHERE quality_score IS NULL) as missing_quality,
        COUNT(*) as total
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = result.rows[0];
    const total = parseInt(stats.total);

    check.coverage = {
      inputData: ((total - parseInt(stats.missing_input)) / total * 100).toFixed(1),
      expectedOutput: ((total - parseInt(stats.missing_output)) / total * 100).toFixed(1),
      exampleType: ((total - parseInt(stats.missing_type)) / total * 100).toFixed(1),
      qualityScore: ((total - parseInt(stats.missing_quality)) / total * 100).toFixed(1)
    };

    // Flag missing critical fields
    Object.entries(check.coverage).forEach(([field, coverage]) => {
      if (parseFloat(coverage) < 100) {
        check.issues.push({
          severity: 'error',
          message: `${field} missing in ${(100 - parseFloat(coverage)).toFixed(1)}% of examples`
        });
        check.status = 'fail';
      }
    });

    check.summary = `Completeness: ${Math.min(...Object.values(check.coverage).map(parseFloat)).toFixed(1)}%`;

    return check;
  }

  /**
   * Validate internal consistency
   */
  static async _validateConsistency(datasetId) {
    const check = {
      name: 'Consistency Check',
      status: 'pass',
      issues: []
    };

    // Check for logical inconsistencies
    const examples = await pool.query(
      `SELECT id, example_type, input_data, expected_output, quality_score, labels
       FROM training.examples
       WHERE dataset_id = $1`,
      [datasetId]
    );

    for (const example of examples.rows) {
      // Check quality score vs validation status
      if (example.quality_score < 60 && example.validation_status === 'validated') {
        check.issues.push({
          exampleId: example.id,
          severity: 'warning',
          message: 'Low quality example marked as validated'
        });
      }

      // Type-specific consistency checks
      if (example.example_type === 'contact_tier') {
        const tier = example.expected_output?.tier;
        const confidence = example.expected_output?.confidence;

        if (tier && !['A', 'B', 'C', 'D'].includes(tier)) {
          check.issues.push({
            exampleId: example.id,
            severity: 'error',
            message: `Invalid tier value: ${tier}`
          });
          check.status = 'fail';
        }

        if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
          check.issues.push({
            exampleId: example.id,
            severity: 'error',
            message: `Confidence out of range: ${confidence}`
          });
          check.status = 'fail';
        }
      }
    }

    if (check.issues.length > 0 && check.status === 'pass') {
      check.status = 'warning';
    }

    check.summary = `Checked ${examples.rows.length} examples, found ${check.issues.length} inconsistencies`;

    return check;
  }

  /**
   * Validate data integrity (duplicates, orphans)
   */
  static async _validateIntegrity(datasetId) {
    const check = {
      name: 'Data Integrity',
      status: 'pass',
      issues: []
    };

    // Check for duplicate source decisions
    const duplicates = await pool.query(
      `SELECT source_decision_id, COUNT(*) as count
       FROM training.examples
       WHERE dataset_id = $1 AND source_decision_id IS NOT NULL
       GROUP BY source_decision_id
       HAVING COUNT(*) > 1`,
      [datasetId]
    );

    if (duplicates.rows.length > 0) {
      check.issues.push({
        severity: 'warning',
        message: `Found ${duplicates.rows.length} duplicate source decision IDs`
      });
      check.status = 'warning';
    }

    // Check for orphaned source decisions
    const orphaned = await pool.query(
      `SELECT e.id, e.source_decision_id
       FROM training.examples e
       LEFT JOIN agent_core.agent_decisions ad ON e.source_decision_id = ad.decision_id
       WHERE e.dataset_id = $1
         AND e.source_decision_id IS NOT NULL
         AND ad.decision_id IS NULL
       LIMIT 10`,
      [datasetId]
    );

    if (orphaned.rows.length > 0) {
      check.issues.push({
        severity: 'warning',
        message: `Found ${orphaned.rows.length}+ orphaned source decisions (source deleted)`
      });
      check.status = 'warning';
    }

    check.summary = `Integrity checks completed`;

    return check;
  }

  /**
   * Determine overall validation status
   */
  static _determineOverallStatus(checks) {
    const statuses = Object.values(checks).map(c => c.status);

    if (statuses.includes('fail')) return 'fail';
    if (statuses.includes('warning')) return 'warning';
    return 'pass';
  }

  /**
   * Generate recommendations based on validation results
   */
  static _generateRecommendations(checks) {
    const recommendations = [];

    // Quality recommendations
    if (checks.dataQuality?.metrics?.avgQuality < 80) {
      recommendations.push({
        priority: 'high',
        category: 'quality',
        message: 'Consider adding more high-quality examples to improve average quality score',
        action: 'Extract additional examples with higher confidence scores'
      });
    }

    // Distribution recommendations
    if (checks.distribution?.issues?.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'distribution',
        message: 'Address class imbalance to improve model training',
        action: 'Extract more examples from underrepresented types'
      });
    }

    // Validation recommendations
    if (checks.dataQuality?.metrics?.pendingCount > checks.dataQuality?.metrics?.validatedCount) {
      recommendations.push({
        priority: 'high',
        category: 'validation',
        message: 'Many examples pending validation',
        action: 'Run validation workflow to mark examples as validated'
      });
    }

    return recommendations;
  }
}

module.exports = DatasetValidationService;
