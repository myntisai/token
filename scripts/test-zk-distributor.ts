import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Test ZKMerkleDistributor Flow
 * 
 * This script:
 * 1. Funds the ZKMerkleDistributor with MYNT tokens
 * 2. Generates a test batch with ZK proof
 * 3. Submits Merkle root to the distributor
 * 4. Provides claim details for testing
 */
async function main() {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const testUser = signers[1] || signers[0]; // Use deployer if only one signer
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("TEST ZK MERKLE DISTRIBUTOR");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Test User: ${testUser.address}`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    console.log(`Available signers: ${signers.length}`);
    
    // Configuration - Use NEW ZK distributor (not the old prod one)
    // Old prod: 0xF8adFB263Fd6682055941e6c16750d8D34BDeec0 (Dec 28, 2025) - DO NOT USE
    // New test: 0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D (Jan 7, 2026)
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const PROVIDER_ADDRESS = deployer.address;
    
    console.log(`\nToken: ${TOKEN_ADDRESS}`);
    console.log(`ZK Distributor: ${ZK_DISTRIBUTOR}`);
    console.log(`Provider: ${PROVIDER_ADDRESS}`);
    
    // Get contracts
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function mint(address to, uint256 amount) external"
    ];
    
    const distributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256 amount) external",
        "function grantRole(bytes32 role, address account) external",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function submitMerkleRoot(bytes32 root, uint256 expiry, uint256 totalClaimableAmount, uint256[2] calldata proofA, uint256[2][2] calldata proofB, uint256[2] calldata proofC, uint256[3] calldata publicInputs) external",
        "function providerMerkleRoots(address, uint256) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount, bool providerProofVerified, bytes32 batchHash)",
        "function getEpochInfo(address provider, uint256 rootIndex) view returns (bytes32, uint256, bool, uint256, uint256, bool, bytes32)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    // Step 1: Grant PROVIDER_ROLE if needed
    console.log("\n📝 Step 1: Checking PROVIDER_ROLE...");
    const providerRole = await distributor.PROVIDER_ROLE();
    const hasRole = await distributor.hasRole(providerRole, PROVIDER_ADDRESS);
    
    if (!hasRole) {
        console.log("Granting PROVIDER_ROLE...");
        const grantTx = await distributor.grantRole(providerRole, PROVIDER_ADDRESS);
        await grantTx.wait();
        console.log("✅ PROVIDER_ROLE granted");
    } else {
        console.log("✅ PROVIDER_ROLE already granted");
    }
    
    // Step 2: Fund distributor with MYNT tokens
    console.log("\n📝 Step 2: Funding distributor...");
    const fundingAmount = ethers.parseEther("200"); // 200 MYNT (enough for test batch)
    
    // Check if deployer has tokens
    const deployerBalance = await token.balanceOf(deployer.address);
    console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} MYNT`);
    
    if (deployerBalance < fundingAmount) {
        // Try to mint if possible
        try {
            console.log("Minting tokens...");
            const mintTx = await token.mint(deployer.address, fundingAmount);
            await mintTx.wait();
            console.log("✅ Tokens minted");
        } catch (e) {
            console.error("❌ Cannot mint tokens. Please fund deployer address manually.");
            console.error(`   Deployer needs: ${ethers.formatEther(fundingAmount)} MYNT`);
            process.exit(1);
        }
    }
    
    // Fund distributor using direct transfer (workaround for OFT transferFrom issue)
    console.log("Funding distributor using direct transfer (workaround for OFT issue)...");
    try {
        // Check if deployer has ADMIN_ROLE to update balance
        const distributorAbiFull = [
            ...distributorAbi,
            "function addProviderBalance(address provider, uint256 amount) external",
            "function ADMIN_ROLE() view returns (bytes32)"
        ];
        const distributorFull = await ethers.getContractAt(distributorAbiFull, ZK_DISTRIBUTOR);
        
        const adminRole = await distributorFull.ADMIN_ROLE();
        const hasAdminRole = await distributorFull.hasRole(adminRole, deployer.address);
        
        if (hasAdminRole) {
            // Workaround: Use direct transfer (which works) then update balance
            // First, transfer tokens directly to distributor
            console.log("Transferring tokens directly to distributor...");
            const transferTx = await token.transfer(ZK_DISTRIBUTOR, fundingAmount);
            await transferTx.wait();
            console.log("✅ Tokens transferred to distributor");
            
            // Wait for state sync
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Now update provider balance (this will try transferFrom but tokens are already there)
            // Actually, addProviderBalance will fail because it uses transferFrom
            // So we need to manually update the balance or use a different approach
            
            // Alternative: Use the staking contract's funding mechanism if available
            const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
            console.log(`Checking if we can use staking contract funding: ${STAKING_CONTRACT}`);
            
            // For now, we'll need to manually call a function to update the balance
            // Since addProviderBalance uses transferFrom which fails, we'll skip this
            // and note that tokens are in the distributor but balance isn't updated
            console.log("⚠️  Tokens transferred but provider balance not updated automatically.");
            console.log("   This is a workaround - tokens are in distributor but accounting needs manual update.");
            console.log("   For testing, we'll proceed with the tokens already in the distributor.");
        } else {
            // Try simple transfer anyway
            console.log("Deployer doesn't have ADMIN_ROLE, trying simple transfer...");
            const transferTx = await token.transfer(ZK_DISTRIBUTOR, fundingAmount);
            await transferTx.wait();
            console.log("✅ Tokens transferred to distributor");
            console.log("⚠️  Provider balance not updated - tokens are in contract but not allocated to provider.");
        }
    } catch (error: any) {
        console.log("⚠️  Funding failed:");
        console.log(`   ${error.message}`);
        console.log("   Continuing with test - will check existing balance...");
    }
    
    const providerBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    const distributorTokenBalance = await token.balanceOf(ZK_DISTRIBUTOR);
    console.log(`Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`Distributor token balance: ${ethers.formatEther(distributorTokenBalance)} MYNT`);
    
    // If funding failed, check if tokens are in distributor anyway
    if (providerBalance === 0n) {
        console.log("\n⚠️  WARNING: Provider balance is 0.");
        if (distributorTokenBalance > 0n) {
            console.log(`   However, distributor has ${ethers.formatEther(distributorTokenBalance)} MYNT in tokens.`);
            console.log("   This is a known issue with OFT token's transferFrom.");
            console.log("   For testing, we'll proceed but submission will fail due to insufficient provider balance.");
            console.log("   The tokens are there but not allocated to the provider.");
        } else {
            console.log("   Funding failed - continuing with test anyway.");
        }
    }
    
    // Step 3: Generate test batch data
    console.log("\n📝 Step 3: Generating test batch...");
    const testUsers = [
        testUser.address, // Test user
        "0x1111111111111111111111111111111111111111", // Dummy user 1
        "0x2222222222222222222222222222222222222222"  // Dummy user 2
    ];
    
    const testAmounts = [
        ethers.parseEther("100"),  // 100 MYNT for test user
        ethers.parseEther("50"),   // 50 MYNT for dummy 1
        ethers.parseEther("25")    // 25 MYNT for dummy 2
    ];
    
    const totalAmount = testAmounts.reduce((sum, amt) => sum + amt, 0n);
    
    // Test scores and multipliers (0-100 range for scores, 10-10000 for multipliers)
    const testScores = [75, 80, 70]; // 0-100 range
    const testMultipliers = [1000, 1200, 800]; // 1.0x, 1.2x, 0.8x (scaled to 10-10000)
    
    console.log(`Test batch: ${testUsers.length} users, ${ethers.formatEther(totalAmount)} MYNT total`);
    
    // Step 4: Build Merkle tree
    console.log("\n📝 Step 4: Building Merkle tree...");
    const { MerkleTree } = require("merkletreejs");
    
    const leaves = testUsers.map((user, i) => 
        ethers.solidityPackedKeccak256(
            ["address", "uint256"],
            [user, testAmounts[i]]
        )
    );
    
    // Use ethers keccak256 for hashing
    const hashFn = (data: string) => {
        return Buffer.from(ethers.getBytes(ethers.keccak256(data)));
    };
    
    const merkleTree = new MerkleTree(leaves.map(l => hashFn(l)), hashFn, { sortPairs: true });
    const merkleRoot = merkleTree.getHexRoot();
    
    // Get proof for test user
    const testUserLeaf = hashFn(leaves[0]);
    const merkleProof = merkleTree.getHexProof(testUserLeaf).map((p: Buffer) => ethers.hexlify(p));
    
    console.log(`Merkle root: ${merkleRoot}`);
    console.log(`Merkle proof for ${testUser.address}: ${merkleProof.length} elements`);
    
    // Step 5: Load or generate ZK proof
    console.log("\n📝 Step 5: Loading ZK proof...");
    
    let proofA: bigint[];
    let proofB: bigint[][];
    let proofC: bigint[];
    let publicInputs: bigint[];
    let usingRealProof = false;
    
    // Try to load real proof from file
    const proofFile = process.env.ZK_PROOF_FILE || path.join(__dirname, "../test-zk-proof.json");
    if (fs.existsSync(proofFile)) {
        console.log(`Loading proof from: ${proofFile}`);
        try {
            const proofData = JSON.parse(fs.readFileSync(proofFile, "utf-8"));
            
            if (proofData.proof && proofData.public_signals) {
                proofA = proofData.proof.a.map((s: string) => BigInt(s));
                proofB = [
                    [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
                    [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
                ];
                proofC = proofData.proof.c.map((s: string) => BigInt(s));
                publicInputs = proofData.public_signals.map((s: string) => BigInt(s));
                
                // Verify merkle root matches
                if (publicInputs[0] !== BigInt(merkleRoot)) {
                    console.warn("⚠️  WARNING: Merkle root in proof doesn't match generated root!");
                    console.warn(`   Proof root: ${publicInputs[0]}`);
                    console.warn(`   Generated: ${BigInt(merkleRoot)}`);
                    console.warn("   Using proof anyway - make sure data matches!");
                }
                
                usingRealProof = true;
                console.log("✅ Loaded real ZK proof from file");
            } else {
                throw new Error("Invalid proof format");
            }
        } catch (e: any) {
            console.warn(`⚠️  Failed to load proof from file: ${e.message}`);
            console.warn("   Falling back to mock proof");
        }
    }
    
    // Fallback to mock proof if real proof not loaded
    if (!usingRealProof) {
        console.log("⚠️  Using mock ZK proof (will fail verification)");
        console.log("   To use real proof:");
        console.log("   1. Generate proof: ./test-zk-flow.sh");
        console.log("   2. Set ZK_PROOF_FILE=test-zk-proof.json");
        console.log("   3. Re-run this script");
        
        proofA = [ethers.parseEther("1"), ethers.parseEther("2")];
        proofB = [
            [ethers.parseEther("3"), ethers.parseEther("4")],
            [ethers.parseEther("5"), ethers.parseEther("6")]
        ];
        proofC = [ethers.parseEther("7"), ethers.parseEther("8")];
        publicInputs = [
            BigInt(merkleRoot),
            totalAmount,
            ethers.parseEther("0")
        ];
    }
    
    // Step 6: Submit Merkle root
    console.log("\n📝 Step 6: Submitting Merkle root...");
    if (!usingRealProof) {
        console.log("⚠️  WARNING: Using mock proof - verification will fail!");
    }
    
    try {
        const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
        
        const submitTx = await distributor.submitMerkleRoot(
            merkleRoot,
            expiry,
            totalAmount,
            proofA,
            proofB,
            proofC,
            publicInputs
        );
        
        console.log(`Transaction hash: ${submitTx.hash}`);
        const receipt = await submitTx.wait();
        console.log(`✅ Merkle root submitted in block ${receipt.blockNumber}`);
        
        // Get root index
        // Note: This assumes it's the first root for this provider
        const rootIndex = 0;
        
        // Step 7: Get epoch info
        const epochInfo = await distributor.getEpochInfo(PROVIDER_ADDRESS, rootIndex);
        console.log(`\n✅ Epoch info:`);
        console.log(`   Root: ${epochInfo[0]}`);
        console.log(`   Expiry: ${new Date(Number(epochInfo[1]) * 1000).toISOString()}`);
        console.log(`   Closed: ${epochInfo[2]}`);
        console.log(`   Total claimable: ${ethers.formatEther(epochInfo[3])} MYNT`);
        console.log(`   Claimed: ${ethers.formatEther(epochInfo[4])} MYNT`);
        console.log(`   ZK verified: ${epochInfo[5]}`);
        
        // Step 8: Output claim details
        console.log("\n" + "=".repeat(80));
        console.log("CLAIM DETAILS FOR TEST USER");
        console.log("=".repeat(80));
        console.log(`Provider: ${PROVIDER_ADDRESS}`);
        console.log(`Root Index: ${rootIndex}`);
        console.log(`Amount: ${ethers.formatEther(testAmounts[0])} MYNT (${testAmounts[0].toString()} wei)`);
        console.log(`Merkle Proof:`);
        merkleProof.forEach((proof, i) => {
            console.log(`  [${i}]: ${proof}`);
        });
        console.log(`\nTo claim, call:`);
        console.log(`distributor.claim(`);
        console.log(`  "${PROVIDER_ADDRESS}",`);
        console.log(`  ${rootIndex},`);
        console.log(`  ${testAmounts[0].toString()},`);
        console.log(`  [${merkleProof.map(p => `"${p}"`).join(", ")}]`);
        console.log(`)`);
        
        // Save to file
        const claimData = {
            provider: PROVIDER_ADDRESS,
            rootIndex: rootIndex,
            user: testUser.address,
            amount: testAmounts[0].toString(),
            amountFormatted: ethers.formatEther(testAmounts[0]),
            merkleProof: merkleProof,
            merkleRoot: merkleRoot,
            expiry: expiry,
            expiryDate: new Date(expiry * 1000).toISOString(),
            distributor: ZK_DISTRIBUTOR,
            token: TOKEN_ADDRESS,
            network: network.name,
            chainId: network.chainId.toString()
        };
        
        const outputFile = path.join(__dirname, "../test-claim-data.json");
        fs.writeFileSync(outputFile, JSON.stringify(claimData, null, 2));
        console.log(`\n✅ Claim data saved to: ${outputFile}`);
        
    } catch (error: any) {
        console.error("\n❌ Submission failed:");
        console.error(error.message);
        if (!usingRealProof) {
            console.log("\n📝 To get real proof:");
            console.log("   1. Run: ./test-zk-flow.sh");
            console.log("   2. Set: export ZK_PROOF_FILE=test-zk-proof.json");
            console.log("   3. Re-run this script");
        } else {
            console.log("\n📝 Troubleshooting:");
            console.log("   - Verify proof matches the Merkle root");
            console.log("   - Check public inputs are correct");
            console.log("   - Ensure circuit was compiled correctly");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
