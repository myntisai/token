import { ethers } from "hardhat";

/**
 * Fund and stake provider initial balance
 * 
 * This script:
 * 1. Mints initial MYNT to provider wallet
 * 2. Approves staking contract
 * 3. Stakes in provider pool
 * 
 * Run: npx hardhat run scripts/fund-provider-initial.ts --network base-sepolia
 */

// Configuration
const CONFIG = {
    // Contract addresses (from latest deployment)
    MYNTIS: "0x599016bF00eE23d531223c6285C92aa0cAC278EF",
    DUAL_POOL_STAKING: "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3",
    
    // Initial stake amount (100k MYNT)
    INITIAL_STAKE: ethers.parseEther("100000"),
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("================================================================================");
    console.log("PROVIDER INITIAL FUNDING & STAKING");
    console.log("================================================================================\n");
    console.log(`Provider: ${deployer.address}`);
    console.log(`Initial Stake: ${ethers.formatEther(CONFIG.INITIAL_STAKE)} MYNT\n`);
    
    // Get contract instances
    const myntis = await ethers.getContractAt("Myntis", CONFIG.MYNTIS);
    const staking = await ethers.getContractAt("DualPoolStaking", CONFIG.DUAL_POOL_STAKING);
    
    try {
        // Step 1: Check current balances
        console.log("📊 Checking current state...");
        const providerBalance = await myntis.balanceOf(deployer.address);
        const providerInfo = await staking.getProviderInfo(deployer.address);
        const currentStake = providerInfo[0]; // stake amount
        
        console.log(`  Current MYNT balance: ${ethers.formatEther(providerBalance)} MYNT`);
        console.log(`  Current staked: ${ethers.formatEther(currentStake)} MYNT\n`);
        
        // Step 2: Mint tokens if needed
        if (providerBalance < CONFIG.INITIAL_STAKE) {
            const amountToMint = CONFIG.INITIAL_STAKE - providerBalance;
            console.log(`💰 Minting ${ethers.formatEther(amountToMint)} MYNT to provider...`);
            
            const mintTx = await myntis.mint(deployer.address, amountToMint);
            console.log(`  TX: ${mintTx.hash}`);
            await mintTx.wait(1);
            console.log(`  ✅ Minted!\n`);
        } else {
            console.log(`✅ Provider already has sufficient balance\n`);
        }
        
        // Step 3: Approve staking contract
        console.log("🔐 Approving staking contract...");
        const approveTx = await myntis.approve(staking.target, CONFIG.INITIAL_STAKE);
        console.log(`  TX: ${approveTx.hash}`);
        await approveTx.wait(1);
        console.log(`  ✅ Approved!\n`);
        
        // Step 4: Stake in provider pool
        console.log("🔄 Staking in provider pool...");
        const stakeTx = await staking.stakeToProviderPool(CONFIG.INITIAL_STAKE);
        console.log(`  TX: ${stakeTx.hash}`);
        await stakeTx.wait(1);
        console.log(`  ✅ Staked!\n`);
        
        // Step 5: Verify final state
        console.log("✅ Verification:");
        const finalInfo = await staking.getProviderInfo(deployer.address);
        const finalStake = finalInfo[0]; // stake amount
        const finalBalance = await myntis.balanceOf(deployer.address);
        const userInfo = await staking.userInfo(deployer.address);
        
        console.log(`  Provider stake: ${ethers.formatEther(finalStake)} MYNT`);
        console.log(`  Wallet balance: ${ethers.formatEther(finalBalance)} MYNT`);
        console.log(`  Stake timestamp: ${new Date(Number(userInfo.lastStakeTime) * 1000).toISOString()}`);
        
        // Calculate estimated earnings
        const emissionRate = 3.17; // MYNT/sec
        const providerShare = 0.875; // 87.5%
        const providerEmissionRate = emissionRate * providerShare;
        
        console.log("\n📈 Estimated Emissions:");
        console.log(`  Provider rate: ~${providerEmissionRate.toFixed(2)} MYNT/sec`);
        console.log(`  Per hour: ~${(providerEmissionRate * 3600).toFixed(0)} MYNT`);
        console.log(`  Per day: ~${(providerEmissionRate * 86400).toFixed(0)} MYNT`);
        
        console.log("\n================================================================================");
        console.log("✅ PROVIDER SETUP COMPLETE!");
        console.log("================================================================================");
        console.log("\nNext steps:");
        console.log("1. Wait for emissions to accumulate (check after 1 hour)");
        console.log("2. Run: node scripts/harvest-provider-emissions.js");
        console.log("3. Run: node scripts/fund-distributor.js");
        console.log("4. Run: node scripts/test-distribution.js\n");
        
    } catch (error: any) {
        console.error("\n❌ Error during provider setup:");
        console.error(error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
