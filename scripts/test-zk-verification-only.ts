import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Test ZK verification without token balance check
 * This will help us see if the ZK proof verification works
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const GROTH16_VERIFIER = process.env.GROTH16_VERIFIER_ADDRESS || "0x2000738e7E3e4dCB58f7e917AAb2fb1F9C78d9E8";
    
    console.log("=".repeat(80));
    console.log("TEST ZK VERIFICATION (WITHOUT TOKEN BALANCE CHECK)");
    console.log("=".repeat(80));
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    console.log(`Groth16 Verifier: ${GROTH16_VERIFIER}`);
    console.log(`Deployer: ${deployer.address}`);
    
    // Load proof from file
    const proofFile = path.join(__dirname, "../test-zk-proof.json");
    if (!fs.existsSync(proofFile)) {
        console.log("❌ test-zk-proof.json not found");
        console.log("   Run: node scripts/generate-real-zk-proof.js");
        return;
    }
    
    const proofData = JSON.parse(fs.readFileSync(proofFile, "utf-8"));
    
    if (!proofData.proof || !proofData.public_signals) {
        console.log("❌ Invalid proof format in test-zk-proof.json");
        return;
    }
    
    const proofA = proofData.proof.a.map((s: string) => BigInt(s));
    const proofB = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const proofC = proofData.proof.c.map((s: string) => BigInt(s));
    const publicInputs = proofData.public_signals.map((s: string) => BigInt(s));
    
    console.log(`\n📝 Loaded ZK proof from ${proofFile}`);
    console.log(`   Public inputs: ${publicInputs.length} values`);
    console.log(`   Proof A: [${proofA[0]}, ${proofA[1]}]`);
    console.log(`   Proof B: [[${proofB[0][0]}, ${proofB[0][1]}], [${proofB[1][0]}, ${proofB[1][1]}]]`);
    console.log(`   Proof C: [${proofC[0]}, ${proofC[1]}]`);
    
    // Test 1: Direct Groth16 verifier call
    console.log("\n📝 Test 1: Calling Groth16Verifier directly...");
    const verifierAbi = [
        "function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[3] calldata input) external view returns (bool)"
    ];
    
    try {
        const verifier = await ethers.getContractAt(verifierAbi, GROTH16_VERIFIER);
        const isValid = await verifier.verifyProof.staticCall(proofA, proofB, proofC, publicInputs);
        console.log(`✅ Groth16Verifier result: ${isValid}`);
        
        if (isValid) {
            console.log("   ✅ ZK proof is VALID!");
        } else {
            console.log("   ❌ ZK proof is INVALID");
        }
    } catch (e: any) {
        console.log(`❌ Groth16Verifier call failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data.slice(0, 50)}...`);
        }
    }
    
    // Test 2: Check submitMerkleRoot function order
    console.log("\n📝 Test 2: Checking submitMerkleRoot function order...");
    const distributorAbi = [
        "function submitMerkleRoot(bytes32 root, uint256 expiry, uint256 totalClaimableAmount, uint256[2] calldata proofA, uint256[2][2] calldata proofB, uint256[2] calldata proofC, uint256[3] calldata publicInputs) external",
        "function providerBalance(address) view returns (uint256)"
    ];
    
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    const providerBalance = await distributor.providerBalance(deployer.address);
    
    console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`   Total claimable in proof: ${ethers.formatEther(publicInputs[1])} MYNT`);
    
    console.log("\n   Function execution order in submitMerkleRoot:");
    console.log("   1. ✅ Check providerBalance >= totalClaimableAmount (THIS FAILS)");
    console.log("   2. ⏸️  Check expiry > block.timestamp + MIN_EXPIRY_DURATION");
    console.log("   3. ⏸️  Check totalClaimableAmount > 0");
    console.log("   4. ⏸️  Verify public inputs match");
    console.log("   5. ⏸️  Call batchVerifier.verifyProof() - ZK VERIFICATION");
    console.log("   6. ⏸️  Update balances and emit event");
    
    if (providerBalance < publicInputs[1]) {
        console.log("\n   ⚠️  Token balance check happens FIRST, so ZK verification never runs!");
        console.log("   The function reverts at step 1, before reaching the ZK verifier.");
    } else {
        console.log("\n   ✅ Token balance check passes, ZK verification would run next.");
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("CONCLUSION:");
    console.log("=".repeat(80));
    console.log("The token balance check happens BEFORE ZK verification.");
    console.log("So we can't test ZK verification through submitMerkleRoot without fixing the balance.");
    console.log("However, we CAN test the Groth16Verifier directly (Test 1 above).");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
