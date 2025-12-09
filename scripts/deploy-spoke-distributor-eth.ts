import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy SpokeDistributor on Ethereum Sepolia
 * 
 * This allows users to claim rewards on Ethereum Sepolia
 * instead of having to bridge to Base Sepolia.
 */

// Configuration
const CONFIG = {
    hubChainEid: 40245, // Base Sepolia LayerZero EID
    hubGlobalNullifier: "0x0000000000000000000000000000000000000001", // Placeholder - no GlobalNullifier deployed on hub yet
    spokeToken: "0xdB59bb54c01aBe6DF427a7994AeDD986083D18D4", // MyntisSpokeOFT on ETH Sepolia
};

async function main() {
    console.log("=".repeat(80));
    console.log("DEPLOY SPOKE DISTRIBUTOR - ETHEREUM SEPOLIA");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);

    if (chainId !== 11155111) {
        throw new Error(`Expected Ethereum Sepolia (11155111), got ${chainId}`);
    }

    // ============================================================
    // STEP 1: Deploy SpokeDistributor
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 1: Deploying SpokeDistributor");
    console.log("=".repeat(80));

    const SpokeDistributorFactory = await ethers.getContractFactory("SpokeDistributor");
    const distributor = await SpokeDistributorFactory.deploy(
        CONFIG.hubChainEid,           // _hubChainId (LayerZero EID)
        CONFIG.hubGlobalNullifier,    // _hubGlobalNullifier (placeholder)
        CONFIG.spokeToken,            // _spokeToken
        deployer.address              // admin
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log(`  SpokeDistributor: ${distributorAddress}`);

    // Verify deployment
    const [hubChainId, hubNullifier] = await distributor.getHubInfo();
    console.log(`\n  Verification:`);
    console.log(`    Hub Chain EID: ${hubChainId}`);
    console.log(`    Hub Nullifier: ${hubNullifier}`);

    // ============================================================
    // STEP 2: Grant MINTER_ROLE to SpokeDistributor on SpokeToken
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 2: Granting MINTER_ROLE to SpokeDistributor");
    console.log("=".repeat(80));

    const SpokeToken = await ethers.getContractFactory("MyntisSpokeOFT");
    const spokeToken = SpokeToken.attach(CONFIG.spokeToken);

    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    console.log(`  MINTER_ROLE: ${MINTER_ROLE}`);

    // Check if already has role
    const hasMinterRole = await spokeToken.hasRole(MINTER_ROLE, distributorAddress);
    if (hasMinterRole) {
        console.log(`  SpokeDistributor already has MINTER_ROLE`);
    } else {
        const tx = await spokeToken.grantRole(MINTER_ROLE, distributorAddress);
        await tx.wait();
        console.log(`  Granted MINTER_ROLE to SpokeDistributor`);
        
        // Verify
        const verified = await spokeToken.hasRole(MINTER_ROLE, distributorAddress);
        console.log(`  Verified: ${verified ? '✅' : '❌'}`);
    }

    // ============================================================
    // SAVE RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE!");
    console.log("=".repeat(80));

    const result = {
        spokeDistributor: distributorAddress,
        spokeToken: CONFIG.spokeToken,
        hubChainEid: CONFIG.hubChainEid,
        hubGlobalNullifier: CONFIG.hubGlobalNullifier,
        network: "ethereum-sepolia",
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nSpokeDistributor: ${result.spokeDistributor}`);
    console.log(`SpokeToken:       ${result.spokeToken}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `ethereum-sepolia-distributor-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved to: ${deploymentFile}`);

    const latestFile = path.join(deploymentDir, `ethereum-sepolia-distributor-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

    console.log(`\n${"=".repeat(80)}`);
    console.log("ETHEREUM SEPOLIA SPOKE SETUP COMPLETE!");
    console.log("=".repeat(80));
    console.log(`
Deployed on Ethereum Sepolia:
  - MyntisSpokeOFT:    ${CONFIG.spokeToken}
  - SpokeDistributor:  ${distributorAddress}

Add to .env.prod:
  SPOKE_DISTRIBUTOR_ETH_SEPOLIA=${distributorAddress}

To enable reward claiming on ETH Sepolia:
1. Grant PROVIDER_ROLE to providers on SpokeDistributor
2. Providers bridge tokens to spoke and call addProviderBalance()
3. Providers submit Merkle roots via submitMerkleRoot()
4. Users claim rewards with Merkle proofs
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
