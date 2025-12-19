/**
 * PHASE 2 Score Collection
 *
 * Run this script to enter human evaluator scores from paper packets.
 * Usage: node collect-scores.js <evaluator_id>
 */

import readline from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const SCENARIOS = [
  {
    "id": "EB-UAE-001",
    "name": "Skeptical HR Director - Large Corp Payroll Migration",
    "golden_id": "98b970d5-81d8-4bd3-a5c9-8b7524490edd",
    "kill_id": "93b70068-f63e-4f9e-8f41-20f5c096e97f"
  },
  {
    "id": "EB-UAE-002",
    "name": "Skeptical HR Manager - SME First Bank Account",
    "golden_id": "3d880546-1ad2-4a28-af8a-998e7f18b4e3",
    "kill_id": "2dd30bd6-7d72-43cd-9f78-9e23167aaa02"
  },
  {
    "id": "EB-UAE-003",
    "name": "Skeptical CFO - Cost Reduction Focus",
    "golden_id": "d874c9b6-451e-4cec-a014-92611960b1b3",
    "kill_id": "7a730a55-9995-4dae-95c7-c0b65b2974be"
  },
  {
    "id": "EB-UAE-004",
    "name": "Skeptical Operations Head - Integration Concerns",
    "golden_id": "c2119c3d-1f89-4851-ae62-0074c1975d06",
    "kill_id": "6cf5b475-29f6-49f8-874f-e0ac1fb9da68"
  },
  {
    "id": "EB-UAE-005",
    "name": "Skeptical CEO - Personal Banking Bundle",
    "golden_id": "f3076bd4-a58e-4830-ab4d-0417af47d2fb",
    "kill_id": "faf04d8e-1981-4365-9db4-d17a5f25b004"
  },
  {
    "id": "EB-UAE-006",
    "name": "Skeptical Finance Manager - Audit Concerns",
    "golden_id": "95f3864b-3878-405e-8684-02240a09b675",
    "kill_id": "024b125b-f0ec-4329-8447-5cce652d4589"
  },
  {
    "id": "EB-UAE-007",
    "name": "Skeptical HR - Bad Past Experience",
    "golden_id": "6c71be16-32ff-49eb-bc48-fb1424143dc6",
    "kill_id": "21fb2809-46fb-4781-b011-46d85c25f177"
  },
  {
    "id": "EB-UAE-008",
    "name": "Busy Payroll Manager - Multi-Branch Setup",
    "golden_id": "eb8d8f76-7a3b-4174-b64f-098ddbded512",
    "kill_id": "11d95253-78a6-46ad-b3ba-f406ef4927d1"
  },
  {
    "id": "EB-UAE-009",
    "name": "Busy Payroll Manager - Month-End Pressure",
    "golden_id": "1d47e16f-7abd-4d14-965c-5b0a7432247c",
    "kill_id": "f7f37097-0e2a-4510-aa93-bc81bb699640"
  },
  {
    "id": "EB-UAE-010",
    "name": "Busy Payroll Manager - Free Zone Company",
    "golden_id": "ee1934d0-5529-4f5f-883d-69027be8379f",
    "kill_id": "dfd5477c-a009-4380-b3ad-2e0bfb2b31cf"
  },
  {
    "id": "EB-UAE-011",
    "name": "Busy Payroll Manager - Construction Company",
    "golden_id": "e0bfb318-2704-4942-b2da-aa299961b864",
    "kill_id": "8312bf1f-1b5c-43d3-a1db-20074094f808"
  },
  {
    "id": "EB-UAE-012",
    "name": "Busy Payroll Manager - Hospitality Chain",
    "golden_id": "954a19d6-8235-43c0-9127-baf16b94c1cd",
    "kill_id": "5c2ef249-a83a-4dc6-8144-848b0d2cedef"
  },
  {
    "id": "EB-UAE-013",
    "name": "Busy Payroll Manager - Healthcare Facility",
    "golden_id": "def7dbe1-0275-4dec-8a60-8267a8cb6c0f",
    "kill_id": "85f8868f-e08f-4e00-980e-351c20807c9e"
  },
  {
    "id": "EB-UAE-014",
    "name": "Busy Payroll Manager - Retail Chain",
    "golden_id": "8d2ac820-172a-4d6f-b4e9-98b1a99b6514",
    "kill_id": "1147df00-a57a-4306-bb73-6ad495ad7eca"
  },
  {
    "id": "EB-UAE-015",
    "name": "Compliance Officer - WPS Audit Prep",
    "golden_id": "5341030f-6511-4f40-a9f4-c87330b59de8",
    "kill_id": "9606ddf3-d111-463d-8882-53a6b659b892"
  },
  {
    "id": "EB-UAE-016",
    "name": "Legal Counsel - Contract Review",
    "golden_id": "e71c1673-88a4-4d44-85ed-7401ef26da5d",
    "kill_id": "68711eb7-1346-48e8-b1cf-b74a01cb9484"
  },
  {
    "id": "EB-UAE-017",
    "name": "Compliance Manager - Data Privacy Concerns",
    "golden_id": "a8d57fb0-b8b8-4969-8307-51ab2e81ada6",
    "kill_id": "7cdd3a36-2326-4d90-8c1b-dc288a2d6256"
  },
  {
    "id": "EB-UAE-018",
    "name": "Risk Manager - Business Continuity",
    "golden_id": "54a3c9d5-e8ee-41dc-9c8f-a0f28bdcd038",
    "kill_id": "e14ca968-dd2c-48d5-b662-176fdc28c03f"
  },
  {
    "id": "EB-UAE-019",
    "name": "Internal Auditor - Process Review",
    "golden_id": "667f8e0c-026c-4091-b703-d91afbd0d86b",
    "kill_id": "64777e7d-4683-4c3c-8178-0bc2c15b8fb9"
  },
  {
    "id": "EB-UAE-020",
    "name": "Government Relations - Ministry Requirements",
    "golden_id": "360cb590-31d1-4f2e-9554-408e8c1acdf2",
    "kill_id": "58f1c926-d04b-4e42-8aef-a9a81fa06c1d"
  },
  {
    "id": "EB-UAE-021",
    "name": "External Auditor Prep - Big 4 Audit",
    "golden_id": "0d8bd1d8-c613-4271-9b0e-4dedc0e6c961",
    "kill_id": "4d05f575-e198-4575-b631-48109791ca5f"
  },
  {
    "id": "EB-UAE-022",
    "name": "Cost-Conscious Startup - Series A",
    "golden_id": "e96cd1bd-be36-44e0-be33-d1d6e5385ffe",
    "kill_id": "ed9d6846-75e4-468c-aaf0-daa30355a5b4"
  },
  {
    "id": "EB-UAE-023",
    "name": "Family Business - Fee Negotiation",
    "golden_id": "3d8b9c41-9ed1-4832-a09e-6edc8d4bc6e9",
    "kill_id": "3cad05fe-b487-454e-aa6b-a821de88f94f"
  },
  {
    "id": "EB-UAE-024",
    "name": "Procurement Manager - RFP Process",
    "golden_id": "95b7b82a-0fc1-4770-84d9-d05abd826c50",
    "kill_id": "1351b2bc-6156-4830-b5ad-32c3b8691d50"
  },
  {
    "id": "EB-UAE-025",
    "name": "Budget Owner - Annual Planning",
    "golden_id": "a9b872b3-7a24-4af7-a83a-85383f6e375b",
    "kill_id": "84d922ea-5792-48b2-abaf-d4ad425ba6ca"
  },
  {
    "id": "EB-UAE-026",
    "name": "Cash-Strapped SME - Survival Mode",
    "golden_id": "a3b86c15-e6cd-4698-8d83-b3e0a8883598",
    "kill_id": "b86c00ad-8d9b-4427-b8a5-597b0d6ea583"
  },
  {
    "id": "EB-UAE-027",
    "name": "Multinational Subsidiary - Global Mandate",
    "golden_id": "a9798255-d4c4-42c7-b910-54aa27b9568f",
    "kill_id": "bc6cd194-f540-40cc-b0f1-117a5539bd9c"
  },
  {
    "id": "EB-UAE-028",
    "name": "Negotiator - Playing Banks Against Each Other",
    "golden_id": "94084e10-7a17-4e3c-a5aa-214eca8a888b",
    "kill_id": "1668f3ac-6bfb-464d-a1ac-693e3a37f651"
  },
  {
    "id": "EB-UAE-029",
    "name": "IT Director - System Integration Gatekeeper",
    "golden_id": "027a51aa-5166-4863-a6ba-130225c66cf0",
    "kill_id": "9314c4ec-acae-4182-b57d-fdd634ec173f"
  },
  {
    "id": "EB-UAE-030",
    "name": "Employee Council Rep - Staff Satisfaction",
    "golden_id": "fe6e7d2e-5e51-4e0c-9158-db601983cc59",
    "kill_id": "fb06949f-948f-4492-994d-fea236b7b0a1"
  },
  {
    "id": "EB-UAE-031",
    "name": "Board Member - Strategic Initiative",
    "golden_id": "5be9fe7e-48a7-4fd9-9931-816b2464a84a",
    "kill_id": "a3fbc4a5-4b4a-4855-b70d-451647ad9ae4"
  },
  {
    "id": "EB-UAE-032",
    "name": "External Consultant - Bank Selection Project",
    "golden_id": "b1dd4a2c-aa61-48e1-900b-1f59a2130bd2",
    "kill_id": "b7c45f46-e77c-47ef-bfff-18145fe399a8"
  },
  {
    "id": "EB-UAE-033",
    "name": "Accountant - Daily Operations",
    "golden_id": "388c18c2-80e2-4931-bedc-9f6b79d6fd71",
    "kill_id": "1b1ec6ee-6d61-44a0-83e8-f270bd51ae6b"
  },
  {
    "id": "EB-UAE-034",
    "name": "New HR Director - Making Their Mark",
    "golden_id": "a229599c-6aae-458c-a5cf-1938722dfb25",
    "kill_id": "0286d043-d8b6-462a-8e4e-1d6153547329"
  },
  {
    "id": "EB-UAE-035",
    "name": "Retiring Manager - Handover Situation",
    "golden_id": "5fd34503-6dc2-44d8-aff3-6a31453e2827",
    "kill_id": "bb239d80-33b6-411e-a9a9-7e75dc36ad4b"
  }
];

const CRS_KEYS = ["qualification","needs_discovery","value_articulation","objection_handling","process_adherence","compliance","relationship_building","next_step_secured"];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function collectScores() {
  const evaluatorId = process.argv[2];
  if (!evaluatorId) {
    console.error('Usage: node collect-scores.js EVAL_1');
    process.exit(1);
  }

  const outputFile = `scores_${evaluatorId}.json`;
  const scores = { evaluator_id: evaluatorId, collected_at: new Date().toISOString(), scores: [] };

  console.log(`\nCollecting scores for ${evaluatorId}\n`);

  for (const scenario of SCENARIOS) {
    // Golden path
    console.log(`\n=== ${scenario.id} (GOLDEN) ===`);
    const goldenScores = {};
    for (const key of CRS_KEYS) {
      const score = await question(`  ${key} (1-5): `);
      goldenScores[key] = parseInt(score) || 3;
    }
    scores.scores.push({
      scenario_id: scenario.golden_id,
      path_type: 'GOLDEN',
      crs_scores: goldenScores,
    });

    // Kill path
    console.log(`\n=== ${scenario.id} (KILL) ===`);
    const killScores = {};
    for (const key of CRS_KEYS) {
      const score = await question(`  ${key} (1-5): `);
      killScores[key] = parseInt(score) || 3;
    }
    scores.scores.push({
      scenario_id: scenario.kill_id,
      path_type: 'KILL',
      crs_scores: killScores,
    });
  }

  writeFileSync(outputFile, JSON.stringify(scores, null, 2));
  console.log(`\nScores saved to ${outputFile}`);
  rl.close();
}

collectScores().catch(console.error);
