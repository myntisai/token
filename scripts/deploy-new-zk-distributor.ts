import { ethers } from "hardhat";

/**
 * Deploy NEW ZKMerkleDistributor with the CORRECT token address
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEPLOYING NEW ZK MERKLE DISTRIBUTOR");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    // CORRECT token address
    const CORRECT_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    // Get batch verifier from existing (wrong token) distributor
    const EXISTING_DIST = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    
    const existingDistAbi = ["function batchVerifier() view returns (address)"];
    const existingDist = await ethers.getContractAt(existingDistAbi, EXISTING_DIST);
    const batchVerifierAddress = await existingDist.batchVerifier();
    
    console.log(`\n📝 Configuration:`);
    console.log(`   Token: ${CORRECT_TOKEN}`);
    console.log(`   Batch Verifier: ${batchVerifierAddress}`);
    console.log(`   Admin: ${deployer.address}`);
    
    // Deploy new ZKMerkleDistributor
    console.log("\n📝 Deploying ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(CORRECT_TOKEN, batchVerifierAddress, deployer.address);
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log(`   ✅ Deployed to: ${distributorAddress}`);
    
    // Verify configuration
    const distAbi = [
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function ADMIN_ROLE() view returns (bytes32)",
        "function grantRole(bytes32 role, address account)"
    ];
    const newDist = await ethers.getContractAt(distAbi, distributorAddress);
    
    console.log("\n📝 Verifying configuration...");
    console.log(`   Token: ${await newDist.token()}`);
    console.log(`   Verifier: ${await newDist.batchVerifier()}`);
    
    // Grant PROVIDER_ROLE to deployer
    const PROVIDER_ROLE = await newDist.PROVIDER_ROLE();
    const hasProviderRole = await newDist.hasRole(PROVIDER_ROLE, deployer.address);
    if (!hasProviderRole) {
        console.log("\n📝 Granting PROVIDER_ROLE...");
        const tx = await newDist.grantRole(PROVIDER_ROLE, deployer.address);
        await tx.wait();
        console.log("   ✅ PROVIDER_ROLE granted");
    } else {
        console.log("   ✅ Already has PROVIDER_ROLE");
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ DEPLOYMENT COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nNEW ZK MERKLE DISTRIBUTOR: ${distributorAddress}`);
    console.log("\nNext steps:");
    console.log("1. Fund the distributor with MYNT tokens");
    console.log("2. Update environment variables");
    console.log("3. Test ZK proof submission");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
