import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy Complete ZK System
 * 
 * This script deploys all contracts needed for the ZK proof system:
 * 1. RewardClaimVerifier (wrapper + generated verifier)
 * 2. RewardWeightingRegistry
 * 3. ZKMerkleDistributor
 * 4. DualPoolStaking
 * 5. LiquidStakingVault
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-zk-system.ts --network <network>
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying ZK system with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    const network = await ethers.provider.getNetwork();
    console.log(`\n🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);

    // Get token address from environment or deployment
    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
    if (!tokenAddress) {
        throw new Error("MYNTIS_TOKEN_ADDRESS environment variable not set");
    }
    console.log(`\n📝 Using token address: ${tokenAddress}`);

    // Step 1: Deploy RewardClaimVerifier
    console.log("\n📝 Step 1: Deploying RewardClaimVerifier...");
    
    let generatedVerifierAddress: string | null = null;
    const generatedVerifierPath = path.join(__dirname, "../contracts/RewardClaimVerifier_generated.sol");
    
    if (fs.existsSync(generatedVerifierPath)) {
        console.log("   Found generated verifier contract, deploying...");
        const GeneratedVerifier = await ethers.getContractFactory("Verifier");
        const generatedVerifier = await GeneratedVerifier.deploy();
        await generatedVerifier.waitForDeployment();
        generatedVerifierAddress = await generatedVerifier.getAddress();
        console.log("   ✅ Generated verifier deployed to:", generatedVerifierAddress);
    } else {
        const envVerifier = process.env.GENERATED_VERIFIER_ADDRESS;
        if (envVerifier) {
            generatedVerifierAddress = envVerifier;
            console.log("   Using verifier from environment:", generatedVerifierAddress);
        } else {
            console.log("   ⚠️  Generated verifier not found. Deploy without it and set later.");
        }
    }

    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await RewardClaimVerifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("   ✅ RewardClaimVerifier deployed to:", verifierAddress);

    if (generatedVerifierAddress) {
        const tx = await verifier.setVerifierContract(generatedVerifierAddress);
        await tx.wait();
        console.log("   ✅ Verifier contract configured");
    }

    // Step 2: Deploy RewardWeightingRegistry
    console.log("\n📝 Step 2: Deploying RewardWeightingRegistry...");
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log("   ✅ RewardWeightingRegistry deployed to:", registryAddress);

    // Initialize registry
    const initTx = await registry.initialize(deployer.address);
    await initTx.wait();
    console.log("   ✅ Registry initialized");

    // Step 3: Deploy ZKMerkleDistributor
    console.log("\n📝 Step 3: Deploying ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(tokenAddress, verifierAddress, deployer.address);
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log("   ✅ ZKMerkleDistributor deployed to:", distributorAddress);

    // Step 4: Deploy DualPoolStaking
    console.log("\n📝 Step 4: Deploying DualPoolStaking...");
    const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS;
    if (!emissionsAddress) {
        throw new Error("EMISSIONS_CONTRACT_ADDRESS environment variable not set");
    }

    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const staking = await DualPoolStaking.deploy();
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    console.log("   ✅ DualPoolStaking deployed to:", stakingAddress);

    // Initialize staking
    const stakingInitTx = await staking.initialize(tokenAddress, emissionsAddress, deployer.address);
    await stakingInitTx.wait();
    console.log("   ✅ Staking initialized");

    // Step 5: Deploy LiquidStakingVault
    console.log("\n📝 Step 5: Deploying LiquidStakingVault...");
    const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await LiquidStakingVault.deploy(tokenAddress, stakingAddress, deployer.address);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("   ✅ LiquidStakingVault deployed to:", vaultAddress);

    // Step 6: Configure contract relationships
    console.log("\n📝 Step 6: Configuring contract relationships...");
    
    // Set liquid staking vault in staking contract
    const setVaultTx = await staking.setLiquidStakingVault(vaultAddress);
    await setVaultTx.wait();
    console.log("   ✅ Set liquid staking vault in DualPoolStaking");

    // Grant STAKING_ROLE to vault
    const STAKING_ROLE = await vault.STAKING_ROLE();
    const grantRoleTx = await vault.grantRole(STAKING_ROLE, stakingAddress);
    await grantRoleTx.wait();
    console.log("   ✅ Granted STAKING_ROLE to DualPoolStaking");

    // Save deployment info
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        contracts: {
            rewardClaimVerifier: verifierAddress,
            generatedVerifier: generatedVerifierAddress,
            rewardWeightingRegistry: registryAddress,
            zkMerkleDistributor: distributorAddress,
            dualPoolStaking: stakingAddress,
            liquidStakingVault: vaultAddress,
            token: tokenAddress,
            emissions: emissionsAddress,
        },
        timestamp: new Date().toISOString()
    };

    const deploymentPath = path.join(__dirname, "../deployments/zk-system.json");
    const deploymentDir = path.dirname(deploymentPath);
    
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("\n💾 Deployment info saved to:", deploymentPath);

    console.log("\n📋 Deployment Summary:");
    console.log("   RewardClaimVerifier:", verifierAddress);
    if (generatedVerifierAddress) {
        console.log("   Generated Verifier:", generatedVerifierAddress);
    }
    console.log("   RewardWeightingRegistry:", registryAddress);
    console.log("   ZKMerkleDistributor:", distributorAddress);
    console.log("   DualPoolStaking:", stakingAddress);
    console.log("   LiquidStakingVault:", vaultAddress);
    console.log("\n✅ ZK system deployment complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

