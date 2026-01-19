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
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS;
    if (!TOKEN_ADDRESS) {
        throw new Error("MYNTIS_TOKEN_ADDRESS environment variable not set");
    }
    
    // Check if Groth16Verifier is already deployed or needs deployment
    let VERIFIER_ADDRESS = process.env.GROTH16_VERIFIER_ADDRESS;
    
    if (!VERIFIER_ADDRESS) {
        // Deploy Groth16Verifier from generated contract
        console.log("\n📝 Step 1: Deploying Groth16Verifier...");
        const generatedVerifierPath = path.join(__dirname, "../contracts/Groth16Verifier.sol");
        
        if (!fs.existsSync(generatedVerifierPath)) {
            throw new Error(
                "Groth16Verifier.sol not found. " +
                "Run: cd token/zk-circuits && ./generate-provider-batch-keys.sh"
            );
        }
        
        const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier");
        const verifier = await Groth16Verifier.deploy();
        await verifier.waitForDeployment();
        VERIFIER_ADDRESS = await verifier.getAddress();
        console.log(`✅ Groth16Verifier deployed to: ${VERIFIER_ADDRESS}`);
    } else {
        console.log(`\n📝 Using existing Groth16Verifier: ${VERIFIER_ADDRESS}`);
    }
    
    console.log(`\nToken: ${TOKEN_ADDRESS}`);
    console.log(`Verifier: ${VERIFIER_ADDRESS}`);
    console.log(`Admin: ${deployer.address}`);
    
    // Deploy ZKMerkleDistributor
    console.log("\n📝 Step 2: Deploying ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
        TOKEN_ADDRESS,
        VERIFIER_ADDRESS,
        deployer.address
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    
    console.log(`✅ ZKMerkleDistributor deployed to: ${distributorAddress}`);
    
    // Step 3: Grant PROVIDER_ROLE (if provider address is set)
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS;
    if (PROVIDER_ADDRESS) {
        console.log(`\n📝 Step 3: Granting PROVIDER_ROLE to ${PROVIDER_ADDRESS}...`);
        const providerRole = await distributor.PROVIDER_ROLE();
        const tx = await distributor.grantRole(providerRole, PROVIDER_ADDRESS);
        await tx.wait();
        console.log(`✅ PROVIDER_ROLE granted`);
    }
    
    // Step 4: Set staking contract (if DualPoolStaking address is set)
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS;
    if (STAKING_CONTRACT) {
        console.log(`\n📝 Step 4: Setting staking contract to ${STAKING_CONTRACT}...`);
        const tx = await distributor.setStakingContract(STAKING_CONTRACT);
        await tx.wait();
        console.log(`✅ Staking contract set`);
    }
    
    // Save deployment
    const result = {
        groth16Verifier: VERIFIER_ADDRESS,
        zkMerkleDistributor: distributorAddress,
        token: TOKEN_ADDRESS,
        admin: deployer.address,
        provider: PROVIDER_ADDRESS || null,
        stakingContract: STAKING_CONTRACT || null,
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
    console.log(`  GROTH16_VERIFIER_ADDRESS=${VERIFIER_ADDRESS}`);
    console.log(`  ZK_MERKLE_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
    console.log(`\nNext: Call DualPoolStaking.setZkMerkleDistributor(${distributorAddress})`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
