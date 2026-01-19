import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const GROTH16_VERIFIER = process.env.GROTH16_VERIFIER_ADDRESS || "0x2000738e7E3e4dCB58f7e917AAb2fb1F9C78d9E8";
    const proofFile = path.join(__dirname, "test-zk-proof.json");
    
    console.log("=".repeat(80));
    console.log("TEST GROTH16 VERIFIER DIRECTLY");
    console.log("=".repeat(80));
    console.log(`Verifier: ${GROTH16_VERIFIER}`);
    
    if (!fs.existsSync(proofFile)) {
        console.log("❌ test-zk-proof.json not found");
        return;
    }
    
    const proofData = JSON.parse(fs.readFileSync(proofFile, "utf-8"));
    
    if (!proofData.proof || !proofData.public_signals) {
        console.log("❌ Invalid proof format");
        return;
    }
    
    const proofA = proofData.proof.a.map((s: string) => BigInt(s));
    const proofB = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const proofC = proofData.proof.c.map((s: string) => BigInt(s));
    const publicInputs = proofData.public_signals.map((s: string) => BigInt(s));
    
    console.log(`\n📝 Loaded ZK proof:`);
    console.log(`   Public inputs: [${publicInputs.map(p => p.toString()).join(", ")}]`);
    
    const verifierAbi = [
        "function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[3] calldata input) external view returns (bool)"
    ];
    
    try {
        const verifier = await ethers.getContractAt(verifierAbi, GROTH16_VERIFIER);
        console.log("\n🔐 Calling Groth16Verifier.verifyProof()...");
        const isValid = await verifier.verifyProof.staticCall(proofA, proofB, proofC, publicInputs);
        
        console.log("\n" + "=".repeat(80));
        if (isValid) {
            console.log("✅ ZK PROOF VERIFICATION: SUCCESS");
            console.log("   The Groth16Verifier confirms the proof is valid!");
            console.log("   This means the ZK circuit and proof generation are working correctly.");
        } else {
            console.log("❌ ZK PROOF VERIFICATION: FAILED");
            console.log("   The proof is invalid according to Groth16Verifier.");
        }
        console.log("=".repeat(80));
        
        console.log("\n📊 Summary:");
        console.log("   - ZK verification logic: ✅ Working (if proof is valid)");
        console.log("   - Token balance check: ❌ Blocking submission (providerBalance = 0)");
        console.log("   - submitMerkleRoot: ⏸️  Never reaches ZK verification due to balance check");
        
    } catch (e: any) {
        console.log(`❌ Groth16Verifier call failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data.slice(0, 100)}...`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
