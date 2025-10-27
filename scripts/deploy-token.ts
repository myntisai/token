import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const [deployer] = await ethers.getSigners();
    const adminAddress = process.env.ADMIN_ADDRESS ?? deployer.address;

    if (!adminAddress) {
        throw new Error("Missing ADMIN_ADDRESS in environment");
    }

    console.log("👷 Deploying MyntisToken with account:", deployer.address);
    console.log("   Admin:", adminAddress);

    const MyntisToken = await ethers.getContractFactory("MyntisToken");
    const token = await MyntisToken.deploy(adminAddress);
    await token.waitForDeployment();

    console.log("\n✅ MyntisToken deployed at:", await token.getAddress());
    console.log("   MINTER_ROLE:", await token.MINTER_ROLE());
    console.log("   ADMIN_ROLE:", await token.ADMIN_ROLE());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
