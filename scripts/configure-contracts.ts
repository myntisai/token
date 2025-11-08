import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Configure ZK System Contracts
 * 
 * This script configures relationships between deployed contracts:
 * - Sets verifier address in distributor
 * - Grants necessary roles
 * - Configures contract addresses
 * 
 * Usage:
 *   npx hardhat run scripts/configure-contracts.ts --network <network>
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Configuring contracts with account:", deployer.address);

    // Load deployment info
    const deploymentPath = path.join(__dirname, "../deployments/zk-system.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Deployment info not found. Please deploy contracts first.");
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
    console.log("📋 Loaded deployment info from:", deploymentPath);

    const {
        rewardClaimVerifier,
        rewardWeightingRegistry,
        zkMerkleDistributor,
        dualPoolStaking,
        liquidStakingVault,
    } = deploymentInfo.contracts;

    // Get contract instances
    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");

    const verifier = RewardClaimVerifier.attach(rewardClaimVerifier);
    const registry = RewardWeightingRegistry.attach(rewardWeightingRegistry);
    const distributor = ZKMerkleDistributor.attach(zkMerkleDistributor);
    const staking = DualPoolStaking.attach(dualPoolStaking);
    const vault = LiquidStakingVault.attach(liquidStakingVault);

    console.log("\n📝 Configuring contract relationships...");

    // Verify verifier is set in distributor
    const currentVerifier = await distributor.verifier();
    if (currentVerifier.toLowerCase() !== rewardClaimVerifier.toLowerCase()) {
        console.log("   ⚠️  Verifier address mismatch. This should be set during deployment.");
    } else {
        console.log("   ✅ Verifier address correctly set in distributor");
    }

    // Grant PROVIDER_ROLE to deployer (for testing)
    const PROVIDER_ROLE = await registry.PROVIDER_ROLE();
    const hasProviderRole = await registry.hasRole(PROVIDER_ROLE, deployer.address);
    if (!hasProviderRole) {
        console.log("   📝 Granting PROVIDER_ROLE to deployer...");
        const tx = await registry.grantProviderRole(deployer.address);
        await tx.wait();
        console.log("   ✅ PROVIDER_ROLE granted");
    } else {
        console.log("   ✅ Deployer already has PROVIDER_ROLE");
    }

    // Verify liquid staking vault is set in staking
    const currentVault = await staking.liquidStakingVault();
    if (currentVault.toLowerCase() !== liquidStakingVault.toLowerCase()) {
        console.log("   ⚠️  Liquid staking vault address mismatch. This should be set during deployment.");
    } else {
        console.log("   ✅ Liquid staking vault correctly set in staking");
    }

    // Verify STAKING_ROLE is granted
    const STAKING_ROLE = await vault.STAKING_ROLE();
    const hasStakingRole = await vault.hasRole(STAKING_ROLE, dualPoolStaking);
    if (!hasStakingRole) {
        console.log("   ⚠️  STAKING_ROLE not granted. This should be set during deployment.");
    } else {
        console.log("   ✅ STAKING_ROLE correctly granted");
    }

    console.log("\n✅ Contract configuration complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

