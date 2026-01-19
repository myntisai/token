import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("PROPER TEST WITH CORRECT TOKEN");
    console.log("=".repeat(80));
    
    const NEW_DIST = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const CORRECT_TOKEN = "0x5242925C716225C58459f557E5B4Be51373aB767";
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)",
        "function allowance(address, address) view returns (uint256)"
    ];
    
    const distributorAbi = [
        "function depositBalance(uint256) external",
        "function providerBalance(address) view returns (uint256)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, CORRECT_TOKEN);
    const distributor = await ethers.getContractAt(distributorAbi, NEW_DIST);
    
    const testAmount = ethers.parseEther("10");
    
    console.log("\n📊 BEFORE:");
    console.log(`   Token balance: ${ethers.formatEther(await token.balanceOf(deployer.address))} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(await distributor.providerBalance(deployer.address))} MYNT`);
    console.log(`   Allowance: ${ethers.formatEther(await token.allowance(deployer.address, NEW_DIST))} MYNT`);
    
    console.log("\n📝 Step 1: Approving...");
    const approveTx = await token.approve(NEW_DIST, testAmount);
    await approveTx.wait();
    console.log(`   ✅ Approved`);
    console.log(`   Allowance now: ${ethers.formatEther(await token.allowance(deployer.address, NEW_DIST))} MYNT`);
    
    console.log("\n📝 Step 2: Depositing...");
    try {
        const depositTx = await distributor.depositBalance(testAmount);
        const receipt = await depositTx.wait();
        console.log(`   ✅ Deposited in block ${receipt!.blockNumber}`);
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    }
    
    console.log("\n📊 AFTER:");
    console.log(`   Token balance: ${ethers.formatEther(await token.balanceOf(deployer.address))} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(await distributor.providerBalance(deployer.address))} MYNT`);
    console.log(`   Allowance: ${ethers.formatEther(await token.allowance(deployer.address, NEW_DIST))} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
