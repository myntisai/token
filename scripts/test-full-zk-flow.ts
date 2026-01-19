import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("FULL ZK MERKLE DISTRIBUTOR TEST");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const distAbi = [
        "function token() view returns (address)",
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256) external",
        "function submitMerkleRoot(bytes32 root, uint256 totalAmount, uint256[] calldata proof, uint256[] calldata publicSignals) external"
    ];
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    
    // Step 1: Fund the distributor
    console.log("\n📝 Step 1: Funding distributor...");
    const deployerBalance = await token.balanceOf(deployer.address);
    console.log(`   Token balance: ${ethers.formatEther(deployerBalance)} MYNT`);
    
    let providerBalance = await dist.providerBalance(deployer.address);
    console.log(`   Current provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    if (providerBalance === 0n && deployerBalance > 0n) {
        const fundAmount = deployerBalance - ethers.parseEther("1"); // Leave 1 MYNT for gas
        console.log(`   Funding with ${ethers.formatEther(fundAmount)} MYNT...`);
        
        await (await token.approve(ZK_DIST, fundAmount)).wait();
        await (await dist.depositBalance(fundAmount)).wait();
        
        providerBalance = await dist.providerBalance(deployer.address);
        console.log(`   ✅ Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    }
    
    // Step 2: Create test claim data
    console.log("\n📝 Step 2: Creating test claim data...");
    const testUser = "0x1234567890123456789012345678901234567890";
    const claimAmount = ethers.parseEther("1"); // 1 MYNT
    
    const claims = [
        { address: testUser, amount: claimAmount.toString() }
    ];
    
    console.log(`   Test user: ${testUser}`);
    console.log(`   Claim amount: ${ethers.formatEther(claimAmount)} MYNT`);
    
    // Step 3: Build Merkle tree (simple 2-leaf tree)
    console.log("\n📝 Step 3: Building Merkle tree...");
    
    // Leaf = keccak256(address, amount)
    const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [testUser, claimAmount]
    );
    console.log(`   Leaf: ${leaf}`);
    
    // For a single claim, root = hash(leaf, leaf) 
    const root = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32"],
        [leaf, leaf]
    );
    console.log(`   Root: ${root}`);
    
    // Step 4: Load or generate ZK proof
    console.log("\n📝 Step 4: Loading ZK proof...");
    
    // Check if we have a pre-generated proof
    const proofPath = path.join(__dirname, "../test-zk-proof.json");
    let proof: number[] = [];
    let publicSignals: number[] = [];
    
    if (fs.existsSync(proofPath)) {
        const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
        
        // Convert proof to flat array format for contract
        if (proofData.proof) {
            const p = proofData.proof;
            proof = [
                ...p.pi_a.slice(0, 2),
                ...p.pi_b[0].reverse(),
                ...p.pi_b[1].reverse(),
                ...p.pi_c.slice(0, 2)
            ];
        }
        
        if (proofData.public_signals) {
            publicSignals = proofData.public_signals.map((s: string) => BigInt(s));
        }
        
        console.log(`   Loaded proof from file`);
        console.log(`   Proof elements: ${proof.length}`);
        console.log(`   Public signals: ${publicSignals.length}`);
    } else {
        console.log("   ⚠️  No pre-generated proof found");
        console.log("   Creating dummy proof for testing contract interface...");
        
        // Dummy proof (will fail verification but tests contract call)
        proof = Array(8).fill(0);
        publicSignals = [
            BigInt(root),  // merkle root
            BigInt(claimAmount.toString()),  // total amount
            BigInt(deployer.address)  // provider
        ];
    }
    
    // Step 5: Submit Merkle root
    console.log("\n📝 Step 5: Submitting Merkle root...");
    console.log(`   Root: ${root}`);
    console.log(`   Total amount: ${ethers.formatEther(claimAmount)} MYNT`);
    
    try {
        // First do a static call to see the error
        await dist.submitMerkleRoot.staticCall(
            root,
            claimAmount,
            proof.map(p => BigInt(p)),
            publicSignals
        );
        console.log("   Static call passed, submitting...");
        
        const tx = await dist.submitMerkleRoot(
            root,
            claimAmount,
            proof.map(p => BigInt(p)),
            publicSignals
        );
        await tx.wait();
        console.log("   ✅ Merkle root submitted!");
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
        
        // Check if it's a balance issue
        if (e.message.includes("Insufficient balance")) {
            console.log("\n   Issue: Provider balance < total claim amount");
            console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
            console.log(`   Required: ${ethers.formatEther(claimAmount)} MYNT`);
        }
        
        // Check if it's a proof verification issue
        if (e.message.includes("Invalid proof") || e.message.includes("verification failed")) {
            console.log("\n   Issue: ZK proof verification failed");
            console.log("   Need to generate a valid proof via backend API");
        }
    }
    
    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`\nNew ZK Distributor: ${ZK_DIST}`);
    console.log(`Token: ${TOKEN}`);
    console.log(`Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log("\nTo claim, user needs:");
    console.log(`  - Merkle proof for leaf: ${leaf}`);
    console.log(`  - Amount: ${ethers.formatEther(claimAmount)} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
