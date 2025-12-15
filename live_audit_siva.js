
import { generateAllExplanations } from './services/siva/aiExplanationService.js';
import { generateAIOutreach } from './services/siva/aiOutreachService.js';

// Mock data for banking
const mockScores = {
    q_score: { score: 85, breakDown: { payroll_potential: 'HIGH' } },
    t_score: { score: 72, breakDown: { recent_funding: 'TRUE' } },
    l_score: { score: 68 },
    e_score: { score: 90 },
    composite: { score: 79 }
};

const mockEntity = {
    id: 'test-company',
    name: 'Acme Corp',
    industry: 'Technology',
    employees: 500,
    domain: 'acme.com'
};

const mockSignals = [
    { type: 'hiring', description: 'Hiring 50 new engineers in Dubai', source: 'LinkedIn' },
    { type: 'funding', description: 'Raised Series B $20M', source: 'Crunchbase' }
];

async function runAudit() {
    console.log('🔵 STARTING SIVA LIVE AUDIT...');

    try {
        // 1. Test Banking Employee Profile
        console.log('\nTesting Banking Employee Profile...');
        const explanation = await generateAllExplanations(
            mockScores,
            mockEntity,
            mockSignals,
            'banking_employee'
        );

        console.log('✅ Explanation Generated:');
        console.log(JSON.stringify(explanation, null, 2));

        // 2. Test Outreach Generation (Banking)
        console.log('\nTesting Outreach Generation...');
        const leads = [{
            name: 'John Doe',
            designation: 'HR Director',
            company: 'Acme Corp'
        }];

        const outreach = await generateAIOutreach(
            leads,
            'email',
            'formal',
            'banking_employee',
            { qtle: mockScores } // passing score context
        );

        console.log('✅ Outreach Generated:');
        console.log(JSON.stringify(outreach, null, 2));

    } catch (error) {
        console.error('🔴 AUDIT FAILED:', error);
    }
}

runAudit();
