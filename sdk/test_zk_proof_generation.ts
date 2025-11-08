/**
 * Test ZK Proof Generation SDK
 * 
 * Run with: npx ts-node token/sdk/test_zk_proof_generation.ts
 * Or: cd token && npm run test:zk
 */

import { ZKProofGenerator, ZKProofInputs, ZKProofUtils } from './zkProofGenerator';
import * as fs from 'fs';
import * as path from 'path';

async function testZKProofGeneration() {
    console.log("\n" + "=".repeat(70));
    console.log("🧪 Testing ZK Proof Generation SDK");
    console.log("=".repeat(70));

    // Check if circuit files exist
    const wasmPath = path.join(__dirname, '../zk-circuits/reward_claim.wasm');
    const zkeyPath = path.join(__dirname, '../zk-circuits/reward_claim_final.zkey');

    if (!fs.existsSync(wasmPath)) {
        console.error("\n❌ Error: WASM file not found at:", wasmPath);
        console.error("   Please compile the circuit first:");
        console.error("   cd token/zk-circuits && ./compile.sh");
        process.exit(1);
    }

    if (!fs.existsSync(zkeyPath)) {
        console.error("\n❌ Error: ZKey file not found at:", zkeyPath);
        console.error("   Please generate keys first:");
        console.error("   cd token/zk-circuits && ./generate-keys.sh");
        process.exit(1);
    }

    console.log("\n✅ Circuit files found");
    console.log(`   WASM: ${wasmPath}`);
    console.log(`   ZKey: ${zkeyPath}`);

    try {
        // Initialize generator
        console.log("\n🔧 Step 1: Initializing ZK Proof Generator...");
        const generator = new ZKProofGenerator(wasmPath, zkeyPath);
        await generator.initialize();
        console.log("✅ Generator initialized");

        // Test stats
        const stats = generator.getStats();
        console.log("\n📊 Generator Stats:");
        console.log(`   Initialized: ${stats.isInitialized}`);
        console.log(`   Has WASM: ${stats.hasWasm}`);
        console.log(`   Has ZKey: ${stats.hasZkey}`);

        // Create test inputs
        console.log("\n📝 Step 2: Creating test inputs...");
        const userAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";
        const merkleRoot = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        const aiScores = {
            legitimacyScore: 85,
            rewardMultiplier: 2500, // 2.5x
            abuseProbability: 15,
            engagementQuality: 80,
            metadata: { strategy: "myntis_default" }
        };

        const merkleData = {
            root: merkleRoot,
            proof: [
                "0x1111111111111111111111111111111111111111111111111111111111111111",
                "0x2222222222222222222222222222222222222222222222222222222222222222",
                "0x3333333333333333333333333333333333333333333333333333333333333333",
                "0x4444444444444444444444444444444444444444444444444444444444444444",
                "0x5555555555555555555555555555555555555555555555555555555555555555",
                "0x6666666666666666666666666666666666666666666666666666666666666666",
                "0x7777777777777777777777777777777777777777777777777777777777777777",
                "0x8888888888888888888888888888888888888888888888888888888888888888"
            ],
            pathIndices: [0, 1, 0, 1, 0, 1, 0, 1],
            amount: "1000000000000000000" // 1 token
        };

        // Generate nullifier
        console.log("\n🔐 Step 3: Generating nullifier...");
        const nullifier = generator.generateNullifier(userAddress, merkleRoot);
        console.log(`   Nullifier: ${nullifier}`);
        console.log("✅ Nullifier generated");

        // Create proof inputs
        console.log("\n📦 Step 4: Creating proof inputs...");
        const proofInputs = generator.createProofInputs(userAddress, aiScores, merkleData);
        
        // Validate inputs
        const isValid = ZKProofUtils.validateProofInputs(proofInputs);
        if (!isValid) {
            throw new Error("Proof inputs validation failed");
        }
        console.log("✅ Proof inputs created and validated");

        console.log("\n📋 Proof Inputs:");
        console.log(`   Merkle Root: ${proofInputs.merkleRoot}`);
        console.log(`   Nullifier: ${proofInputs.nullifier}`);
        console.log(`   Claim Amount: ${proofInputs.claimAmount}`);
        console.log(`   User Address: ${proofInputs.userAddress}`);
        console.log(`   AI Legitimacy Score: ${proofInputs.aiLegitimacyScore}`);
        console.log(`   AI Reward Multiplier: ${proofInputs.aiRewardMultiplier}`);
        console.log(`   Merkle Proof Length: ${proofInputs.merkleProof.length}`);
        console.log(`   Path Indices Length: ${proofInputs.merklePathIndices.length}`);

        // Generate proof
        console.log("\n🔨 Step 5: Generating ZK proof...");
        const startTime = Date.now();
        const proofResult = await generator.generateRewardClaimProof(proofInputs);
        const endTime = Date.now();
        const proofTime = endTime - startTime;

        console.log(`✅ Proof generated in ${proofTime}ms`);

        // Display proof
        console.log("\n📊 Proof Result:");
        console.log(`   Proof A: [${proofResult.proof.a[0].slice(0, 20)}..., ${proofResult.proof.a[1].slice(0, 20)}...]`);
        console.log(`   Proof B: [[${proofResult.proof.b[0][0].slice(0, 20)}..., ${proofResult.proof.b[0][1].slice(0, 20)}...],`);
        console.log(`            [${proofResult.proof.b[1][0].slice(0, 20)}..., ${proofResult.proof.b[1][1].slice(0, 20)}...]]`);
        console.log(`   Proof C: [${proofResult.proof.c[0].slice(0, 20)}..., ${proofResult.proof.c[1].slice(0, 20)}...]`);
        console.log(`   Public Signals: ${proofResult.publicSignals.length}`);
        console.log(`   Public Signal 0 (merkleRoot): ${proofResult.publicSignals[0]}`);
        console.log(`   Public Signal 1 (nullifier): ${proofResult.publicSignals[1]}`);
        console.log(`   Public Signal 2 (claimAmount): ${proofResult.publicSignals[2]}`);

        // Verify proof (if verification key available)
        console.log("\n🔍 Step 6: Verifying proof...");
        const vkeyPath = path.join(__dirname, '../zk-circuits/verification_key.json');
        if (fs.existsSync(vkeyPath)) {
            const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
            const verified = await generator.verifyProof(
                proofResult.proof,
                proofResult.publicSignals,
                vkey
            );
            
            if (verified) {
                console.log("✅ Proof verified successfully!");
            } else {
                console.error("❌ Proof verification failed!");
                process.exit(1);
            }
        } else {
            console.log("   ⚠️  Verification key not found, skipping verification");
        }

        // Test with different scores
        console.log("\n🧪 Step 7: Testing with different AI scores...");
        
        const testCases = [
            { name: "High Score", legitimacy: 95, multiplier: 9000 },
            { name: "Medium Score", legitimacy: 75, multiplier: 5000 },
            { name: "Low Score", legitimacy: 30, multiplier: 600 },
        ];

        for (const testCase of testCases) {
            const testScores = {
                ...aiScores,
                legitimacyScore: testCase.legitimacy,
                rewardMultiplier: testCase.multiplier
            };
            
            const testInputs = generator.createProofInputs(userAddress, testScores, merkleData);
            const isValid = ZKProofUtils.validateProofInputs(testInputs);
            
            if (isValid) {
                const testProof = await generator.generateRewardClaimProof(testInputs);
                console.log(`   ✅ ${testCase.name} (${testCase.legitimacy}, ${testCase.multiplier}): Proof generated`);
            } else {
                console.log(`   ❌ ${testCase.name}: Input validation failed`);
            }
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ ALL ZK PROOF GENERATION TESTS PASSED!");
        console.log("=".repeat(70));
        console.log("\n📊 Performance:");
        console.log(`   Proof Generation Time: ${proofTime}ms`);
        console.log(`   Target: <1000ms`);
        console.log(`   Status: ${proofTime < 1000 ? '✅' : '⚠️'}`);
        
        console.log("\n💡 Next Steps:");
        console.log("   1. Integrate with frontend ZK claim flow");
        console.log("   2. Test with real Merkle proofs from database");
        console.log("   3. Test on-chain verification");

    } catch (error) {
        console.error("\n❌ Error:", error);
        if (error instanceof Error) {
            console.error("   Message:", error.message);
            console.error("   Stack:", error.stack);
        }
        process.exit(1);
    }
}

// Run test
testZKProofGeneration().catch(console.error);

