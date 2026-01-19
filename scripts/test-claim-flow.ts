import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("TEST FULL CLAIM FLOW");
    console.log("=".repeat(80));
    
    const DIST = "0xEca88bcf4AE77e940b520565D918026464a94D8a";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const distAbi = [
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function grantRole(bytes32 role, address account)",
        "function depositBalance(uint256) external",
        "function providerBalance(address) view returns (uint256)",
        "function lockedBalance(address) view returns (uint256)",
        "function submitMerkleRoot(bytes32 claimMerkleRoot, uint256 expiry, uint256 totalClaimableAmount, uint256[2] calldata proofA, uint256[2][2] calldata proofB, uint256[2] calldata proofC, uint256[3] calldata publicInputs) external",
        "function claim(address provider, uint256 rootIndex, uint256 amount, bytes32[] calldata merkleProof) external"
    ];
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, DIST);
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    
    // Setup
    console.log("\n📝 Setting up...");
    const PROVIDER_ROLE = await dist.PROVIDER_ROLE();
    const hasRole = await dist.hasRole(PROVIDER_ROLE, deployer.address);
    
    if (!hasRole) {
        await (await dist.grantRole(PROVIDER_ROLE, deployer.address)).wait();
        console.log("   ✅ PROVIDER_ROLE granted");
    } else {
        console.log("   Already has PROVIDER_ROLE");
    }
    
    // Fund if needed
    let providerBalance = await dist.providerBalance(deployer.address);
    if (providerBalance === 0n) {
        const fundAmount = ethers.parseEther("10");
        await (await token.approve(DIST, fundAmount)).wait();
        await (await dist.depositBalance(fundAmount)).wait();
        providerBalance = await dist.providerBalance(deployer.address);
        console.log(`   ✅ Funded: ${ethers.formatEther(providerBalance)} MYNT`);
    } else {
        console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    }
    
    // Create claim data
    console.log("\n📝 Creating claim data...");
    const testUser = deployer.address;
    const claimAmount = ethers.parseEther("1");
    const chainId = (await ethers.provider.getNetwork()).chainId;
    
    // Build keccak256 merkle tree
    // Leaf = keccak256(abi.encode(user, amount, chainId))
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const leafData = abiCoder.encode(
        ["address", "uint256", "uint256"],
        [testUser, claimAmount, chainId]
    );
    const leaf = ethers.keccak256(leafData);
    
    console.log(`   Test user: ${testUser}`);
    console.log(`   Amount: ${ethers.formatEther(claimAmount)} MYNT`);
    console.log(`   Chain ID: ${chainId}`);
    console.log(`   Leaf: ${leaf}`);
    
    // For single-leaf tree: root = leaf
    const claimMerkleRoot = leaf;
    console.log(`   Claim Root: ${claimMerkleRoot}`);
    
    // Generate ZK proof
    console.log("\n📝 Generating ZK proof...");
    
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
        console.log(`   ❌ ${proofData.detail}`);
        return;
    }
    console.log("   ✅ Proof generated");
    
    // Submit merkle root
    console.log("\n📝 Submitting merkle root...");
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    
    const proofA: [bigint, bigint] = [BigInt(proofData.proof.a[0]), BigInt(proofData.proof.a[1])];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const proofC: [bigint, bigint] = [BigInt(proofData.proof.c[0]), BigInt(proofData.proof.c[1])];
    const publicInputs: [bigint, bigint, bigint] = [
        BigInt(proofData.public_signals[0]),
        BigInt(proofData.public_signals[1]),
        BigInt(proofData.public_signals[2])
    ];
    
    const submitTx = await dist.submitMerkleRoot(
        claimMerkleRoot,
        expiry,
        claimAmount,
        proofA,
        proofB,
        proofC,
        publicInputs
    );
    await submitTx.wait();
    console.log("   ✅ Submitted!");
    
    console.log(`   Provider balance: ${ethers.formatEther(await dist.providerBalance(deployer.address))} MYNT`);
    console.log(`   Locked balance: ${ethers.formatEther(await dist.lockedBalance(deployer.address))} MYNT`);
    
    // Claim
    console.log("\n📝 Claiming...");
    const balanceBefore = await token.balanceOf(testUser);
    
    // For single-leaf tree, proof is empty
    const merkleProof: string[] = [];
    
    try {
        const claimTx = await dist.claim(deployer.address, 0, claimAmount, merkleProof);
        await claimTx.wait();
        
        const balanceAfter = await token.balanceOf(testUser);
        console.log(`   ✅ CLAIM SUCCESSFUL!`);
        console.log(`   Balance before: ${ethers.formatEther(balanceBefore)} MYNT`);
        console.log(`   Balance after: ${ethers.formatEther(balanceAfter)} MYNT`);
        console.log(`   Received: ${ethers.formatEther(balanceAfter - balanceBefore)} MYNT`);
        
    } catch (e: any) {
        console.log(`   ❌ Claim failed: ${e.message}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ FULL ZK CLAIM FLOW COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nDistributor: ${DIST}`);
}

main()
    .then(() => process.exit(0))
    .catch(console.error);
