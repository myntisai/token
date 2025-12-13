import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Register a spoke distributor in the hub's GlobalNullifier contract
 * 
 * This script must be run on the hub chain (Base) to register a spoke chain's
 * SpokeDistributor so it can burn nullifiers and prevent cross-chain double-claims.
 * 
 * Prerequisites:
 * - GlobalNullifier must be deployed on hub (Base)
 * - SpokeDistributor must be deployed on the spoke chain
 * - You must have ADMIN_ROLE on GlobalNullifier
 * 
 * Environment variables needed:
 * - GLOBAL_NULLIFIER_ADDRESS: Hub GlobalNullifier contract address
 * - SPOKE_DISTRIBUTOR_ADDRESS: SpokeDistributor address from spoke chain
 * - SPOKE_CHAIN_ID: Chain ID of the spoke chain
 */

async function main() {
    console.log("🚀 Registering Spoke in GlobalNullifier\n");
    
    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log(`📍 Deployer: ${deployer.address}`);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const networkName = process.env.HARDHAT_NETWORK || "base";
    const chainId = Number(network.chainId);
    
    console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);
    
    if (networkName !== "base" && networkName !== "base-sepolia" && chainId !== 8453 && chainId !== 84532) {
        console.warn("⚠️  Warning: This script should typically be run on Base (hub chain)");
    }
    
    // Get required addresses from environment
    const globalNullifierAddress = process.env.GLOBAL_NULLIFIER_ADDRESS;
    const spokeDistributorAddress = process.env.SPOKE_DISTRIBUTOR_ADDRESS;
    const spokeChainId = process.env.SPOKE_CHAIN_ID ? parseInt(process.env.SPOKE_CHAIN_ID) : null;
    
    if (!globalNullifierAddress) {
        console.error("❌ GLOBAL_NULLIFIER_ADDRESS not set in environment");
        process.exit(1);
    }
    
    if (!spokeDistributorAddress) {
        console.error("❌ SPOKE_DISTRIBUTOR_ADDRESS not set in environment");
        process.exit(1);
    }
    
    if (!spokeChainId) {
        console.error("❌ SPOKE_CHAIN_ID not set in environment");
        process.exit(1);
    }
    
    console.log(`\n📋 Registration Configuration:`);
    console.log(`   GlobalNullifier: ${globalNullifierAddress}`);
    console.log(`   SpokeDistributor: ${spokeDistributorAddress}`);
    console.log(`   Spoke Chain ID: ${spokeChainId}\n`);

    // Get GlobalNullifier contract
    const globalNullifier = await ethers.getContractAt("GlobalNullifier", globalNullifierAddress);
    
    // Check if deployer has ADMIN_ROLE
    const ADMIN_ROLE = await globalNullifier.ADMIN_ROLE();
    const hasAdminRole = await globalNullifier.hasRole(ADMIN_ROLE, deployer.address);
    
    if (!hasAdminRole) {
        console.error(`❌ Deployer ${deployer.address} does not have ADMIN_ROLE on GlobalNullifier`);
        process.exit(1);
    }
    
    console.log(`✅ Deployer has ADMIN_ROLE\n`);

    // Register the spoke
    console.log(`📝 Registering spoke chain ${spokeChainId}...`);
    
    const registerTx = await globalNullifier.registerSpoke(spokeChainId, spokeDistributorAddress);
    await registerTx.wait();
    
    console.log(`✅ Spoke registered successfully!\n`);

    // Verify registration
    const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
    const hasSpokeRole = await globalNullifier.hasRole(SPOKE_ROLE, spokeDistributorAddress);
    
    if (hasSpokeRole) {
        console.log(`✅ Verification: SpokeDistributor has SPOKE_ROLE\n`);
    } else {
        console.error(`❌ Verification failed: SpokeDistributor does not have SPOKE_ROLE`);
        process.exit(1);
    }

    // Summary
    console.log("═══════════════════════════════════════════════════════════");
    console.log("              REGISTRATION SUMMARY                          ");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Hub Network:       ${networkName} (Chain ID: ${chainId})`);
    console.log(`GlobalNullifier:   ${globalNullifierAddress}`);
    console.log(`Spoke Chain ID:    ${spokeChainId}`);
    console.log(`SpokeDistributor:  ${spokeDistributorAddress}`);
    console.log(`Status:            ✅ Registered`);
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("✅ Registration complete! The spoke chain can now burn nullifiers.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Registration failed:", error);
        process.exit(1);
    });
