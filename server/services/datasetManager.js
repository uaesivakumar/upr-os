/**
 * Dataset Manager
 *
 * Manages training datasets with Git-like versioning,
 * quality tracking, and lifecycle operations.
 */

const pool = require('../config/database');
const crypto = require('crypto');

class DatasetManager {
  /**
   * Create a new dataset
   */
  static async create(config) {
    const {
      name,
      version = '1.0.0',
      description = '',
      createdBy = 'system',
      parentVersionId = null,
      tags = []
    } = config;

    console.log(`[DatasetManager] Creating dataset: ${name} v${version}`);

    try {
      const result = await pool.query(
        `INSERT INTO training.datasets (
          name, version, description, created_by, parent_version_id, tags
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [name, version, description, createdBy, parentVersionId, tags]
      );

      const dataset = result.rows[0];
      console.log(`[DatasetManager] Created dataset with ID: ${dataset.id}`);

      return new Dataset(dataset);

    } catch (error) {
      console.error('[DatasetManager] Create error:', error);
      throw error;
    }
  }

  /**
   * Get dataset by ID
   */
  static async getById(datasetId) {
    const result = await pool.query(
      'SELECT * FROM training.datasets WHERE id = $1',
      [datasetId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    return new Dataset(result.rows[0]);
  }

  /**
   * Get dataset by name and version
   */
  static async getByNameVersion(name, version) {
    const result = await pool.query(
      'SELECT * FROM training.datasets WHERE name = $1 AND version = $2',
      [name, version]
    );

    if (result.rows.length === 0) {
      throw new Error(`Dataset not found: ${name} v${version}`);
    }

    return new Dataset(result.rows[0]);
  }

  /**
   * List all datasets
   */
  static async list(filters = {}) {
    let query = 'SELECT * FROM training.v_active_datasets WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (filters.name) {
      paramCount++;
      query += ` AND name ILIKE $${paramCount}`;
      params.push(`%${filters.name}%`);
    }

    if (filters.isActive !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(filters.isActive);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }
}

class Dataset {
  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.version = row.version;
    this.description = row.description;
    this.createdAt = row.created_at;
    this.createdBy = row.created_by;
    this.parentVersionId = row.parent_version_id;
    this.isActive = row.is_active;
    this.qualityScore = row.quality_score;
    this.exampleCount = row.example_count;
    this.tags = row.tags;
    this.metadata = row.metadata;
  }

  /**
   * Add examples to this dataset
   */
  async addExamples(examples) {
    console.log(`[Dataset ${this.id}] Adding ${examples.length} examples`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const addedIds = [];
      for (const example of examples) {
        const result = await client.query(
          `INSERT INTO training.examples (
            dataset_id, example_type, input_data, expected_output,
            source_decision_id, quality_score, labels, validation_status, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            this.id,
            example.example_type,
            JSON.stringify(example.input_data),
            JSON.stringify(example.expected_output),
            example.source_decision_id || null,
            example.quality_score || null,
            JSON.stringify(example.labels || {}),
            example.validation_status || 'pending',
            JSON.stringify(example.metadata || {})
          ]
        );
        addedIds.push(result.rows[0].id);
      }

      await client.query('COMMIT');
      console.log(`[Dataset ${this.id}] Added ${addedIds.length} examples`);

      return { addedCount: addedIds.length, exampleIds: addedIds };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[Dataset ${this.id}] Add examples error:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get examples from this dataset
   */
  async getExamples(filters = {}) {
    let query = 'SELECT * FROM training.examples WHERE dataset_id = $1';
    const params = [this.id];
    let paramCount = 1;

    if (filters.exampleType) {
      paramCount++;
      query += ` AND example_type = $${paramCount}`;
      params.push(filters.exampleType);
    }

    if (filters.validationStatus) {
      paramCount++;
      query += ` AND validation_status = $${paramCount}`;
      params.push(filters.validationStatus);
    }

    if (filters.minQualityScore !== undefined) {
      paramCount++;
      query += ` AND quality_score >= $${paramCount}`;
      params.push(filters.minQualityScore);
    }

    query += ' ORDER BY quality_score DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Validate dataset (check data quality)
   */
  async validate() {
    console.log(`[Dataset ${this.id}] Running validation...`);

    const examples = await this.getExamples();

    let validCount = 0;
    let totalQualityScore = 0;

    for (const example of examples) {
      if (example.quality_score >= 60) {
        validCount++;
      }
      totalQualityScore += example.quality_score || 0;
    }

    const avgQualityScore = examples.length > 0
      ? (totalQualityScore / examples.length).toFixed(2)
      : 0;

    // Update dataset quality score
    await pool.query(
      'UPDATE training.datasets SET quality_score = $1 WHERE id = $2',
      [avgQualityScore, this.id]
    );

    console.log(`[Dataset ${this.id}] Validation complete:`);
    console.log(`  Total examples: ${examples.length}`);
    console.log(`  Valid examples: ${validCount}`);
    console.log(`  Avg quality score: ${avgQualityScore}`);

    return {
      totalExamples: examples.length,
      validExamples: validCount,
      avgQualityScore: parseFloat(avgQualityScore),
      validationRate: examples.length > 0
        ? ((validCount / examples.length) * 100).toFixed(2)
        : 0
    };
  }

  /**
   * Commit dataset changes (Git-like)
   */
  async commit(commitInfo) {
    const {
      message,
      author,
      examplesAdded = 0,
      examplesRemoved = 0,
      examplesModified = 0
    } = commitInfo;

    console.log(`[Dataset ${this.id}] Creating commit: "${message}"`);

    // Get parent commit
    const parentResult = await pool.query(
      'SELECT commit_hash FROM training.dataset_commits WHERE dataset_id = $1 ORDER BY committed_at DESC LIMIT 1',
      [this.id]
    );
    const parentCommitHash = parentResult.rows.length > 0 ? parentResult.rows[0].commit_hash : null;

    // Generate commit hash
    const commitHash = this._generateCommitHash({
      parentCommitHash,
      message,
      author,
      timestamp: new Date().toISOString(),
      examplesAdded,
      examplesRemoved,
      examplesModified
    });

    // Save commit
    const result = await pool.query(
      `INSERT INTO training.dataset_commits (
        dataset_id, commit_hash, parent_commit_hash, message, author,
        examples_added, examples_removed, examples_modified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [this.id, commitHash, parentCommitHash, message, author,
       examplesAdded, examplesRemoved, examplesModified]
    );

    console.log(`[Dataset ${this.id}] Commit created: ${commitHash}`);

    return result.rows[0];
  }

  /**
   * Get commit history
   */
  async getCommitHistory(limit = 50) {
    const result = await pool.query(
      `SELECT * FROM training.dataset_commits
       WHERE dataset_id = $1
       ORDER BY committed_at DESC
       LIMIT $2`,
      [this.id, limit]
    );

    return result.rows;
  }

  /**
   * Get statistics
   */
  async getStats() {
    const examples = await this.getExamples();

    // Group by type
    const byType = {};
    const byValidationStatus = {};
    const qualityTiers = { Gold: 0, Silver: 0, Bronze: 0, Rejected: 0 };

    for (const ex of examples) {
      // Count by type
      byType[ex.example_type] = (byType[ex.example_type] || 0) + 1;

      // Count by validation status
      byValidationStatus[ex.validation_status] = (byValidationStatus[ex.validation_status] || 0) + 1;

      // Count by quality tier
      if (ex.quality_score >= 90) qualityTiers.Gold++;
      else if (ex.quality_score >= 75) qualityTiers.Silver++;
      else if (ex.quality_score >= 60) qualityTiers.Bronze++;
      else qualityTiers.Rejected++;
    }

    return {
      totalExamples: examples.length,
      byType,
      byValidationStatus,
      qualityTiers,
      avgQualityScore: this.qualityScore
    };
  }

  /**
   * Export dataset to format
   */
  async export(config) {
    const { format = 'jsonl', outputPath, split = null } = config;

    console.log(`[Dataset ${this.id}] Exporting to ${format} format`);

    const examples = await this.getExamples({ validationStatus: 'validated' });

    // Split if requested
    let exportData = { all: examples };

    if (split) {
      const shuffled = this._shuffleArray([...examples]);
      const trainCount = Math.floor(shuffled.length * (split.train || 0.8));
      const valCount = Math.floor(shuffled.length * (split.val || 0.1));

      exportData = {
        train: shuffled.slice(0, trainCount),
        val: shuffled.slice(trainCount, trainCount + valCount),
        test: shuffled.slice(trainCount + valCount)
      };
    }

    console.log(`[Dataset ${this.id}] Export complete: ${examples.length} examples`);

    return {
      format,
      data: exportData,
      metadata: {
        dataset_id: this.id,
        dataset_name: this.name,
        dataset_version: this.version,
        exported_at: new Date().toISOString(),
        example_count: examples.length
      }
    };
  }

  /**
   * Generate commit hash (SHA-256)
   */
  _generateCommitHash(data) {
    const content = JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

module.exports = { DatasetManager, Dataset };
