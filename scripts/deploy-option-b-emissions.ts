import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy EmissionsContract (Option B)
 * Mints rewards to DualPoolStaking for automated distributor funding
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("DEPLOY EMISSIONS CONTRACT (OPTION B)");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Configuration
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0x5242925C716225C58459f557E5B4Be51373aB767";
    const STAKING_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
    
    console.log(`\nToken: ${TOKEN_ADDRESS}`);
    console.log(`Staking: ${STAKING_ADDRESS}`);
    console.log(`Admin: ${deployer.address}`);
    
    // Deploy EmissionsContract
    console.log("\n📝 Deploying EmissionsContract...");
    const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
    const emissions = await EmissionsContract.deploy(
        TOKEN_ADDRESS,
        STAKING_ADDRESS,
        deployer.address
    );
    await emissions.waitForDeployment();
    const emissionsAddress = await emissions.getAddress();
    
    console.log(`✅ EmissionsContract deployed to: ${emissionsAddress}`);
    
    // Save deployment
    const result = {
        emissionsContract: emissionsAddress,
        token: TOKEN_ADDRESS,
        staking: STAKING_ADDRESS,
        admin: deployer.address,
        network: network.name,
        chainId: network.chainId.toString(),
        timestamp: new Date().toISOString()
    };
    
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `emissions-optionb-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    
    console.log("\n✅ Deployment complete!");
    console.log(`\nUpdate .env.prod:`);
    console.log(`  EMISSIONS_CONTRACT_ADDRESS=${emissionsAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
