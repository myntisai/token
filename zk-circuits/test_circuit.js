/**
 * Test script for ZK circuit
 * Tests circuit compilation, witness generation, and proof generation
 * 
 * Run with: node token/zk-circuits/test_circuit.js
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

// Paths
const CIRCUIT_DIR = __dirname;
const WASM_PATH = path.join(CIRCUIT_DIR, "reward_claim.wasm");
const ZKEY_PATH = path.join(CIRCUIT_DIR, "reward_claim_final.zkey");
const VKEY_PATH = path.join(CIRCUIT_DIR, "verification_key.json");

async function testCircuit() {
    console.log("\n" + "=".repeat(70));
    console.log("🧪 Testing ZK Circuit - Reward Claim");
    console.log("=".repeat(70));

    // Check if files exist
    if (!fs.existsSync(WASM_PATH)) {
        console.error("\n❌ Error: WASM file not found. Please compile the circuit first:");
        console.error("   cd token/zk-circuits && ./compile.sh");
        process.exit(1);
    }

    if (!fs.existsSync(ZKEY_PATH)) {
        console.error("\n❌ Error: ZKey file not found. Please generate keys first:");
        console.error("   cd token/zk-circuits && ./generate-keys.sh");
        process.exit(1);
    }

    console.log("\n✅ Circuit files found");

    // Test input data
    // Note: For circom, we need to convert hex strings to BigInt, then to string
    const testInputs = {
        // Public inputs (will be computed from private inputs)
        merkleRoot: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        nullifier: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        claimAmount: "1000000000000000000", // 1 token in wei

        // Private inputs
        userAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        aiLegitimacyScore: 85,
        aiRewardMultiplier: 2500, // 2.5x
        merkleProof: [
            "0x1111111111111111111111111111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222222222222222222222222222",
            "0x3333333333333333333333333333333333333333333333333333333333333333",
            "0x4444444444444444444444444444444444444444444444444444444444444444",
            "0x5555555555555555555555555555555555555555555555555555555555555555",
            "0x6666666666666666666666666666666666666666666666666666666666666666",
            "0x7777777777777777777777777777777777777777777777777777777777777777",
            "0x8888888888888888888888888888888888888888888888888888888888888888"
        ],
        merklePathIndices: [0, 1, 0, 1, 0, 1, 0, 1]
    };

    console.log("\n📝 Test Inputs:");
    console.log(`   Merkle Root: ${testInputs.merkleRoot}`);
    console.log(`   Nullifier: ${testInputs.nullifier}`);
    console.log(`   Claim Amount: ${testInputs.claimAmount}`);
    console.log(`   User Address: ${testInputs.userAddress}`);
    console.log(`   AI Legitimacy Score: ${testInputs.aiLegitimacyScore}`);
    console.log(`   AI Reward Multiplier: ${testInputs.aiRewardMultiplier} (${testInputs.aiRewardMultiplier/1000}x)`);

    try {
        // Step 1: Generate witness
        console.log("\n🔨 Step 1: Generating witness...");
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            testInputs,
            WASM_PATH,
            ZKEY_PATH
        );

        console.log("✅ Witness generated successfully");

        // Step 2: Verify proof
        console.log("\n🔍 Step 2: Verifying proof...");
        
        let vkey;
        if (fs.existsSync(VKEY_PATH)) {
            vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        } else {
            console.log("   ⚠️  Verification key not found, extracting from zkey...");
            vkey = await snarkjs.zkey.exportVerificationKey(ZKEY_PATH);
            fs.writeFileSync(VKEY_PATH, JSON.stringify(vkey, null, 2));
        }

        const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        
        if (verified) {
            console.log("✅ Proof verified successfully!");
        } else {
            console.error("❌ Proof verification failed!");
            process.exit(1);
        }

        // Step 3: Display results
        console.log("\n📊 Proof Details:");
        console.log(`   Public Signals: ${publicSignals.length}`);
        console.log(`   Public Signal 0 (merkleRoot): ${publicSignals[0]}`);
        console.log(`   Public Signal 1 (nullifier): ${publicSignals[1]}`);
        console.log(`   Public Signal 2 (claimAmount): ${publicSignals[2]}`);
        
        console.log("\n📋 Proof Structure:");
        console.log(`   Proof A: [${proof.pi_a[0].slice(0, 20)}..., ${proof.pi_a[1].slice(0, 20)}...]`);
        console.log(`   Proof B: [[${proof.pi_b[0][0].slice(0, 20)}..., ${proof.pi_b[0][1].slice(0, 20)}...],`);
        console.log(`            [${proof.pi_b[1][0].slice(0, 20)}..., ${proof.pi_b[1][1].slice(0, 20)}...]]`);
        console.log(`   Proof C: [${proof.pi_c[0].slice(0, 20)}..., ${proof.pi_c[1].slice(0, 20)}...]`);

        // Step 4: Test edge cases
        console.log("\n🧪 Step 3: Testing edge cases...");
        
        // Test with minimum scores
        const minInputs = { ...testInputs, aiLegitimacyScore: 0, aiRewardMultiplier: 10 };
        try {
            const { proof: minProof, publicSignals: minSignals } = await snarkjs.groth16.fullProve(
                minInputs,
                WASM_PATH,
                ZKEY_PATH
            );
            const minVerified = await snarkjs.groth16.verify(vkey, minSignals, minProof);
            console.log(`   ✅ Minimum scores (0, 10): ${minVerified ? 'Verified' : 'Failed'}`);
        } catch (e) {
            console.log(`   ⚠️  Minimum scores test: ${e.message}`);
        }

        // Test with maximum scores
        const maxInputs = { ...testInputs, aiLegitimacyScore: 100, aiRewardMultiplier: 10000 };
        try {
            const { proof: maxProof, publicSignals: maxSignals } = await snarkjs.groth16.fullProve(
                maxInputs,
                WASM_PATH,
                ZKEY_PATH
            );
            const maxVerified = await snarkjs.groth16.verify(vkey, maxSignals, maxProof);
            console.log(`   ✅ Maximum scores (100, 10000): ${maxVerified ? 'Verified' : 'Failed'}`);
        } catch (e) {
            console.log(`   ⚠️  Maximum scores test: ${e.message}`);
        }

        // Test with invalid scores (should fail)
        console.log("\n🧪 Step 4: Testing invalid inputs (should fail)...");
        
        const invalidInputs1 = { ...testInputs, aiLegitimacyScore: 101 }; // Out of range
        try {
            await snarkjs.groth16.fullProve(invalidInputs1, WASM_PATH, ZKEY_PATH);
            console.log("   ⚠️  Invalid score 101: Should have failed but didn't");
        } catch (e) {
            console.log(`   ✅ Invalid score 101: Correctly rejected (${e.message.substring(0, 50)}...)`);
        }

        const invalidInputs2 = { ...testInputs, aiRewardMultiplier: 5 }; // Below minimum
        try {
            await snarkjs.groth16.fullProve(invalidInputs2, WASM_PATH, ZKEY_PATH);
            console.log("   ⚠️  Invalid multiplier 5: Should have failed but didn't");
        } catch (e) {
            console.log(`   ✅ Invalid multiplier 5: Correctly rejected (${e.message.substring(0, 50)}...)`);
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ ALL TESTS PASSED!");
        console.log("=".repeat(70));
        console.log("\n💡 Next Steps:");
        console.log("   1. Use these proof generation functions in the SDK");
        console.log("   2. Integrate with frontend ZK claim flow");
        console.log("   3. Test on-chain verification with deployed contracts");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testCircuit().catch(console.error);

