/**
 * Helper script to generate real ZK proof from backend
 * 
 * Usage:
 *   node scripts/generate-real-zk-proof.js
 * 
 * This calls the backend API to generate a real ZK proof for testing
 * 
 * Note: Requires Node 18+ (built-in fetch) or install node-fetch
 */

// Use built-in fetch (Node 18+) or require node-fetch
let fetch;
try {
    fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
    console.error('Error: fetch not available. Install node-fetch or use Node 18+');
    process.exit(1);
}

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const SERVICE_API_KEY = process.env.SERVICE_API_KEY || '';

// Test data
const testUsers = [
    process.env.TEST_USER_ADDRESS || '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333'
];

const testScores = [75, 80, 70]; // 0-100 range
const testMultipliers = [1000, 1200, 800]; // 1.0x, 1.2x, 0.8x (scaled to 10-10000)
const testAmounts = [
    100000000000000000000n, // 100 MYNT
    50000000000000000000n,  // 50 MYNT
    25000000000000000000n   // 25 MYNT
];

async function generateZKProof() {
    console.log('='.repeat(80));
    console.log('GENERATE REAL ZK PROOF');
    console.log('='.repeat(80));
    console.log(`Backend URL: ${BACKEND_URL}`);
    console.log(`Users: ${testUsers.length}`);
    console.log(`Total amount: ${testAmounts.reduce((a, b) => a + b, 0n).toString()} wei`);
    
    const requestBody = {
        users: testUsers,
        scores: testScores,
        multipliers: testMultipliers,
        amounts: testAmounts.map(a => a.toString()),
        base_reward_amount: 1000000
    };
    
    console.log('\n📝 Calling backend ZK proof service...');
    console.log(JSON.stringify(requestBody, null, 2));
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/zk/generate-provider-proof`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Service-API-Key': SERVICE_API_KEY
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend returned ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        console.log('\n✅ ZK Proof generated successfully!');
        console.log('\nProof structure:');
        console.log(JSON.stringify({
            proof: {
                a: result.proof.a,
                b: result.proof.b,
                c: result.proof.c
            },
            public_signals: result.public_signals,
            merkle_root: result.merkle_root,
            batch_hash: result.batch_hash
        }, null, 2));
        
        // Format for Solidity
        console.log('\n📝 Formatted for Solidity contract:');
        console.log(`proofA: [${result.proof.a.map(s => `"${s}"`).join(', ')}]`);
        console.log(`proofB: [[${result.proof.b[0].map(s => `"${s}"`).join(', ')}], [${result.proof.b[1].map(s => `"${s}"`).join(', ')}]]`);
        console.log(`proofC: [${result.proof.c.map(s => `"${s}"`).join(', ')}]`);
        console.log(`publicInputs: [${result.public_signals.map(s => `"${s}"`).join(', ')}]`);
        
        return result;
        
    } catch (error) {
        console.error('\n❌ Failed to generate ZK proof:');
        console.error(error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Ensure backend is running: cd backend && python -m uvicorn main:app');
        console.log('2. Check SERVICE_API_KEY is set correctly');
        console.log('3. Verify ZK circuit files are compiled');
        console.log('4. Check backend logs for errors');
        process.exit(1);
    }
}

generateZKProof()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
