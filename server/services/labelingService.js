/**
 * Labeling Service
 *
 * Enterprise-grade labeling workflow for dataset curation including:
 * - Session management
 * - Queue-based example assignment
 * - Multi-user support
 * - Label validation
 * - Progress tracking
 * - Inter-rater reliability
 */

const pool = require('../config/database');
const crypto = require('crypto');

class LabelingService {
  /**
   * Start a new labeling session
   */
  static async startSession(labelerId, sessionType = 'initial_labeling') {
    console.log(`[LabelingService] Starting session for ${labelerId} (${sessionType})`);

    const result = await pool.query(
      `INSERT INTO training.labeling_sessions (labeler_id, session_type, started_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [labelerId, sessionType]
    );

    const session = result.rows[0];

    console.log(`[LabelingService] Session started: ${session.id}`);

    return {
      sessionId: session.id,
      labelerId: session.labeler_id,
      sessionType: session.session_type,
      startedAt: session.started_at
    };
  }

  /**
   * End labeling session
   */
  static async endSession(sessionId) {
    console.log(`[LabelingService] Ending session: ${sessionId}`);

    // Count examples labeled in this session
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM training.label_history WHERE session_id = $1',
      [sessionId]
    );

    const examplesLabeled = parseInt(countResult.rows[0].count);

    // Update session
    await pool.query(
      `UPDATE training.labeling_sessions
       SET ended_at = NOW(), examples_labeled = $1
       WHERE id = $2`,
      [examplesLabeled, sessionId]
    );

    console.log(`[LabelingService] Session ended: ${examplesLabeled} examples labeled`);

    return { sessionId, examplesLabeled };
  }

  /**
   * Get next example to label from queue
   */
  static async getNextExample(datasetId, filters = {}) {
    let query = `
      SELECT *
      FROM training.examples
      WHERE dataset_id = $1
        AND validation_status = 'pending'
    `;

    const params = [datasetId];
    let paramCount = 1;

    // Apply filters
    if (filters.exampleType) {
      paramCount++;
      query += ` AND example_type = $${paramCount}`;
      params.push(filters.exampleType);
    }

    if (filters.minQualityScore !== undefined) {
      paramCount++;
      query += ` AND quality_score >= $${paramCount}`;
      params.push(filters.minQualityScore);
    }

    // Prioritize by quality score (label high-quality first)
    query += ` ORDER BY quality_score DESC, created_at ASC LIMIT 1`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return null; // No more examples to label
    }

    const example = result.rows[0];

    // Get label history for this example
    const historyResult = await pool.query(
      'SELECT * FROM training.label_history WHERE example_id = $1 ORDER BY labeled_at DESC',
      [example.id]
    );

    return {
      ...example,
      labelHistory: historyResult.rows
    };
  }

  /**
   * Submit label for example
   */
  static async submitLabel(config) {
    const {
      exampleId,
      sessionId,
      labelerId,
      labelType,
      labelValue,
      confidence,
      notes
    } = config;

    console.log(`[LabelingService] Submitting label for example: ${exampleId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current example state
      const currentResult = await client.query(
        'SELECT expected_output, validation_status FROM training.examples WHERE id = $1',
        [exampleId]
      );

      const current = currentResult.rows[0];

      // Record label in history
      await client.query(
        `INSERT INTO training.label_history
         (example_id, session_id, labeler_id, label_type, label_value, previous_value, confidence, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          exampleId,
          sessionId,
          labelerId,
          labelType,
          JSON.stringify(labelValue),
          JSON.stringify(current.expected_output),
          confidence,
          notes
        ]
      );

      // Update example with new label
      await client.query(
        `UPDATE training.examples
         SET expected_output = $1,
             validation_status = $2,
             validated_by = $3,
             validated_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(labelValue), 'validated', labelerId, exampleId]
      );

      await client.query('COMMIT');

      console.log(`[LabelingService] Label submitted successfully`);

      return {
        exampleId,
        labelValue,
        validationStatus: 'validated'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[LabelingService] Submit label error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject example
   */
  static async rejectExample(exampleId, sessionId, labelerId, reason) {
    console.log(`[LabelingService] Rejecting example: ${exampleId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Record rejection in history
      await client.query(
        `INSERT INTO training.label_history
         (example_id, session_id, labeler_id, label_type, label_value, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          exampleId,
          sessionId,
          labelerId,
          'rejection',
          JSON.stringify({ rejected: true }),
          reason
        ]
      );

      // Update example status
      await client.query(
        `UPDATE training.examples
         SET validation_status = 'rejected',
             validated_by = $1,
             validated_at = NOW()
         WHERE id = $2`,
        [labelerId, exampleId]
      );

      await client.query('COMMIT');

      console.log(`[LabelingService] Example rejected`);

      return { exampleId, status: 'rejected', reason };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[LabelingService] Reject example error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get labeling progress for dataset
   */
  static async getProgress(datasetId) {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_examples,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = result.rows[0];
    const total = parseInt(stats.total_examples);

    return {
      totalExamples: total,
      validated: parseInt(stats.validated),
      pending: parseInt(stats.pending),
      rejected: parseInt(stats.rejected),
      completionRate: total > 0 ? ((parseInt(stats.validated) / total) * 100).toFixed(1) : 0
    };
  }

  /**
   * Get labeler statistics
   */
  static async getLabelerStats(labelerId, days = 30) {
    const sessionsResult = await pool.query(
      `SELECT
        COUNT(*) as total_sessions,
        SUM(examples_labeled) as total_labeled,
        AVG(examples_labeled) as avg_per_session,
        AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60) as avg_duration_minutes
      FROM training.labeling_sessions
      WHERE labeler_id = $1
        AND started_at > NOW() - INTERVAL '${days} days'
        AND ended_at IS NOT NULL`,
      [labelerId]
    );

    const labelHistory = await pool.query(
      `SELECT
        DATE(labeled_at) as date,
        COUNT(*) as labels_submitted
      FROM training.label_history
      WHERE labeler_id = $1
        AND labeled_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(labeled_at)
      ORDER BY date DESC`,
      [labelerId]
    );

    const stats = sessionsResult.rows[0];

    return {
      totalSessions: parseInt(stats.total_sessions || 0),
      totalLabeled: parseInt(stats.total_labeled || 0),
      avgPerSession: parseFloat(stats.avg_per_session || 0).toFixed(1),
      avgDurationMinutes: parseFloat(stats.avg_duration_minutes || 0).toFixed(1),
      dailyActivity: labelHistory.rows.map(row => ({
        date: row.date,
        labelsSubmitted: parseInt(row.labels_submitted)
      }))
    };
  }

  /**
   * Calculate inter-rater reliability for examples labeled by multiple people
   */
  static async calculateInterRaterReliability(datasetId) {
    // Find examples with multiple labels
    const result = await pool.query(
      `SELECT
        e.id as example_id,
        e.example_type,
        ARRAY_AGG(DISTINCT lh.labeler_id) as labelers,
        COUNT(DISTINCT lh.labeler_id) as labeler_count
      FROM training.examples e
      JOIN training.label_history lh ON e.id = lh.example_id
      WHERE e.dataset_id = $1
      GROUP BY e.id, e.example_type
      HAVING COUNT(DISTINCT lh.labeler_id) > 1`,
      [datasetId]
    );

    const multiLabeledExamples = result.rows;

    return {
      totalMultiLabeled: multiLabeledExamples.length,
      examples: multiLabeledExamples.map(row => ({
        exampleId: row.example_id,
        exampleType: row.example_type,
        labelerCount: parseInt(row.labeler_count),
        labelers: row.labelers
      }))
    };
  }
}

module.exports = LabelingService;
