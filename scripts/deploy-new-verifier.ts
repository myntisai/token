import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEPLOYING NEW VERIFIER");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    // Deploy the Groth16Verifier using fully qualified name
    console.log("\n📝 Deploying Groth16Verifier...");
    
    const Groth16Verifier = await ethers.getContractFactory("contracts/Groth16Verifier.sol:Groth16Verifier");
    const verifier = await Groth16Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log(`   ✅ Deployed to: ${verifierAddress}`);
    
    // Update distributor with new verifier
    console.log("\n📝 Updating distributor with new verifier...");
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    
    const distAbi = [
        "function setBatchVerifier(address) external",
        "function batchVerifier() view returns (address)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    const currentVerifier = await dist.batchVerifier();
    console.log(`   Current verifier: ${currentVerifier}`);
    
    const tx = await dist.setBatchVerifier(verifierAddress);
    await tx.wait();
    console.log(`   ✅ Updated to: ${verifierAddress}`);
    
    // Verify
    const newVerifier = await dist.batchVerifier();
    console.log(`   Verified: ${newVerifier}`);
    
    console.log("\n" + "=".repeat(80));
    console.log("DONE - Now retry proof submission");
    console.log("=".repeat(80));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
