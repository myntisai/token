import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("SETTING UP FINAL DISTRIBUTOR");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xdf25bf6A6e9532A79D16C5f46aE04248ae5bC9BE";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const distAbi = [
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function grantRole(bytes32 role, address account)",
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256) external"
    ];
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    
    console.log("\n📝 Checking distributor:");
    console.log(`   Token: ${await dist.token()}`);
    console.log(`   Verifier: ${await dist.batchVerifier()}`);
    
    // Grant PROVIDER_ROLE
    const PROVIDER_ROLE = await dist.PROVIDER_ROLE();
    const hasRole = await dist.hasRole(PROVIDER_ROLE, deployer.address);
    console.log(`   Has PROVIDER_ROLE: ${hasRole}`);
    
    if (!hasRole) {
        console.log("\n📝 Granting PROVIDER_ROLE...");
        await (await dist.grantRole(PROVIDER_ROLE, deployer.address)).wait();
        console.log("   ✅ Granted");
    }
    
    // Check balance and fund
    const deployerBal = await token.balanceOf(deployer.address);
    let provBal = await dist.providerBalance(deployer.address);
    console.log(`\n📝 Balances:`);
    console.log(`   Deployer token: ${ethers.formatEther(deployerBal)} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(provBal)} MYNT`);
    
    // Fund if we have tokens
    if (provBal === 0n && deployerBal > ethers.parseEther("5")) {
        const fundAmount = ethers.parseEther("5");
        console.log(`\n📝 Funding with ${ethers.formatEther(fundAmount)} MYNT...`);
        await (await token.approve(ZK_DIST, fundAmount)).wait();
        console.log("   Approved");
        await (await dist.depositBalance(fundAmount)).wait();
        provBal = await dist.providerBalance(deployer.address);
        console.log(`   ✅ Provider balance: ${ethers.formatEther(provBal)} MYNT`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ READY");
    console.log("=".repeat(80));
    console.log(`\nZK DISTRIBUTOR: ${ZK_DIST}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
