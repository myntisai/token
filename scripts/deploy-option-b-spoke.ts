import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy SpokeDistributor (Option B - No GlobalNullifier)
 * With chainId-in-leaf for cross-chain safety
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("DEPLOY SPOKE DISTRIBUTOR (OPTION B)");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    if (Number(network.chainId) !== 11155111) {
        throw new Error(`Expected Ethereum Sepolia (11155111), got ${network.chainId}`);
    }
    
    // Configuration
    const SPOKE_TOKEN = process.env.ETH_SEPOLIA_MYNTIS_SPOKE || "0x712e680892AF9CA9D0C9498335D71031B435C53e";
    
    console.log(`\nSpoke Token: ${SPOKE_TOKEN}`);
    console.log(`Admin: ${deployer.address}`);
    
    // Deploy SpokeDistributor (no GlobalNullifier constructor param)
    console.log("\n📝 Deploying SpokeDistributor...");
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const distributor = await SpokeDistributor.deploy(
        SPOKE_TOKEN,
        deployer.address
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    
    console.log(`✅ SpokeDistributor deployed to: ${distributorAddress}`);
    
    // Grant MINTER_ROLE to distributor
    console.log("\n📝 Granting MINTER_ROLE to SpokeDistributor...");
    const SpokeToken = await ethers.getContractAt("MyntisSpokeOFT", SPOKE_TOKEN);
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    
    const hasMinterRole = await SpokeToken.hasRole(MINTER_ROLE, distributorAddress);
    if (!hasMinterRole) {
        const tx = await SpokeToken.grantRole(MINTER_ROLE, distributorAddress);
        await tx.wait();
        console.log(`✅ Granted MINTER_ROLE`);
    } else {
        console.log(`✅ Already has MINTER_ROLE`);
    }
    
    // Save deployment
    const result = {
        spokeDistributor: distributorAddress,
        spokeToken: SPOKE_TOKEN,
        admin: deployer.address,
        network: "ethereum-sepolia",
        chainId: network.chainId.toString(),
        timestamp: new Date().toISOString()
    };
    
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `spoke-distributor-optionb-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    
    const latestFile = path.join(deploymentDir, `spoke-distributor-optionb-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));
    
    console.log("\n✅ Deployment complete!");
    console.log(`\nUpdate .env.prod:`);
    console.log(`  ETH_SEPOLIA_SPOKE_DISTRIBUTOR=${distributorAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
