import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy ZKMerkleDistributor (Option B)
 * With staking funding hook and chainId-in-leaf
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("DEPLOY ZK MERKLE DISTRIBUTOR (OPTION B)");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Configuration
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0x5242925C716225C58459f557E5B4Be51373aB767";
    const VERIFIER_ADDRESS = process.env.REWARD_CLAIM_VERIFIER_ADDRESS || "0x67Ae52ee859c552CAfabFC08D00bb68D3a2e57bB";
    
    console.log(`\nToken: ${TOKEN_ADDRESS}`);
    console.log(`Verifier: ${VERIFIER_ADDRESS}`);
    console.log(`Admin: ${deployer.address}`);
    
    // Deploy ZKMerkleDistributor
    console.log("\n📝 Deploying ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
        TOKEN_ADDRESS,
        VERIFIER_ADDRESS,
        deployer.address
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    
    console.log(`✅ ZKMerkleDistributor deployed to: ${distributorAddress}`);
    
    // Save deployment
    const result = {
        zkMerkleDistributor: distributorAddress,
        token: TOKEN_ADDRESS,
        verifier: VERIFIER_ADDRESS,
        admin: deployer.address,
        network: network.name,
        chainId: network.chainId.toString(),
        timestamp: new Date().toISOString()
    };
    
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `zk-distributor-optionb-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    
    console.log("\n✅ Deployment complete!");
    console.log(`\nUpdate .env.prod:`);
    console.log(`  ZK_MERKLE_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
