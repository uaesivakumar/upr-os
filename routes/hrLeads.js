// routes/hrLeads.js
const express = require("express");
const { pool } = require("../utils/db");
const { ok, bad } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");
const { calculatePreviewScore } = require("./enrich/lib/person");
const { LEAD_STATUSES } = require("../utils/validators");

const router = express.Router();

// --- Helper to build dynamic WHERE clauses ---
function buildWhereClause(filters) {
    const where = [];
    const params = [];
    let paramIndex = 1;

    if (filters.search) {
        where.push(`(hl.name ILIKE $${paramIndex} OR hl.email ILIKE $${paramIndex} OR hl.designation ILIKE $${paramIndex})`);
        params.push(`%${filters.search}%`);
        paramIndex++;
    }
    if (filters.companyName) {
        where.push(`tc.name = $${paramIndex}`);
        params.push(filters.companyName);
        paramIndex++;
    }
    if (filters.designation) {
        where.push(`hl.designation = $${paramIndex}`);
        params.push(filters.designation);
        paramIndex++;
    }
    if (filters.status) {
        where.push(`hl.lead_status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
    }
    if (filters.email_status) {
        where.push(`hl.email_status = $${paramIndex}`);
        params.push(filters.email_status);
        paramIndex++;
    }
    if (filters.location) {
        where.push(`hl.location ILIKE $${paramIndex}`);
        params.push(`%${filters.location}%`);
        paramIndex++;
    }
    if (filters.minScore) {
        where.push(`hl.confidence >= $${paramIndex}`);
        params.push(filters.minScore);
        paramIndex++;
    }

    return {
        clause: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
        params
    };
}


/**
 * GET /api/hr-leads/
 * Fetches a paginated, filtered, and sorted list of HR leads.
 */
router.get("/", adminOnly, async (req, res) => {
    const { page = 1, limit = 25, sort = 'created_at.desc' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [sortField, sortOrder] = sort.split('.');
    const validSortFields = ['name', 'company_name', 'designation', 'confidence', 'email', 'lead_status', 'email_status', 'created_at'];
    const orderByField = sortField === 'company_name' ? 'tc.name' : `hl.${sortField}`;
    const orderBy = validSortFields.includes(sortField) ? orderByField : 'hl.created_at';
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    const { clause, params } = buildWhereClause(req.query);

    try {
        const countQuery = `SELECT COUNT(hl.id) FROM hr_leads hl LEFT JOIN targeted_companies tc ON hl.company_id = tc.id ${clause}`;
        const totalResult = await pool.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].count, 10);
        const totalPages = Math.ceil(total / parseInt(limit, 10));

        const dataQuery = `
            SELECT 
                hl.id, hl.name, hl.designation, hl.email, hl.email_status, hl.lead_status,
                hl.linkedin_url, hl.location, hl.confidence, hl.created_at, hl.source,
                COALESCE(tc.name, 'Unknown Company') as company_name
            FROM hr_leads hl
            LEFT JOIN targeted_companies tc ON hl.company_id = tc.id
            ${clause}
            ORDER BY ${orderBy} ${orderDirection} NULLS LAST
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const dataResult = await pool.query(dataQuery, [...params, limit, offset]);

        return ok(res, {
            data: dataResult.rows,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                totalPages
            }
        });
    } catch (e) {
        console.error("GET /api/hr-leads error:", e);
        return bad(res, "Server error while fetching leads.", 500);
    }
});

/**
 * GET /api/hr-leads/filters/options
 * Fetches unique values for filter dropdowns.
 */
router.get("/filters/options", adminOnly, async (req, res) => {
    try {
        const [companyRes, designationRes, locationRes] = await Promise.all([
            pool.query('SELECT name, COUNT(hr_leads.id) as lead_count FROM targeted_companies JOIN hr_leads ON targeted_companies.id = hr_leads.company_id GROUP BY name ORDER BY name ASC'),
            pool.query('SELECT DISTINCT designation FROM hr_leads WHERE designation IS NOT NULL ORDER BY designation ASC'),
            pool.query('SELECT DISTINCT location FROM hr_leads WHERE location IS NOT NULL ORDER BY location ASC')
        ]);
        return ok(res, {
            companies: companyRes.rows,
            designations: designationRes.rows.map(r => r.designation),
            locations: locationRes.rows.map(r => r.location),
        });
    } catch (e) {
        console.error("GET /api/hr-leads/filters/options error:", e);
        return bad(res, "Server error", 500);
    }
});

/**
 * POST /api/hr-leads
 * Creates a new lead.
 */
router.post("/", adminOnly, async (req, res) => {
    const {
        company_id, name, designation, email, linkedin_url, location, email_status = 'unknown', lead_status = 'New'
    } = req.body;

    if (!company_id || !name || !designation || !email) {
        return bad(res, "company_id, name, designation, and email are required fields.", 400);
    }

    try {
        const query = `
            INSERT INTO hr_leads (company_id, name, designation, email, linkedin_url, location, email_status, lead_status, source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')
            RETURNING *;
        `;
        const result = await pool.query(query, [company_id, name, designation, email, linkedin_url, location, email_status, lead_status]);
        return ok(res, result.rows[0]);
    } catch (e) {
        if (e.code === '23505') { // unique_violation
            return bad(res, `A lead with this email or LinkedIn URL already exists.`, 409);
        }
        console.error("POST /api/hr-leads error:", e);
        return bad(res, "Server error", 500);
    }
});

// --- NEW ENDPOINT: Placed before bulk and parameterized routes ---
/**
 * POST /api/hr-leads/check-duplicate
 * Checks if a lead with the given email or LinkedIn URL already exists.
 */
router.post("/check-duplicate", adminOnly, async (req, res) => {
    const { email, linkedin_url } = req.body;

    if (!email && !linkedin_url) {
        return bad(res, "Either email or linkedin_url is required to check for duplicates.", 400);
    }

    try {
        const query = "SELECT email, linkedin_url FROM hr_leads WHERE email = $1 OR linkedin_url = $2 LIMIT 1";
        const { rows, rowCount } = await pool.query(query, [email, linkedin_url]);

        if (rowCount > 0) {
            const existing = rows[0];
            const message = existing.email === email
                ? "A lead with this email address already exists."
                : "A lead with this LinkedIn profile already exists.";
            return ok(res, { is_duplicate: true, message });
        }

        return ok(res, { is_duplicate: false });
    } catch (e) {
        console.error("POST /api/hr-leads/check-duplicate error:", e);
        return bad(res, "Server error while checking for duplicates.", 500);
    }
});


/**
 * POST /api/hr-leads/bulk/delete
 * Deletes multiple leads at once.
 */
router.post("/bulk/delete", adminOnly, async (req, res) => {
    const { leadIds } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return bad(res, "leadIds must be a non-empty array.", 400);
    }
    try {
        const result = await pool.query("DELETE FROM hr_leads WHERE id = ANY($1::uuid[])", [leadIds]);
        return ok(res, { deletedCount: result.rowCount });
    } catch (e) {
        console.error("POST /api/hr-leads/bulk/delete error:", e);
        return bad(res, "Server error during bulk delete.", 500);
    }
});

/**
 * PATCH /api/hr-leads/bulk/status
 * Updates the lead_status for multiple leads at once.
 */
router.patch("/bulk/status", adminOnly, async (req, res) => {
    const { leadIds, newStatus } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return bad(res, "leadIds must be a non-empty array.", 400);
    }
    if (!LEAD_STATUSES.includes(newStatus)) {
        return bad(res, "Invalid newStatus provided.", 400);
    }

    try {
        const result = await pool.query(
            "UPDATE hr_leads SET lead_status = $1 WHERE id = ANY($2::uuid[])",
            [newStatus, leadIds]
        );
        return ok(res, { updatedCount: result.rowCount });
    } catch (e) {
        console.error("PATCH /api/hr-leads/bulk/status error:", e);
        return bad(res, "Server error during bulk update.", 500);
    }
});

/**
 * POST /api/hr-leads/bulk/rescore
 * Recalculates and updates the confidence score for multiple leads.
 */
router.post("/bulk/rescore", adminOnly, async (req, res) => {
    const { leadIds } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return bad(res, "leadIds must be a non-empty array.", 400);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updatedLeads = [];
        for (const id of leadIds) {
            const leadRes = await client.query("SELECT * FROM hr_leads WHERE id = $1", [id]);
            if (leadRes.rowCount === 0) continue; 

            const lead = leadRes.rows[0];
            if (!lead.company_id) continue;

            const companyRes = await client.query("SELECT * FROM targeted_companies WHERE id = $1", [lead.company_id]);
            if (companyRes.rowCount === 0) continue;

            const company = companyRes.rows[0];
            const newScore = calculatePreviewScore(lead, company);
            
            const updateRes = await client.query(
                "UPDATE hr_leads SET confidence = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [newScore, id]
            );
            
            if (updateRes.rowCount > 0) {
                const updatedLead = updateRes.rows[0];
                updatedLead.company_name = company.name;
                updatedLeads.push(updatedLead);
            }
        }

        await client.query('COMMIT');
        return ok(res, { updatedCount: updatedLeads.length, updatedLeads });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("POST /api/hr-leads/bulk/rescore error:", e);
        return bad(res, "Server error during bulk re-score.", 500);
    } finally {
        client.release();
    }
});


// --- SINGLE LEAD / PARAMETERIZED ROUTES ---

/**
 * GET /api/hr-leads/:id
 * Fetches a single lead by ID.
 */
router.get("/:id", adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT hl.*, tc.name as company_name 
            FROM hr_leads hl
            LEFT JOIN targeted_companies tc ON hl.company_id = tc.id
            WHERE hl.id = $1
        `;
        const result = await pool.query(query, [id]);
        if (result.rowCount === 0) {
            return bad(res, "Lead not found", 404);
        }
        return ok(res, result.rows[0]);
    } catch (e) {
        console.error(`GET /api/hr-leads/${req.params.id} error:`, e);
        return bad(res, "Server error", 500);
    }
});

/**
 * PATCH /api/hr-leads/:id
 * Updates a single lead.
 */
router.patch("/:id", adminOnly, async (req, res) => {
    const { id } = req.params;
    const fields = req.body;
    const allowedFields = ['name', 'designation', 'email', 'linkedin_url', 'location', 'email_status', 'lead_status', 'company_id'];
    
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const key of allowedFields) {
        if (fields[key] !== undefined) {
            setClauses.push(`${key} = $${paramIndex++}`);
            params.push(fields[key]);
        }
    }

    if (setClauses.length === 0) {
        return bad(res, "No valid fields to update.", 400);
    }

    try {
        const query = `UPDATE hr_leads SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *;`;
        const result = await pool.query(query, params);
        if (result.rowCount === 0) {
            return bad(res, "Lead not found", 404);
        }
        return ok(res, result.rows[0]);
    } catch (e) {
        console.error(`PATCH /api/hr-leads/${id} error:`, e);
        return bad(res, "Server error", 500);
    }
});


/**
 * DELETE /api/hr-leads/:id
 * Deletes a lead by ID.
 */
router.delete("/:id", adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM hr_leads WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return bad(res, "Lead not found", 404);
        }
        return ok(res, { message: "Lead deleted successfully." });
    } catch (e) {
        console.error(`DELETE /api/hr-leads/${req.params.id} error:`, e);
        return bad(res, "Server error", 500);
    }
});

/**
 * POST /api/hr-leads/:id/rescore
 * Recalculates and updates the confidence score for a lead.
 */
router.post("/:id/rescore", adminOnly, async (req, res) => {
    const { id } = req.params;
    try {
        const leadRes = await pool.query("SELECT * FROM hr_leads WHERE id = $1", [id]);
        if (leadRes.rowCount === 0) return bad(res, "Lead not found", 404);
        const lead = leadRes.rows[0];

        if (!lead.company_id) return bad(res, "Lead is not associated with a company.", 400);

        const companyRes = await pool.query("SELECT * FROM targeted_companies WHERE id = $1", [lead.company_id]);
        if (companyRes.rowCount === 0) return bad(res, "Associated company not found", 404);
        const company = companyRes.rows[0];

        const newScore = calculatePreviewScore(lead, company);
        
        const updateRes = await pool.query(
            "UPDATE hr_leads SET confidence = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
            [newScore, id]
        );
        
        return ok(res, updateRes.rows[0]);
    } catch (e) {
        console.error(`POST /api/hr-leads/${id}/rescore error:`, e);
        return bad(res, "Server error while rescoring.", 500);
    }
});

// PATCH /api/hr-leads/:id/favorite - Toggle favorite status
router.patch("/:id/favorite", adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const { value } = req.body; // true or false

        if (typeof value !== 'boolean') {
            return bad(res, "value must be boolean", 400);
        }

        const result = await pool.query(`
            UPDATE hr_leads
            SET
                is_favorite = $1,
                shortlisted_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, name, is_favorite, shortlisted_at
        `, [value, id]);

        if (result.rows.length === 0) {
            return bad(res, "Lead not found", 404);
        }

        return ok(res, result.rows[0]);
    } catch (e) {
        console.error(`PATCH /api/hr-leads/${req.params.id}/favorite error:`, e);
        return bad(res, "Server error while toggling favorite.", 500);
    }
});

// PATCH /api/hr-leads/:id/irrelevant - Toggle irrelevant status
router.patch("/:id/irrelevant", adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const { value } = req.body; // true or false

        if (typeof value !== 'boolean') {
            return bad(res, "value must be boolean", 400);
        }

        const result = await pool.query(`
            UPDATE hr_leads
            SET
                is_irrelevant = $1,
                marked_irrelevant_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, name, is_irrelevant, marked_irrelevant_at
        `, [value, id]);

        if (result.rows.length === 0) {
            return bad(res, "Lead not found", 404);
        }

        return ok(res, result.rows[0]);
    } catch (e) {
        console.error(`PATCH /api/hr-leads/${req.params.id}/irrelevant error:`, e);
        return bad(res, "Server error while toggling irrelevant.", 500);
    }
});


module.exports = router;