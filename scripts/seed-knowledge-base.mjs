// scripts/seed-knowledge-base.mjs
import { Pool } from 'pg';
import OpenAI from 'openai';

// --- Configuration ---
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 50; // Process 50 items at a time to avoid overwhelming APIs

// --- Seed Data ---
// In a real-world scenario, this would be a much larger list (2-3k companies as per the plan).
const COMPANY_SEED_DATA = [
    { name: "ADNOC", domain: "adnoc.ae" },
    { name: "Emirates Group", domain: "emiratesgroup.com" },
    { name: "Emaar Properties", domain: "emaar.com" },
    { name: "Etisalat by e&", domain: "eand.com" },
    { name: "First Abu Dhabi Bank", domain: "bankfab.com" },
    { name: "Mubadala Investment Company", domain: "mubadala.com" },
    { name: "DP World", domain: "dpworld.com" },
    { name: "Aldar Properties", domain: "aldar.com" },
    { name: "Dubai Holding", domain: "dubaiholding.com" },
    { name: "Majid Al Futtaim", domain: "majidalfuttaim.com" },
];

// A sample of titles for normalization and RAG (plan suggests ~500)
const TITLE_SEED_DATA = [
    { title: "Human Resources Manager", normalized: "HR Manager", function: "HR", seniority: "Manager" },
    { title: "Senior HR Business Partner", normalized: "Senior HRBP", function: "HR", seniority: "Senior" },
    { title: "Talent Acquisition Specialist", normalized: "Recruiter", function: "HR", seniority: "Specialist" },
    { title: "Chief Human Resources Officer", normalized: "CHRO", function: "HR", seniority: "C-Level" },
    { title: "Payroll Coordinator", normalized: "Payroll Coordinator", function: "Finance", seniority: "Specialist" },
    { title: "Finance Director", normalized: "Finance Director", function: "Finance", seniority: "Director" },
    { title: "Accountant", normalized: "Accountant", function: "Finance", seniority: "Staff" },
    { title: "Office Manager", normalized: "Office Manager", function: "Admin", seniority: "Manager" },
    { title: "Administrative Assistant", normalized: "Admin Assistant", function: "Admin", seniority: "Staff" },
];


// --- Initialization ---
if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
    console.error("❌ Error: DATABASE_URL and OPENAI_API_KEY environment variables must be set.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for services like Render
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Core Functions ---

/**
 * Generates an embedding for a given text using the OpenAI API.
 * @param {string} text The text to embed.
 * @returns {Promise<number[]>} The embedding vector.
 */
async function getEmbedding(text) {
    if (!text || typeof text !== 'string') {
        throw new Error("Invalid text provided for embedding.");
    }
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error(`Error getting embedding for text: "${text}"`, error);
        throw error;
    }
}

async function processBatch(items, processor) {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processor));
    }
}

async function main() {
    console.log("🚀 Starting knowledge base seeding process...");
    const client = await pool.connect();
    try {
        // --- Seed Companies ---
        console.log(`\n🌱 Seeding ${COMPANY_SEED_DATA.length} companies...`);
        let companyCount = 0;
        await processBatch(COMPANY_SEED_DATA, async (company) => {
            const embedding = await getEmbedding(company.name);
            await client.query(
                `INSERT INTO kb_companies (name, domain, embedding)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (domain) DO UPDATE SET
                    name = EXCLUDED.name,
                    embedding = EXCLUDED.embedding,
                    updated_at = NOW()`,
                [company.name, company.domain, `[${embedding.join(',')}]`]
            );
            companyCount++;
            process.stdout.write(`\r   Processed ${companyCount}/${COMPANY_SEED_DATA.length} companies.`);
        });
        console.log("\n✅ Company seeding complete.");

        // --- Seed Titles ---
        console.log(`\n🌱 Seeding ${TITLE_SEED_DATA.length} titles...`);
        let titleCount = 0;
        await processBatch(TITLE_SEED_DATA, async (title) => {
            const embedding = await getEmbedding(title.title);
            await client.query(
                `INSERT INTO kb_titles (title, normalized_title, "function", seniority, embedding)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (title) DO UPDATE SET
                    normalized_title = EXCLUDED.normalized_title,
                    "function" = EXCLUDED."function",
                    seniority = EXCLUDED.seniority,
                    embedding = EXCLUDED.embedding`,
                [title.title, title.normalized, title.function, title.seniority, `[${embedding.join(',')}]`]
            );
            titleCount++;
            process.stdout.write(`\r   Processed ${titleCount}/${TITLE_SEED_DATA.length} titles.`);
        });
        console.log("\n✅ Title seeding complete.");

    } catch (error) {
        console.error("\n\n❌ An error occurred during the seeding process:", error);
    } finally {
        await client.release();
        await pool.end();
        console.log("\n🏁 Seeding process finished.");
    }
}

main();