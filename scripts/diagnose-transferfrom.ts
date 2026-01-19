import { ethers } from "hardhat";

/**
 * Diagnose the transferFrom issue more carefully
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DIAGNOSING TRANSFERFROM ISSUE");
    console.log("=".repeat(80));
    console.log(`Deployer (EOA): ${deployer.address}`);
    
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const OLD_DISTRIBUTOR = "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    
    const testAmount = ethers.parseEther("1"); // Small test amount
    
    console.log("\n📊 Current State:");
    const balance = await token.balanceOf(deployer.address);
    console.log(`   Deployer balance: ${ethers.formatEther(balance)} MYNT`);
    
    // Check current allowances
    const allowanceZK = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
    const allowanceOld = await token.allowance(deployer.address, OLD_DISTRIBUTOR);
    const allowanceStaking = await token.allowance(deployer.address, STAKING_CONTRACT);
    console.log(`   Allowance -> ZK Distributor: ${ethers.formatEther(allowanceZK)} MYNT`);
    console.log(`   Allowance -> Old Distributor: ${ethers.formatEther(allowanceOld)} MYNT`);
    console.log(`   Allowance -> Staking: ${ethers.formatEther(allowanceStaking)} MYNT`);
    
    // Test 1: EOA-to-EOA transferFrom
    console.log("\n📝 Test 1: EOA approves, EOA calls transferFrom");
    console.log("   This tests if transferFrom works when called by EOA (not contract)");
    
    // Create a test recipient
    const testRecipient = "0x1234567890123456789012345678901234567890";
    
    // Approve deployer to spend their own tokens (weird but let's test)
    console.log("   a) Approving self to spend tokens...");
    await token.approve(deployer.address, testAmount);
    const selfAllowance = await token.allowance(deployer.address, deployer.address);
    console.log(`      Self-allowance: ${ethers.formatEther(selfAllowance)} MYNT`);
    
    console.log("   b) Calling transferFrom(self, recipient, amount)...");
    try {
        const tx = await token.transferFrom(deployer.address, testRecipient, testAmount);
        await tx.wait();
        console.log("      ✅ EOA self-transferFrom works!");
    } catch (e: any) {
        console.log(`      ❌ EOA self-transferFrom FAILED: ${e.message}`);
    }
    
    // Test 2: What happens when CONTRACT calls transferFrom?
    console.log("\n📝 Test 2: EOA approves contract, EOA calls depositBalance");
    console.log("   This is what's failing - contract internally calls transferFrom");
    
    console.log("   a) Setting fresh approval for ZK distributor...");
    const approveTx = await token.approve(ZK_DISTRIBUTOR, testAmount);
    await approveTx.wait();
    const newAllowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
    console.log(`      Allowance set: ${ethers.formatEther(newAllowance)} MYNT`);
    
    console.log("   b) Attempting depositBalance (contract calls transferFrom)...");
    const distributorAbi = [
        "function depositBalance(uint256 amount) external",
        "function providerBalance(address) view returns (uint256)"
    ];
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    try {
        const depositTx = await distributor.depositBalance(testAmount);
        await depositTx.wait();
        console.log("      ✅ depositBalance works!");
    } catch (e: any) {
        console.log(`      ❌ depositBalance FAILED: ${e.message.slice(0, 100)}`);
        
        // Check allowance AFTER the failed call
        const allowanceAfter = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
        console.log(`      Allowance AFTER failed call: ${ethers.formatEther(allowanceAfter)} MYNT`);
        
        if (allowanceAfter.toString() === "0") {
            console.log("\n⚠️  IMPORTANT: Allowance was CONSUMED even though transfer failed!");
            console.log("   This suggests the approval happened but transferFrom itself failed.");
        }
    }
    
    // Test 3: Try with OLD distributor (which is known to work in production)
    console.log("\n📝 Test 3: Test with OLD distributor (production)");
    console.log("   If this works, the issue is specific to new distributor");
    
    console.log("   a) Setting approval for OLD distributor...");
    await token.approve(OLD_DISTRIBUTOR, testAmount);
    const oldAllowance = await token.allowance(deployer.address, OLD_DISTRIBUTOR);
    console.log(`      Allowance set: ${ethers.formatEther(oldAllowance)} MYNT`);
    
    const oldDistributorAbi = [
        "function depositBalance(uint256 amount) external",
        "function providerBalance(address) view returns (uint256)"
    ];
    const oldDistributor = await ethers.getContractAt(oldDistributorAbi, OLD_DISTRIBUTOR);
    
    console.log("   b) Attempting depositBalance on OLD distributor...");
    try {
        const oldDepositTx = await oldDistributor.depositBalance(testAmount);
        await oldDepositTx.wait();
        console.log("      ✅ OLD distributor depositBalance works!");
        console.log("\n🎯 CONCLUSION: Issue is specific to NEW distributor contract");
    } catch (e: any) {
        console.log(`      ❌ OLD distributor also FAILED: ${e.message.slice(0, 100)}`);
        console.log("\n🎯 CONCLUSION: Issue is with the OFT token's transferFrom implementation");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
