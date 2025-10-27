import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("👷 Deploying StakingContract proxy with account:", deployer.address);

    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
    const merkleAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS;
    const adminAddress = process.env.ADMIN_ADDRESS ?? deployer.address;

    if (!tokenAddress) {
        throw new Error("Missing MYNTIS_TOKEN_ADDRESS in environment");
    }
    if (!adminAddress) {
        throw new Error("Missing ADMIN_ADDRESS in environment");
    }

    console.log("\n📋 Configuration");
    console.log("  Token:          ", tokenAddress);
    console.log("  Merkle (opt):   ", merkleAddress ?? "<unset>");
    console.log("  Admin:          ", adminAddress);

    const StakingFactory = await ethers.getContractFactory("StakingContract");
    const stakingProxy = await upgrades.deployProxy(
        StakingFactory,
        [tokenAddress, ethers.ZeroAddress, ethers.ZeroAddress, adminAddress],
        { initializer: "initialize" }
    );
    await stakingProxy.waitForDeployment();
    const stakingAddress = await stakingProxy.getAddress();

    console.log("\n✅ StakingContract proxy deployed at:", stakingAddress);
    console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(stakingAddress));

    if (merkleAddress) {
        console.log("\n🔗 Staging MerkleDistributor...");
        const tx = await stakingProxy.setMerkleDistributor(merkleAddress);
        await tx.wait();
        console.log("   ✅ MerkleDistributor linked");
    } else {
        console.log("\nℹ️  Skipping MerkleDistributor wiring (no address provided)");
    }

    console.log("\nDone.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
