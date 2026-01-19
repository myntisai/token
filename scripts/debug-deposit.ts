import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEBUG DEPOSIT BALANCE");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)",
        "function allowance(address, address) view returns (uint256)"
    ];
    
    const distAbi = [
        "function token() view returns (address)",
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256) external"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    // Check state
    console.log("\n📊 Current State:");
    console.log(`   Deployer token balance: ${ethers.formatEther(await token.balanceOf(deployer.address))} MYNT`);
    console.log(`   Distributor token balance: ${ethers.formatEther(await token.balanceOf(ZK_DIST))} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(await dist.providerBalance(deployer.address))} MYNT`);
    console.log(`   Allowance: ${ethers.formatEther(await token.allowance(deployer.address, ZK_DIST))} MYNT`);
    
    // Try deposit with explicit steps
    const amount = ethers.parseEther("5");
    
    console.log("\n📝 Step 1: Approving...");
    try {
        const approveTx = await token.approve(ZK_DIST, amount);
        const approveReceipt = await approveTx.wait();
        console.log(`   ✅ Approved in block ${approveReceipt!.blockNumber}`);
        console.log(`   Allowance now: ${ethers.formatEther(await token.allowance(deployer.address, ZK_DIST))} MYNT`);
    } catch (e: any) {
        console.log(`   ❌ Approve failed: ${e.message}`);
    }
    
    console.log("\n📝 Step 2: Testing depositBalance with staticCall...");
    try {
        await dist.depositBalance.staticCall(amount);
        console.log("   ✅ staticCall passed");
    } catch (e: any) {
        console.log(`   ❌ staticCall failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data}`);
        }
        return;
    }
    
    console.log("\n📝 Step 3: Executing depositBalance...");
    try {
        const depositTx = await dist.depositBalance(amount);
        console.log(`   Tx hash: ${depositTx.hash}`);
        const receipt = await depositTx.wait();
        console.log(`   ✅ Mined in block ${receipt!.blockNumber}`);
        console.log(`   Gas used: ${receipt!.gasUsed}`);
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    }
    
    console.log("\n📊 After State:");
    console.log(`   Deployer token balance: ${ethers.formatEther(await token.balanceOf(deployer.address))} MYNT`);
    console.log(`   Distributor token balance: ${ethers.formatEther(await token.balanceOf(ZK_DIST))} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(await dist.providerBalance(deployer.address))} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
