#!/usr/bin/env node
/**
 * Extract High-Quality Production Examples
 *
 * Enterprise-grade script to extract, validate, and curate training examples
 * from production agent decisions and feedback.
 *
 * Features:
 * - Multiple data sources (decisions, feedback, manual corrections)
 * - Comprehensive quality scoring
 * - Automatic deduplication
 * - Validation and error handling
 * - Progress tracking and reporting
 */

const pool = require('../../server/config/database');
const TrainingDataPipeline = require('../../server/services/trainingDataPipeline');
const { DatasetManager } = require('../../server/services/datasetManager');

class ProductionExampleExtractor {
  constructor(config = {}) {
    this.config = {
      datasetName: 'golden-v1',
      datasetVersion: '1.0.0',
      qualityThreshold: 75,
      batchSize: 100,
      sources: ['agent_decisions', 'decision_feedback'],
      ...config
    };

    this.stats = {
      extracted: 0,
      validated: 0,
      saved: 0,
      rejected: 0,
      duplicates: 0,
      byType: {},
      byQualityTier: { Gold: 0, Silver: 0, Bronze: 0, Rejected: 0 }
    };
  }

  /**
   * Run full extraction pipeline
   */
  async extract() {
    console.log('\n' + '='.repeat(80));
    console.log('PRODUCTION EXAMPLE EXTRACTION');
    console.log('='.repeat(80));
    console.log(`\nConfiguration:`);
    console.log(`  Dataset: ${this.config.datasetName} v${this.config.datasetVersion}`);
    console.log(`  Quality Threshold: ${this.config.qualityThreshold}`);
    console.log(`  Sources: ${this.config.sources.join(', ')}`);
    console.log(`  Batch Size: ${this.config.batchSize}\n`);

    try {
      // Get or create dataset
      const dataset = await this._getOrCreateDataset();

      // Extract from each source
      const allExamples = [];

      for (const source of this.config.sources) {
        console.log(`\n📊 Extracting from: ${source}`);
        console.log('-'.repeat(80));

        const examples = await this._extractFromSource(source);
        console.log(`✓ Extracted ${examples.length} examples from ${source}`);

        allExamples.push(...examples);
        this.stats.extracted += examples.length;
      }

      // Deduplicate
      console.log(`\n🔍 Deduplicating examples...`);
      const deduplicated = this._deduplicateExamples(allExamples);
      console.log(`✓ Removed ${allExamples.length - deduplicated.length} duplicates`);
      this.stats.duplicates = allExamples.length - deduplicated.length;

      // Validate and filter by quality
      console.log(`\n✅ Validating and filtering by quality...`);
      const validated = this._validateExamples(deduplicated);
      console.log(`✓ ${validated.length} examples passed quality threshold`);
      this.stats.validated = validated.length;
      this.stats.rejected = deduplicated.length - validated.length;

      // Calculate quality tier distribution
      this._calculateQualityDistribution(validated);

      // Save to dataset in batches
      console.log(`\n💾 Saving to dataset in batches...`);
      await this._saveInBatches(dataset, validated);

      // Create commit
      console.log(`\n📝 Creating dataset commit...`);
      const commit = await dataset.commit({
        message: `Extracted ${this.stats.saved} production examples`,
        author: 'production-extractor',
        examplesAdded: this.stats.saved
      });
      console.log(`✓ Commit created: ${commit.commit_hash.substring(0, 8)}...`);

      // Print summary
      this._printSummary(dataset);

      return {
        dataset,
        commit,
        stats: this.stats
      };

    } catch (error) {
      console.error('\n❌ Extraction failed:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    } finally {
      await pool.end();
    }
  }

  /**
   * Get existing dataset or create new one
   */
  async _getOrCreateDataset() {
    try {
      const dataset = await DatasetManager.getByNameVersion(
        this.config.datasetName,
        this.config.datasetVersion
      );
      console.log(`✓ Using existing dataset: ${dataset.id}`);
      return dataset;
    } catch (error) {
      console.log(`Creating new dataset: ${this.config.datasetName} v${this.config.datasetVersion}`);
      const dataset = await DatasetManager.create({
        name: this.config.datasetName,
        version: this.config.datasetVersion,
        description: 'Golden dataset for production training',
        createdBy: 'production-extractor',
        tags: ['production', 'golden', 'v1']
      });
      console.log(`✓ Dataset created: ${dataset.id}`);
      return dataset;
    }
  }

  /**
   * Extract from specific source
   */
  async _extractFromSource(source) {
    const pipeline = new TrainingDataPipeline({
      sourceType: source,
      filters: this._getFiltersForSource(source),
      qualityThreshold: 0, // We'll filter later
      exampleType: null
    });

    return await pipeline.extract();
  }

  /**
   * Get filters based on source type
   */
  _getFiltersForSource(source) {
    const filters = {
      limit: this.config.batchSize
    };

    switch (source) {
      case 'agent_decisions':
        // Get high-confidence decisions with positive outcomes
        filters.confidence = { min: 0.7 };
        filters.outcomePositive = true;
        break;

      case 'decision_feedback':
        // Get feedback with positive outcomes
        filters.outcomePositive = true;
        break;

      default:
        break;
    }

    return filters;
  }

  /**
   * Deduplicate examples based on source decision ID and input similarity
   */
  _deduplicateExamples(examples) {
    const seen = new Set();
    const deduplicated = [];

    for (const example of examples) {
      // Create unique key based on source and input hash
      const key = this._generateExampleKey(example);

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(example);
      }
    }

    return deduplicated;
  }

  /**
   * Generate unique key for example
   */
  _generateExampleKey(example) {
    if (example.source_decision_id) {
      return `decision_${example.source_decision_id}`;
    }

    // Hash input data for uniqueness
    const inputHash = JSON.stringify(example.input_data);
    return `input_${this._simpleHash(inputHash)}`;
  }

  /**
   * Simple hash function for deduplication
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Validate examples and filter by quality threshold
   */
  _validateExamples(examples) {
    const validated = [];

    for (const example of examples) {
      // Check required fields
      if (!this._hasRequiredFields(example)) {
        continue;
      }

      // Check quality score
      if (!example.quality_score || example.quality_score < this.config.qualityThreshold) {
        continue;
      }

      // Additional business logic validation
      if (!this._validateBusinessLogic(example)) {
        continue;
      }

      validated.push(example);
    }

    return validated;
  }

  /**
   * Check if example has all required fields
   */
  _hasRequiredFields(example) {
    if (!example.example_type) return false;
    if (!example.input_data || Object.keys(example.input_data).length === 0) return false;
    if (!example.expected_output || Object.keys(example.expected_output).length === 0) return false;
    return true;
  }

  /**
   * Validate business logic rules
   */
  _validateBusinessLogic(example) {
    // Type-specific validation
    switch (example.example_type) {
      case 'contact_tier':
        return this._validateContactTierExample(example);

      case 'lead_score':
        return this._validateLeadScoreExample(example);

      case 'company_quality':
        return this._validateCompanyQualityExample(example);

      default:
        return true; // Unknown types pass through
    }
  }

  /**
   * Validate contact tier example
   */
  _validateContactTierExample(example) {
    const output = example.expected_output;

    // Check tier is valid
    const validTiers = ['A', 'B', 'C', 'D'];
    if (output.tier && !validTiers.includes(output.tier)) {
      return false;
    }

    // Check confidence is in valid range
    if (output.confidence && (output.confidence < 0 || output.confidence > 1)) {
      return false;
    }

    return true;
  }

  /**
   * Validate lead score example
   */
  _validateLeadScoreExample(example) {
    const output = example.expected_output;

    // Check score is in valid range
    if (output.lead_score !== undefined) {
      if (output.lead_score < 0 || output.lead_score > 100) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate company quality example
   */
  _validateCompanyQualityExample(example) {
    const output = example.expected_output;

    // Check quality rating
    const validRatings = ['A', 'B', 'C', 'D', 'F'];
    if (output.quality_rating && !validRatings.includes(output.quality_rating)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate quality tier distribution
   */
  _calculateQualityDistribution(examples) {
    for (const example of examples) {
      const score = example.quality_score;

      // Track by type
      this.stats.byType[example.example_type] = (this.stats.byType[example.example_type] || 0) + 1;

      // Track by tier
      if (score >= 90) this.stats.byQualityTier.Gold++;
      else if (score >= 75) this.stats.byQualityTier.Silver++;
      else if (score >= 60) this.stats.byQualityTier.Bronze++;
      else this.stats.byQualityTier.Rejected++;
    }
  }

  /**
   * Save examples to dataset in batches
   */
  async _saveInBatches(dataset, examples) {
    const batchSize = this.config.batchSize;
    let saved = 0;

    for (let i = 0; i < examples.length; i += batchSize) {
      const batch = examples.slice(i, i + batchSize);

      try {
        const result = await dataset.addExamples(batch);
        saved += result.addedCount;
        console.log(`  ✓ Saved batch ${Math.floor(i / batchSize) + 1}: ${result.addedCount} examples`);
      } catch (error) {
        console.error(`  ❌ Failed to save batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      }
    }

    this.stats.saved = saved;
  }

  /**
   * Print extraction summary
   */
  _printSummary(dataset) {
    console.log('\n' + '='.repeat(80));
    console.log('EXTRACTION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nDataset: ${dataset.name} v${dataset.version} (${dataset.id})`);
    console.log(`\nExtraction Results:`);
    console.log(`  Total Extracted:    ${this.stats.extracted}`);
    console.log(`  Duplicates Removed: ${this.stats.duplicates}`);
    console.log(`  Quality Validated:  ${this.stats.validated}`);
    console.log(`  Quality Rejected:   ${this.stats.rejected}`);
    console.log(`  Successfully Saved: ${this.stats.saved}`);

    console.log(`\nQuality Distribution:`);
    console.log(`  🥇 Gold (90-100):   ${this.stats.byQualityTier.Gold}`);
    console.log(`  🥈 Silver (75-89):  ${this.stats.byQualityTier.Silver}`);
    console.log(`  🥉 Bronze (60-74):  ${this.stats.byQualityTier.Bronze}`);

    console.log(`\nBy Example Type:`);
    Object.entries(this.stats.byType).forEach(([type, count]) => {
      console.log(`  ${type.padEnd(20)}: ${count}`);
    });

    console.log('\n✅ Extraction completed successfully\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const config = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'dataset':
        config.datasetName = value;
        break;
      case 'version':
        config.datasetVersion = value;
        break;
      case 'threshold':
        config.qualityThreshold = parseInt(value);
        break;
      case 'batch':
        config.batchSize = parseInt(value);
        break;
    }
  }

  const extractor = new ProductionExampleExtractor(config);
  await extractor.extract();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ProductionExampleExtractor;
