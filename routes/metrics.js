// routes/metrics.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";

const router = express.Router();

/**
 * GET /api/metrics/enrichment
 * Gathers and calculates key performance indicators for the enrichment process
 * from the enrich_audit table.
 */
router.get("/enrichment", adminOnly, async (req, res) => {
    try {
        const query = `
            SELECT
                COUNT(*) AS total_calls,
                COUNT(*) FILTER (WHERE status = 'success') AS success_calls,
                COUNT(*) FILTER (WHERE status = 'failure') AS failed_calls,
                AVG(duration_ms) AS avg_latency_ms,
                AVG((output_data->>'confidence')::numeric) AS avg_confidence
            FROM
                enrich_audit
            WHERE
                created_at >= NOW() - INTERVAL '30 days';
        `;

        const { rows } = await pool.query(query);
        const stats = rows[0];

        const total_calls = parseInt(stats.total_calls, 10) || 0;
        const success_calls = parseInt(stats.success_calls, 10) || 0;
        
        const hit_rate = total_calls > 0 ? success_calls / total_calls : 0;

        const metrics = {
            total_calls: total_calls,
            success_calls: success_calls,
            failed_calls: parseInt(stats.failed_calls, 10) || 0,
            hit_rate: parseFloat(hit_rate.toFixed(4)),
            avg_latency_ms: stats.avg_latency_ms ? parseFloat(parseFloat(stats.avg_latency_ms).toFixed(2)) : 0,
            avg_confidence: stats.avg_confidence ? parseFloat(parseFloat(stats.avg_confidence).toFixed(4)) : 0,
            timespan_days: 30
        };

        return ok(res, metrics);

    } catch (err) {
        console.error("[Metrics] Error fetching enrichment metrics:", err);
        return bad(res, "Failed to fetch enrichment metrics.", 500);
    }
});

/**
 * GET /api/metrics/ml-models
 * Get ML model performance metrics over time
 */
router.get("/ml-models", async (req, res) => {
    try {
        const query = `
            SELECT
                model_name,
                version,
                metrics,
                training_samples,
                deployed_at,
                created_at
            FROM ml_models
            WHERE status = 'deployed'
            ORDER BY created_at DESC
            LIMIT 10
        `;

        const { rows } = await pool.query(query);

        const models = rows.map(row => ({
            model_name: row.model_name,
            version: row.version,
            accuracy: row.metrics?.accuracy || 0,
            auc_roc: row.metrics?.auc_roc || 0,
            precision: row.metrics?.precision || 0,
            recall: row.metrics?.recall || 0,
            training_samples: row.training_samples || 0,
            deployed_at: row.deployed_at,
            predictions_today: Math.floor(Math.random() * 1000) // TODO: Get from ml_predictions table
        }));

        return ok(res, { models });

    } catch (err) {
        console.error("[Metrics] Error fetching ML model metrics:", err);
        return bad(res, "Failed to fetch ML model metrics.", 500);
    }
});

export default router;