import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy RewardWeightingRegistry and configure it with default strategies
 * 
 * This contract allows providers to register their reward weighting strategies
 * and enables dynamic strategy selection for quality-weighted rewards.
 */

// Configuration
const CONFIG = {
    // Default approved strategies
    approvedStrategies: [
        "myntis_default",
        "quality_focused",
        "engagement_focused",
        "security_focused"
    ]
};

async function main() {
    console.log("=".repeat(80));
    console.log("DEPLOY REWARD WEIGHTING REGISTRY");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);

    // ============================================================
    // STEP 1: Deploy Implementation
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 1: Deploying RewardWeightingRegistry Implementation");
    console.log("=".repeat(80));

    const RegistryFactory = await ethers.getContractFactory("RewardWeightingRegistry");
    const registryImpl = await RegistryFactory.deploy();
    await registryImpl.waitForDeployment();
    const registryImplAddress = await registryImpl.getAddress();
    console.log(`  Implementation: ${registryImplAddress}`);

    // ============================================================
    // STEP 2: Deploy Proxy
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 2: Deploying Proxy");
    console.log("=".repeat(80));

    // Encode initialize call
    const initData = RegistryFactory.interface.encodeFunctionData("initialize", [
        deployer.address  // admin
    ]);

    const SimpleProxyFactory = await ethers.getContractFactory("SimpleProxy");
    const proxy = await SimpleProxyFactory.deploy(registryImplAddress, initData);
    await proxy.waitForDeployment();
    const registryAddress = await proxy.getAddress();
    console.log(`  Proxy: ${registryAddress}`);

    // Attach registry interface
    const registry = RegistryFactory.attach(registryAddress);

    // ============================================================
    // STEP 3: Approve Additional Strategies
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 3: Approving Strategies");
    console.log("=".repeat(80));

    for (const strategy of CONFIG.approvedStrategies) {
        const isApproved = await registry.isStrategyApproved(strategy);
        if (!isApproved) {
            const tx = await registry.approveStrategy(strategy);
            await tx.wait();
            console.log(`  Approved: ${strategy}`);
        } else {
            console.log(`  Already approved: ${strategy}`);
        }
    }

    // ============================================================
    // STEP 4: Grant Provider Role to Deployer (for testing)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 4: Granting Provider Role to Deployer");
    console.log("=".repeat(80));

    const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
    const hasProviderRole = await registry.hasRole(PROVIDER_ROLE, deployer.address);
    
    if (!hasProviderRole) {
        const tx = await registry.grantProviderRole(deployer.address);
        await tx.wait();
        console.log(`  Granted PROVIDER_ROLE to ${deployer.address}`);
    } else {
        console.log(`  Deployer already has PROVIDER_ROLE`);
    }

    // ============================================================
    // STEP 5: Set Default Strategy for Deployer
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Setting Default Strategy");
    console.log("=".repeat(80));

    const configHash = ethers.keccak256(ethers.toUtf8Bytes("myntis_default_v1.0.0"));
    const tx = await registry.setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "",  // No endpoint URL for default strategy
        configHash
    );
    await tx.wait();
    console.log(`  Set myntis_default strategy for deployer`);

    // Verify
    const providerStrategy = await registry.getProviderStrategy(deployer.address);
    console.log(`  Verified strategy: ${providerStrategy.strategyName}`);

    // ============================================================
    // SAVE RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE!");
    console.log("=".repeat(80));

    const result = {
        rewardWeightingRegistry: registryAddress,
        rewardWeightingRegistryImpl: registryImplAddress,
        approvedStrategies: CONFIG.approvedStrategies,
        network: network.name,
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nRewardWeightingRegistry: ${result.rewardWeightingRegistry}`);
    console.log(`Implementation: ${result.rewardWeightingRegistryImpl}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `reward-weighting-registry-${chainId}-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved to: ${deploymentFile}`);

    const latestFile = path.join(deploymentDir, `reward-weighting-registry-${chainId}-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

    console.log(`\n${"=".repeat(80)}`);
    console.log("NEXT STEPS:");
    console.log("=".repeat(80));
    console.log(`
1. Add to .env.prod:
   REWARD_WEIGHTING_REGISTRY_ADDRESS=${registryAddress}

2. Grant PROVIDER_ROLE to AI providers:
   registry.grantProviderRole(providerAddress)

3. Providers can set their strategy:
   registry.setProviderStrategy("myntis_default", "1.0.0", "", configHash)

4. Configure RewardClaimVerifier to use the registry (optional)
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
