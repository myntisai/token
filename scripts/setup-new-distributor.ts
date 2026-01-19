import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("SETTING UP NEW ZK DISTRIBUTOR");
    console.log("=".repeat(80));
    
    const NEW_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    const CORRECT_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const distAbi = [
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function ADMIN_ROLE() view returns (bytes32)",
        "function grantRole(bytes32 role, address account)",
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256) external"
    ];
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)",
        "function allowance(address, address) view returns (uint256)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, NEW_DIST);
    const token = await ethers.getContractAt(tokenAbi, CORRECT_TOKEN);
    
    console.log("\n📝 Checking deployment...");
    console.log(`   Token: ${await dist.token()}`);
    console.log(`   Verifier: ${await dist.batchVerifier()}`);
    
    // Check/grant PROVIDER_ROLE
    const PROVIDER_ROLE = await dist.PROVIDER_ROLE();
    const ADMIN_ROLE = await dist.ADMIN_ROLE();
    const hasProvider = await dist.hasRole(PROVIDER_ROLE, deployer.address);
    const hasAdmin = await dist.hasRole(ADMIN_ROLE, deployer.address);
    
    console.log(`\n📝 Roles:`);
    console.log(`   Has ADMIN_ROLE: ${hasAdmin}`);
    console.log(`   Has PROVIDER_ROLE: ${hasProvider}`);
    
    if (!hasProvider) {
        console.log("\n📝 Granting PROVIDER_ROLE...");
        const tx = await dist.grantRole(PROVIDER_ROLE, deployer.address);
        await tx.wait();
        console.log("   ✅ Granted");
    }
    
    // Fund the distributor
    const deployerBalance = await token.balanceOf(deployer.address);
    console.log(`\n📝 Token balance: ${ethers.formatEther(deployerBalance)} MYNT`);
    
    const fundAmount = ethers.parseEther("100");
    if (deployerBalance >= fundAmount) {
        console.log("\n📝 Funding distributor with 100 MYNT...");
        
        // Approve
        const approveTx = await token.approve(NEW_DIST, fundAmount);
        await approveTx.wait();
        console.log("   ✅ Approved");
        
        // Deposit
        const depositTx = await dist.depositBalance(fundAmount);
        await depositTx.wait();
        console.log("   ✅ Deposited");
        
        const providerBal = await dist.providerBalance(deployer.address);
        console.log(`   Provider balance: ${ethers.formatEther(providerBal)} MYNT`);
    } else {
        console.log(`   ⚠️  Insufficient balance to fund (have ${ethers.formatEther(deployerBalance)})`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ SETUP COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nNEW ZK DISTRIBUTOR: ${NEW_DIST}`);
    console.log("\nUpdate your .env.prod with:");
    console.log(`ZK_MERKLE_DISTRIBUTOR_ADDRESS=${NEW_DIST}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
