import { ethers } from "hardhat";

/**
 * Check the execution order in submitMerkleRoot to see if token is blocking ZK verification
 */
async function main() {
    console.log("=".repeat(80));
    console.log("CHECKING SUBMITMERKLEROOT EXECUTION ORDER");
    console.log("=".repeat(80));
    
    console.log("\nLooking at submitMerkleRoot function (lines 214-227):");
    console.log("\n1. require(providerBalance[msg.sender] >= totalClaimableAmount, \"Insufficient balance for claims\");");
    console.log("   ⚠️  THIS CHECK HAPPENS FIRST - TOKEN BALANCE CHECK");
    console.log("\n2. require(expiry > block.timestamp + MIN_EXPIRY_DURATION, \"expiry too soon\");");
    console.log("   ✅ Expiry check");
    console.log("\n3. require(totalClaimableAmount > 0, \"zero claimable\");");
    console.log("   ✅ Amount check");
    console.log("\n4. require(bytes32(publicInputs[0]) == root, \"Root mismatch\");");
    console.log("   ✅ Public input validation");
    console.log("\n5. require(publicInputs[1] == totalClaimableAmount, \"Amount mismatch\");");
    console.log("   ✅ Public input validation");
    console.log("\n6. bool proofValid = batchVerifier.verifyProof(proofA, proofB, proofC, publicInputs);");
    console.log("   🔐 THIS IS THE ZK VERIFICATION - CALLS GROTH16 VERIFIER");
    console.log("\n7. require(proofValid, \"Invalid batch ZK proof\");");
    console.log("   ✅ ZK proof validation");
    
    console.log("\n" + "=".repeat(80));
    console.log("ANSWER:");
    console.log("=".repeat(80));
    console.log("❌ YES, the token balance check is BLOCKING ZK verification!");
    console.log("\nThe function checks providerBalance FIRST (line 214), before it ever");
    console.log("reaches the ZK verifier call (line 226).");
    console.log("\nSo if providerBalance is 0, the function reverts at step 1 and");
    console.log("never gets to call batchVerifier.verifyProof().");
    console.log("\nHowever, we CAN test the Groth16Verifier directly to verify that");
    console.log("the ZK proof itself is valid, independent of the token balance issue.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
