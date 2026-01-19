import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("COMPARING ZK DISTRIBUTORS");
    console.log("=".repeat(80));
    
    const NEW_DIST = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const OLD_DIST = "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const distributorAbi = [
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)",
        "function stakingContract() view returns (address)",
        "function providerBalance(address) view returns (uint256)"
    ];
    
    console.log("\n📝 NEW ZKMerkleDistributor:", NEW_DIST);
    const newDist = await ethers.getContractAt(distributorAbi, NEW_DIST);
    try {
        console.log(`   token: ${await newDist.token()}`);
        console.log(`   batchVerifier: ${await newDist.batchVerifier()}`);
        console.log(`   stakingContract: ${await newDist.stakingContract()}`);
        console.log(`   providerBalance: ${ethers.formatEther(await newDist.providerBalance(deployer.address))} MYNT`);
    } catch (e: any) {
        console.log(`   Error: ${e.message}`);
    }
    
    console.log("\n📝 OLD ZKMerkleDistributor:", OLD_DIST);
    const oldDist = await ethers.getContractAt(distributorAbi, OLD_DIST);
    try {
        console.log(`   token: ${await oldDist.token()}`);
        console.log(`   batchVerifier: ${await oldDist.batchVerifier()}`);
        console.log(`   stakingContract: ${await oldDist.stakingContract()}`);
        console.log(`   providerBalance: ${ethers.formatEther(await oldDist.providerBalance(deployer.address))} MYNT`);
    } catch (e: any) {
        console.log(`   Error: ${e.message}`);
    }
    
    // Check bytecode size
    const newCode = await ethers.provider.getCode(NEW_DIST);
    const oldCode = await ethers.provider.getCode(OLD_DIST);
    console.log(`\n📊 Bytecode sizes:`);
    console.log(`   NEW: ${(newCode.length - 2) / 2} bytes`);
    console.log(`   OLD: ${(oldCode.length - 2) / 2} bytes`);
    
    if (newCode.length !== oldCode.length) {
        console.log("\n⚠️  Bytecode sizes differ - contracts are different versions!");
    }
    
    // Test depositBalance with detailed error
    console.log("\n📝 Testing depositBalance on NEW distributor...");
    const tokenAbi = [
        "function approve(address, uint256) external returns (bool)",
        "function allowance(address, address) view returns (uint256)"
    ];
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    
    const testAmount = ethers.parseEther("1");
    
    // Fresh approval
    console.log("   Approving...");
    await token.approve(NEW_DIST, testAmount);
    const allowance = await token.allowance(deployer.address, NEW_DIST);
    console.log(`   Allowance: ${ethers.formatEther(allowance)} MYNT`);
    
    // Try with static call first to get error
    const newDistFull = await ethers.getContractAt([
        "function depositBalance(uint256) external"
    ], NEW_DIST);
    
    console.log("   Calling depositBalance (staticCall for error)...");
    try {
        await newDistFull.depositBalance.staticCall(testAmount);
        console.log("   ✅ staticCall passed - should work");
    } catch (e: any) {
        console.log(`   ❌ staticCall failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data}`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
