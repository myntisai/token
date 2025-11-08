import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy ZK Verifier Contract
 * 
 * This script deploys the RewardClaimVerifier wrapper contract
 * and optionally the generated Groth16 verifier contract.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-zk-verifier.ts --network <network>
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Check if generated verifier exists
    const generatedVerifierPath = path.join(__dirname, "../contracts/RewardClaimVerifier_generated.sol");
    let generatedVerifierAddress: string | null = null;

    if (fs.existsSync(generatedVerifierPath)) {
        console.log("\n📝 Found generated verifier contract, deploying...");
        
        // Deploy the generated Groth16 verifier
        // Note: The generated contract name is typically "Verifier"
        const GeneratedVerifier = await ethers.getContractFactory("Verifier");
        const generatedVerifier = await GeneratedVerifier.deploy();
        await generatedVerifier.waitForDeployment();
        generatedVerifierAddress = await generatedVerifier.getAddress();
        
        console.log("✅ Generated verifier deployed to:", generatedVerifierAddress);
    } else {
        console.log("\n⚠️  Generated verifier contract not found.");
        console.log("   Run: cd token/zk-circuits && ./generate-verifier.sh");
        console.log("   Or deploy with a pre-deployed verifier address via environment variable.");
        
        // Check for environment variable
        const envVerifier = process.env.GENERATED_VERIFIER_ADDRESS;
        if (envVerifier) {
            generatedVerifierAddress = envVerifier;
            console.log("   Using verifier from environment:", generatedVerifierAddress);
        }
    }

    // Deploy RewardClaimVerifier wrapper
    console.log("\n📝 Deploying RewardClaimVerifier wrapper...");
    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await RewardClaimVerifier.deploy();
    await verifier.waitForDeployment();
    
    const verifierAddress = await verifier.getAddress();
    console.log("✅ RewardClaimVerifier deployed to:", verifierAddress);

    // Set the generated verifier if available
    if (generatedVerifierAddress) {
        console.log("\n📝 Setting generated verifier address...");
        const tx = await verifier.setVerifierContract(generatedVerifierAddress);
        await tx.wait();
        console.log("✅ Verifier contract configured");
        
        // Verify the configuration
        const configuredVerifier = await verifier.verifierContract();
        console.log("   Configured verifier:", configuredVerifier);
    } else {
        console.log("\n⚠️  Generated verifier not set. Call setVerifierContract() after deployment.");
    }

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        rewardClaimVerifier: verifierAddress,
        generatedVerifier: generatedVerifierAddress,
        timestamp: new Date().toISOString()
    };

    const deploymentPath = path.join(__dirname, "../deployments/zk-verifier.json");
    const deploymentDir = path.dirname(deploymentPath);
    
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("\n💾 Deployment info saved to:", deploymentPath);

    console.log("\n📋 Deployment Summary:");
    console.log("   RewardClaimVerifier:", verifierAddress);
    if (generatedVerifierAddress) {
        console.log("   Generated Verifier:", generatedVerifierAddress);
    }
    console.log("\n✅ Deployment complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

