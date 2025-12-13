import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Deploy spoke-side claim system (SpokeDistributor)
 * 
 * This script deploys SpokeDistributor on a spoke chain and wires it to:
 * - The spoke token (MyntisSpokeOFT)
 * - The hub's GlobalNullifier contract
 * 
 * Prerequisites:
 * - MyntisSpokeOFT must be deployed on this spoke chain
 * - GlobalNullifier must be deployed on hub chain (Base)
 * - This SpokeDistributor address must be registered in GlobalNullifier (see register-spoke-in-nullifier.ts)
 */

interface DeploymentResult {
    network: string;
    chainId: number;
    hubChainId: number;
    contracts: {
        spokeDistributor: string;
        spokeToken: string;
        hubGlobalNullifier: string;
    };
    deployer: string;
    timestamp: string;
}

async function main() {
    console.log("🚀 Deploying Spoke Claim System\n");
    
    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log(`📍 Deployer: ${deployer.address}`);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);
    
    if (balance < ethers.parseEther("0.01")) {
        console.error("❌ Insufficient balance. Need at least 0.01 ETH");
        process.exit(1);
    }

    // Get network info
    const network = await ethers.provider.getNetwork();
    const networkName = process.env.HARDHAT_NETWORK || "unknown";
    const chainId = Number(network.chainId);
    
    console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})\n`);

    // Get required addresses from environment
    const spokeTokenAddress = process.env.SPOKE_TOKEN_ADDRESS;
    const hubGlobalNullifierAddress = process.env.HUB_GLOBAL_NULLIFIER_ADDRESS;
    const hubChainId = process.env.HUB_CHAIN_ID ? parseInt(process.env.HUB_CHAIN_ID) : 8453; // Base mainnet default
    
    if (!spokeTokenAddress) {
        console.error("❌ SPOKE_TOKEN_ADDRESS not set in environment");
        process.exit(1);
    }
    
    if (!hubGlobalNullifierAddress) {
        console.error("❌ HUB_GLOBAL_NULLIFIER_ADDRESS not set in environment");
        process.exit(1);
    }
    
    console.log(`📋 Configuration:`);
    console.log(`   Spoke Token: ${spokeTokenAddress}`);
    console.log(`   Hub GlobalNullifier: ${hubGlobalNullifierAddress}`);
    console.log(`   Hub Chain ID: ${hubChainId}\n`);

    // Deploy SpokeDistributor
    console.log("📝 Deploying SpokeDistributor...");
    
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
        hubChainId,
        hubGlobalNullifierAddress,
        spokeTokenAddress,
        deployer.address  // admin
    );
    
    await spokeDistributor.waitForDeployment();
    const spokeDistributorAddress = await spokeDistributor.getAddress();
    console.log(`✅ SpokeDistributor deployed: ${spokeDistributorAddress}\n`);

    // Grant MINTER_ROLE to SpokeDistributor on the spoke token
    console.log("🔧 Granting MINTER_ROLE to SpokeDistributor on spoke token...");
    const spokeToken = await ethers.getContractAt("MyntisSpokeOFT", spokeTokenAddress);
    const MINTER_ROLE = await spokeToken.MINTER_ROLE();
    
    const grantTx = await spokeToken.grantRole(MINTER_ROLE, spokeDistributorAddress);
    await grantTx.wait();
    console.log(`✅ MINTER_ROLE granted to SpokeDistributor\n`);

    // Save deployment info
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentResult: DeploymentResult = {
        network: networkName,
        chainId,
        hubChainId,
        contracts: {
            spokeDistributor: spokeDistributorAddress,
            spokeToken: spokeTokenAddress,
            hubGlobalNullifier: hubGlobalNullifierAddress,
        },
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
    };
    
    const deploymentFile = path.join(deploymentDir, `${networkName}-spoke-claim-system.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentResult, null, 2));
    console.log(`💾 Deployment saved to: ${deploymentFile}\n`);

    // Summary
    console.log("═══════════════════════════════════════════════════════════");
    console.log("                 DEPLOYMENT SUMMARY                         ");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Network:           ${networkName}`);
    console.log(`Chain ID:          ${chainId}`);
    console.log(`Hub Chain ID:      ${hubChainId}`);
    console.log(`SpokeDistributor:  ${spokeDistributorAddress}`);
    console.log(`Spoke Token:       ${spokeTokenAddress}`);
    console.log(`Hub Nullifier:     ${hubGlobalNullifierAddress}`);
    console.log(`Deployer:          ${deployer.address}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("📋 Next Steps:");
    console.log("1. Register this SpokeDistributor in the hub's GlobalNullifier:");
    console.log(`   Run: npx hardhat run scripts/register-spoke-in-nullifier.ts --network base`);
    console.log(`   With: SPOKE_DISTRIBUTOR_ADDRESS=${spokeDistributorAddress}`);
    console.log(`   And:  SPOKE_CHAIN_ID=${chainId}`);
    console.log("\n2. Verify contract:");
    console.log(`   npx hardhat verify --network ${networkName} ${spokeDistributorAddress} ${hubChainId} ${hubGlobalNullifierAddress} ${spokeTokenAddress} ${deployer.address}`);
    console.log("\n3. Test claim flow on spoke chain");
    
    return deploymentResult;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
