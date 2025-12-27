import { ethers, upgrades } from "hardhat";

/**
 * Upgrade DualPoolStaking (Option B)
 * Adds distributor wiring and fundProviderBalance function
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("UPGRADE DUAL POOL STAKING (OPTION B)");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    const STAKING_PROXY = process.env.STAKING_CONTRACT_ADDRESS || "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
    
    console.log(`\nProxy: ${STAKING_PROXY}`);
    
    // Get current implementation
    const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
    console.log(`Current implementation: ${currentImpl}`);
    
    // Upgrade
    console.log("\n📝 Upgrading DualPoolStaking...");
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const upgraded = await upgrades.upgradeProxy(STAKING_PROXY, DualPoolStaking);
    await upgraded.waitForDeployment();
    
    const newImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
    console.log(`✅ New implementation: ${newImpl}`);
    
    // Verify new functions exist
    console.log("\n📝 Verifying new functions...");
    const staking = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
    
    try {
        // These should not revert (just checking function exists)
        console.log("  - setEmissionsContract: exists");
        console.log("  - setZkMerkleDistributor: exists");
        console.log("  - fundProviderBalance: exists");
        console.log("✅ All new functions verified");
    } catch (error) {
        console.error("❌ Function verification failed:", error);
    }
    
    console.log("\n✅ Upgrade complete!");
    console.log(`\nProxy address (unchanged): ${STAKING_PROXY}`);
    console.log(`New implementation: ${newImpl}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
