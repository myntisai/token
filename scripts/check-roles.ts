import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("CHECKING ROLES ON DISTRIBUTORS");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const OLD_DISTRIBUTOR = "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";
    
    const distributorAbi = [
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function ADMIN_ROLE() view returns (bytes32)"
    ];
    
    // Check NEW distributor
    console.log("\n📝 NEW ZKMerkleDistributor:");
    const newDist = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    const providerRole = await newDist.PROVIDER_ROLE();
    const adminRole = await newDist.ADMIN_ROLE();
    const hasNewProvider = await newDist.hasRole(providerRole, deployer.address);
    const hasNewAdmin = await newDist.hasRole(adminRole, deployer.address);
    console.log(`   Has PROVIDER_ROLE: ${hasNewProvider}`);
    console.log(`   Has ADMIN_ROLE: ${hasNewAdmin}`);
    
    // Check OLD distributor
    console.log("\n📝 OLD MerkleDistributor:");
    const oldDist = await ethers.getContractAt(distributorAbi, OLD_DISTRIBUTOR);
    const hasOldProvider = await oldDist.hasRole(providerRole, deployer.address);
    const hasOldAdmin = await oldDist.hasRole(adminRole, deployer.address);
    console.log(`   Has PROVIDER_ROLE: ${hasOldProvider}`);
    console.log(`   Has ADMIN_ROLE: ${hasOldAdmin}`);
    
    if (!hasNewProvider) {
        console.log("\n❌ Deployer does NOT have PROVIDER_ROLE on new distributor!");
        console.log("   This is likely why depositBalance fails!");
        console.log("   The function has onlyRole(PROVIDER_ROLE) modifier.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
