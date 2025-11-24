// routes/enrich/bulk.js
import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';
import { ok, bad } from '../../utils/respond.js';
import { enrichmentQueue } from '../../workers/queue.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv') cb(null, true);
        else cb(new Error('Only .csv files are allowed.'), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/bulk', upload.single('leadsFile'), async (req, res) => {
    // SAFETY SWITCH: Check if the queue is operational.
    if (!enrichmentQueue) {
        return bad(res, "Bulk processing is temporarily unavailable. Redis is not configured.", 503);
    }

    if (!req.file) {
        return bad(res, "No file uploaded. Please upload a CSV file.", 400);
    }

    try {
        const records = parse(req.file.buffer, {
            columns: header => header.map(h => h.trim().toLowerCase()),
            skip_empty_lines: true,
        });

        if (records.length === 0) return bad(res, "CSV file is empty or invalid.", 400);

        const jobId = randomUUID();
        let leadsQueued = 0;
        const jobs = [];

        for (const record of records) {
            const name = record.name;
            const email = record.email;
            if (name && email) {
                jobs.push({ name: 'enrich-lead', data: { name, email }, opts: { jobId: `${jobId}-${leadsQueued}` } });
                leadsQueued++;
            }
        }
        
        await enrichmentQueue.addBulk(jobs);
        console.log(`[Bulk Enrich] Queued ${leadsQueued} leads for enrichment under job ID: ${jobId}`);
        
        return ok(res, {
            jobId,
            leadCount: leadsQueued,
            message: `${leadsQueued} leads have been queued for enrichment.`
        });

    } catch (err) {
        console.error("[Bulk Enrich] Error processing CSV:", err);
        return bad(res, err.message || "Failed to process CSV file.", 500);
    }
});

export default router;