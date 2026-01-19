import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("FIXING TOKEN ADDRESS AND TESTING");
    console.log("=".repeat(80));
    
    const NEW_DIST = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const CORRECT_TOKEN = "0x5242925C716225C58459f557E5B4Be51373aB767"; // Token the NEW distributor uses
    const OLD_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8"; // Token we've been using
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)",
        "function allowance(address, address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
    ];
    
    console.log("\n📝 Checking both tokens:");
    
    const oldToken = await ethers.getContractAt(tokenAbi, OLD_TOKEN);
    console.log(`\nOLD Token (${OLD_TOKEN}):`);
    try {
        console.log(`   Name: ${await oldToken.name()}`);
        console.log(`   Symbol: ${await oldToken.symbol()}`);
        console.log(`   Deployer balance: ${ethers.formatEther(await oldToken.balanceOf(deployer.address))}`);
    } catch (e: any) {
        console.log(`   Error: ${e.message}`);
    }
    
    const newToken = await ethers.getContractAt(tokenAbi, CORRECT_TOKEN);
    console.log(`\nNEW Token (${CORRECT_TOKEN}):`);
    try {
        console.log(`   Name: ${await newToken.name()}`);
        console.log(`   Symbol: ${await newToken.symbol()}`);
        console.log(`   Deployer balance: ${ethers.formatEther(await newToken.balanceOf(deployer.address))}`);
    } catch (e: any) {
        console.log(`   Error: ${e.message}`);
    }
    
    // Now test with CORRECT token
    const testAmount = ethers.parseEther("1");
    const deployerBalanceNew = await newToken.balanceOf(deployer.address);
    
    if (deployerBalanceNew >= testAmount) {
        console.log("\n📝 Testing depositBalance with CORRECT token...");
        
        // Approve correct token
        console.log("   Approving correct token...");
        await newToken.approve(NEW_DIST, testAmount);
        const allowance = await newToken.allowance(deployer.address, NEW_DIST);
        console.log(`   Allowance: ${ethers.formatEther(allowance)}`);
        
        // Try deposit
        const distributorAbi = [
            "function depositBalance(uint256) external",
            "function providerBalance(address) view returns (uint256)"
        ];
        const distributor = await ethers.getContractAt(distributorAbi, NEW_DIST);
        
        try {
            const tx = await distributor.depositBalance(testAmount);
            await tx.wait();
            console.log("   ✅ depositBalance WORKS with correct token!");
            const balance = await distributor.providerBalance(deployer.address);
            console.log(`   Provider balance: ${ethers.formatEther(balance)}`);
        } catch (e: any) {
            console.log(`   ❌ Still failed: ${e.message}`);
        }
    } else {
        console.log(`\n❌ Deployer has no balance on the NEW token`);
        console.log(`   The new distributor was deployed with a different token address`);
        console.log(`   Either:`);
        console.log(`   1. Redeploy the distributor with the correct token (0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8)`);
        console.log(`   2. Get tokens on the new token address (0x5242925C716225C58459f557E5B4Be51373aB767)`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
