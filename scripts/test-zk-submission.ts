import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("TEST ZK PROOF SUBMISSION");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    
    const distAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function submitMerkleRoot(bytes32 root, uint256 totalAmount, uint256[] calldata proof, uint256[] calldata publicSignals) external",
        "function merkleRoots(bytes32) view returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    // Check provider balance
    const providerBalance = await dist.providerBalance(deployer.address);
    console.log(`\n📊 Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    // Create test data
    const testUser = "0x1234567890123456789012345678901234567890";
    const claimAmount = ethers.parseEther("1");
    
    // Build Merkle tree
    const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [testUser, claimAmount]
    );
    const root = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32"],
        [leaf, leaf]
    );
    
    console.log(`\n📝 Test data:`);
    console.log(`   Root: ${root}`);
    console.log(`   Total amount: ${ethers.formatEther(claimAmount)} MYNT`);
    console.log(`   Provider: ${deployer.address}`);
    
    // Dummy proof (8 elements for Groth16)
    const proof = Array(8).fill(0n);
    
    // Public signals need to match what the verifier expects
    // Typically: [merkleRoot, totalAmount, providerAddress, batchHash, ...]
    const publicSignals = [
        BigInt(root),
        claimAmount,
        BigInt(deployer.address)
    ];
    
    console.log(`\n📝 Submitting with dummy proof (testing balance check)...`);
    
    try {
        await dist.submitMerkleRoot.staticCall(root, claimAmount, proof, publicSignals);
        console.log("   Static call passed!");
        
        const tx = await dist.submitMerkleRoot(root, claimAmount, proof, publicSignals);
        await tx.wait();
        console.log("   ✅ Submitted!");
        
        const isValid = await dist.merkleRoots(root);
        console.log(`   Root valid: ${isValid}`);
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
        
        // Decode error if possible
        if (e.data) {
            console.log(`\n📝 Error analysis:`);
            const errorSig = e.data.slice(0, 10);
            console.log(`   Error selector: ${errorSig}`);
            
            // Common errors
            const errors: Record<string, string> = {
                "0x08c379a0": "Error(string)",
                "0x4e487b71": "Panic(uint256)",
                "0x": "Empty revert",
            };
            
            if (errorSig === "0x08c379a0") {
                // Decode string error
                try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                        ["string"],
                        "0x" + e.data.slice(10)
                    );
                    console.log(`   Error message: ${decoded[0]}`);
                } catch {}
            }
        }
        
        // Check balance vs amount
        if (providerBalance < claimAmount) {
            console.log(`\n   ⚠️  Provider balance (${ethers.formatEther(providerBalance)}) < claim amount (${ethers.formatEther(claimAmount)})`);
        } else {
            console.log(`\n   Balance check OK - error is likely ZK verification failure (expected with dummy proof)`);
        }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("NEXT STEPS");
    console.log("=".repeat(80));
    console.log("\n1. Generate a REAL ZK proof via backend API");
    console.log("2. Submit with valid proof");
    console.log(`\nDistributor: ${ZK_DIST}`);
    console.log(`Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
