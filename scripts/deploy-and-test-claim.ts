import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEPLOY UPDATED DISTRIBUTOR AND TEST FULL CLAIM FLOW");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const VERIFIER = "0x9BbA803d9D8cd03742486AC382d1Be1ABD9f9a63";
    
    // Step 1: Deploy updated ZKMerkleDistributor
    console.log("\n📝 Step 1: Deploying updated ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const dist = await ZKMerkleDistributor.deploy(TOKEN, VERIFIER, deployer.address);
    await dist.waitForDeployment();
    const distAddress = await dist.getAddress();
    console.log(`   ✅ Deployed to: ${distAddress}`);
    
    // Step 2: Setup roles and fund
    console.log("\n📝 Step 2: Setting up...");
    const PROVIDER_ROLE = await dist.PROVIDER_ROLE();
    await (await dist.grantRole(PROVIDER_ROLE, deployer.address)).wait();
    console.log("   ✅ PROVIDER_ROLE granted");
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)"
    ];
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    
    const fundAmount = ethers.parseEther("10");
    await (await token.approve(distAddress, fundAmount)).wait();
    await (await dist.depositBalance(fundAmount)).wait();
    console.log(`   ✅ Funded with ${ethers.formatEther(fundAmount)} MYNT`);
    
    // Step 3: Create claim data
    console.log("\n📝 Step 3: Creating claim data...");
    const testUser = deployer.address; // Use deployer as test user for easy testing
    const claimAmount = ethers.parseEther("1");
    const chainId = (await ethers.provider.getNetwork()).chainId;
    
    console.log(`   Test user: ${testUser}`);
    console.log(`   Claim amount: ${ethers.formatEther(claimAmount)} MYNT`);
    console.log(`   Chain ID: ${chainId}`);
    
    // Build keccak256 merkle tree for claims
    // Leaf = keccak256(abi.encode(user, amount, chainId))
    const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256"],
        [testUser, claimAmount, chainId]
    );
    console.log(`   Leaf: ${leaf}`);
    
    // For single user, root = leaf (or hash(leaf, leaf))
    const claimMerkleRoot = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32"],
        [leaf, leaf]
    );
    console.log(`   Claim Merkle Root (keccak256): ${claimMerkleRoot}`);
    
    // Step 4: Generate ZK proof via backend
    console.log("\n📝 Step 4: Generating ZK proof...");
    
    const proofResponse = await fetch("http://localhost:8000/api/zk/generate-provider-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            users: [testUser],
            scores: [85],
            multipliers: [1500],
            amounts: [claimAmount.toString()],
            base_reward_amount: claimAmount.toString()
        })
    });
    
    const proofData = await proofResponse.json();
    
    if (proofData.detail) {
        console.log(`   ❌ Proof generation failed: ${proofData.detail}`);
        return;
    }
    
    console.log(`   ✅ Proof generated`);
    console.log(`   ZK Merkle Root (Poseidon): ${proofData.public_signals[0]}`);
    
    // Format proof
    const proofA: [bigint, bigint] = [
        BigInt(proofData.proof.a[0]),
        BigInt(proofData.proof.a[1])
    ];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const proofC: [bigint, bigint] = [
        BigInt(proofData.proof.c[0]),
        BigInt(proofData.proof.c[1])
    ];
    const publicInputs: [bigint, bigint, bigint] = [
        BigInt(proofData.public_signals[0]),
        BigInt(proofData.public_signals[1]),
        BigInt(proofData.public_signals[2])
    ];
    
    // Step 5: Submit merkle root with ZK proof
    console.log("\n📝 Step 5: Submitting merkle root with ZK proof...");
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    
    const submitTx = await dist.submitMerkleRoot(
        claimMerkleRoot,  // keccak256 root for claims
        expiry,
        claimAmount,
        proofA,
        proofB,
        proofC,
        publicInputs
    );
    await submitTx.wait();
    console.log(`   ✅ Merkle root submitted!`);
    
    // Check state
    const providerBalance = await dist.providerBalance(deployer.address);
    const lockedBalance = await dist.lockedBalance(deployer.address);
    console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`   Locked balance: ${ethers.formatEther(lockedBalance)} MYNT`);
    
    // Step 6: Test claim
    console.log("\n📝 Step 6: Testing claim...");
    
    // For single-user tree, merkle proof is [leaf] (sibling is itself)
    const merkleProof = [leaf];
    
    const userBalanceBefore = await token.balanceOf(testUser);
    console.log(`   User balance before: ${ethers.formatEther(userBalanceBefore)} MYNT`);
    
    try {
        const claimTx = await dist.claim(
            deployer.address,  // provider
            0,                 // rootIndex
            claimAmount,
            merkleProof
        );
        await claimTx.wait();
        
        const userBalanceAfter = await token.balanceOf(testUser);
        console.log(`   ✅ Claim successful!`);
        console.log(`   User balance after: ${ethers.formatEther(userBalanceAfter)} MYNT`);
        console.log(`   Claimed: ${ethers.formatEther(userBalanceAfter - userBalanceBefore)} MYNT`);
        
    } catch (e: any) {
        console.log(`   ❌ Claim failed: ${e.message}`);
        
        // Debug: check claim parameters
        console.log("\n   Debug info:");
        console.log(`   Expected leaf: keccak256(${testUser}, ${claimAmount}, ${chainId})`);
        console.log(`   Computed leaf: ${leaf}`);
        console.log(`   Root: ${claimMerkleRoot}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`\nDistributor: ${distAddress}`);
    console.log(`Token: ${TOKEN}`);
    console.log(`Verifier: ${VERIFIER}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
