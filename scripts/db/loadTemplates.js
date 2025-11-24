#!/usr/bin/env node
/**
 * Load Core Voice Templates into Database
 */

const { Pool } = require('pg');
const { coreTemplates } = require('../../db/seeds/voice_templates_seed');

async function loadTemplates() {
  const pool = new Pool({
    host: '34.121.0.240',
    port: 5432,
    database: 'upr_production',
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    ssl: false
  });

  console.log(`Loading ${coreTemplates.length} templates into database...`);

  try {
    for (const template of coreTemplates) {
      const query = `
        INSERT INTO voice_templates (
          template_type, category, tone, template_text, subject_template,
          variables, optional_variables, conditions, priority, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, template_type, category, tone
      `;

      const values = [
        template.template_type,
        template.category,
        template.tone,
        template.template_text,
        template.subject_template || null,
        JSON.stringify(template.variables || []),
        JSON.stringify(template.optional_variables || []),
        JSON.stringify(template.conditions || {}),
        template.priority || 50,
        'sprint-31-seed'
      ];

      const result = await pool.query(query, values);
      const loaded = result.rows[0];
      console.log(`✅ Loaded: ${loaded.template_type}/${loaded.category}/${loaded.tone} (ID: ${loaded.id})`);
    }

    console.log(`\n✅ Successfully loaded ${coreTemplates.length} templates!`);

  } catch (error) {
    console.error('Error loading templates:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

loadTemplates();
