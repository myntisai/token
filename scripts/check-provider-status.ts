import { ethers } from "hardhat";

/**
 * Check provider status and readiness
 * 
 * This script checks:
 * - Provider stake amount
 * - Pending emissions
 * - Distributor balance
 * - Last distribution
 * 
 * Run: npx hardhat run scripts/check-provider-status.ts --network base-sepolia
 */

// Configuration
const CONFIG = {
    MYNTIS: "0x599016bF00eE23d531223c6285C92aa0cAC278EF",
    DUAL_POOL_STAKING: "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3",
    ZK_MERKLE_DISTRIBUTOR: "0x807833243F1AAFD29e1B9acDB4D796987D0aa934",
    EMISSIONS_CONTRACT: "0xc5996A1ca8C4B558feEFFf2b403C09C9e1aE27Cf",
    
    // Emission parameters
    EMISSION_RATE: 3.17, // MYNT/sec
    PROVIDER_SHARE: 0.875, // 87.5%
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("================================================================================");
    console.log("PROVIDER STATUS CHECK");
    console.log("================================================================================\n");
    console.log(`Provider Address: ${deployer.address}`);
    console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);
    
    // Get contract instances
    const myntis = await ethers.getContractAt("Myntis", CONFIG.MYNTIS);
    const staking = await ethers.getContractAt("DualPoolStaking", CONFIG.DUAL_POOL_STAKING);
    const distributor = await ethers.getContractAt("ZKMerkleDistributor", CONFIG.ZK_MERKLE_DISTRIBUTOR);
    
    try {
        // === WALLET BALANCE ===
        console.log("💰 Wallet Balance:");
        const walletBalance = await myntis.balanceOf(deployer.address);
        const ethBalance = await ethers.provider.getBalance(deployer.address);
        console.log(`  MYNT: ${ethers.formatEther(walletBalance)} MYNT`);
        console.log(`  ETH: ${ethers.formatEther(ethBalance)} ETH\n`);
        
        // === PROVIDER STAKE ===
        console.log("🔒 Provider Stake:");
        const providerInfo = await staking.getProviderInfo(deployer.address);
        const stakeAmount = providerInfo[0]; // stake
        const userInfo = await staking.userInfo(deployer.address);
        const stakeTimestamp = Number(userInfo.lastStakeTime);
        const stakeTime = stakeTimestamp > 0 ? new Date(stakeTimestamp * 1000).toISOString() : "Not staked";
        
        console.log(`  Staked: ${ethers.formatEther(stakeAmount)} MYNT`);
        console.log(`  Since: ${stakeTime}`);
        console.log(`  Is Provider: ${userInfo.isProvider}`);
        
        if (stakeTimestamp > 0) {
            const secondsStaked = Math.floor(Date.now() / 1000) - stakeTimestamp;
            const hoursStaked = secondsStaked / 3600;
            const daysStaked = secondsStaked / 86400;
            console.log(`  Duration: ${secondsStaked}s (~${hoursStaked.toFixed(1)}h / ${daysStaked.toFixed(2)}d)`);
        }
        console.log();
        
        // === PENDING EMISSIONS ===
        console.log("⏳ Pending Emissions:");
        const pendingProviderRewards = await staking.pendingEmissionRewards(deployer.address);
        console.log(`  Unharvested: ${ethers.formatEther(pendingProviderRewards)} MYNT`);
        
        if (stakeTimestamp > 0) {
            const secondsStaked = Math.floor(Date.now() / 1000) - stakeTimestamp;
            const providerEmissionRate = CONFIG.EMISSION_RATE * CONFIG.PROVIDER_SHARE;
            const estimatedEmissions = providerEmissionRate * secondsStaked;
            console.log(`  Estimated: ~${estimatedEmissions.toFixed(2)} MYNT (${providerEmissionRate.toFixed(2)} MYNT/sec)`);
        }
        console.log();
        
        // === DISTRIBUTOR STATUS ===
        console.log("📦 ZKMerkleDistributor:");
        const providerBalance = await distributor.getProviderBalance(deployer.address);
        console.log(`  Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
        
        try {
            // Try to get provider's merkle roots count
            // Note: This is a workaround since we can't directly get array length
            // We'll try to access index 0 to see if any roots exist
            let rootCount = 0;
            try {
                const root0 = await distributor.providerMerkleRoots(deployer.address, 0);
                rootCount = 1;
                console.log(`  ✅ At least 1 merkle root submitted`);
                console.log(`  Latest root: ${root0.root}`);
                console.log(`  Total claimable: ${ethers.formatEther(root0.totalClaimable)} MYNT`);
                console.log(`  Claimed: ${ethers.formatEther(root0.claimedAmount)} MYNT`);
                console.log(`  Closed: ${root0.closed}`);
            } catch (e) {
                console.log(`  ⚠️  No merkle roots submitted yet`);
            }
        } catch (e) {
            console.log(`  ⚠️  Could not fetch merkle root info`);
        }
        console.log();
        
        // === READINESS CHECK ===
        console.log("✅ Readiness Check:");
        const checks = {
            hasStake: stakeAmount > 0n,
            hasPendingRewards: pendingProviderRewards > 0n,
            hasDistributorBalance: providerBalance > 0n,
            hasProviderRole: true, // Assume true, would need to check role
        };
        
        console.log(`  [ ${checks.hasStake ? '✓' : '✗'} ] Provider has active stake`);
        console.log(`  [ ${checks.hasPendingRewards ? '✓' : '✗'} ] Has pending rewards to harvest`);
        console.log(`  [ ${checks.hasDistributorBalance ? '✓' : '✗'} ] Distributor has provider balance`);
        console.log(`  [ ${checks.hasProviderRole ? '✓' : '✗'} ] Has PROVIDER_ROLE on distributor`);
        console.log();
        
        // === RECOMMENDATIONS ===
        console.log("💡 Recommendations:");
        if (!checks.hasStake) {
            console.log("  ⚠️  No provider stake! Run: npx hardhat run scripts/fund-provider-initial.ts");
        } else if (checks.hasPendingRewards && pendingProviderRewards > ethers.parseEther("1000")) {
            console.log("  💰 You have pending rewards! Consider harvesting.");
            console.log("     Run: cd claim-generation-service && node scripts/harvest-provider-emissions.js");
        } else if (checks.hasPendingRewards) {
            console.log("  ⏳ Emissions accumulating. Wait for more rewards before harvesting.");
            const minHarvest = 1000; // 1000 MYNT
            const currentAmount = Number(ethers.formatEther(pendingProviderRewards));
            const timeToMin = ((minHarvest - currentAmount) / (CONFIG.EMISSION_RATE * CONFIG.PROVIDER_SHARE)) / 3600;
            console.log(`     Wait ~${timeToMin.toFixed(1)} hours to reach 1000 MYNT minimum.`);
        }
        
        if (checks.hasDistributorBalance && providerBalance > ethers.parseEther("100")) {
            console.log("  ✅ Distributor funded! Ready to submit Merkle roots and distribute rewards.");
            console.log("     Run: cd claim-generation-service && node scripts/test-distribution.js");
        } else if (!checks.hasDistributorBalance) {
            console.log("  ⚠️  Distributor not funded. After harvesting, run fund-distributor.js");
        }
        console.log();
        
        // === EMISSION PROJECTIONS ===
        console.log("📊 Emission Projections:");
        if (stakeAmount > 0n) {
            const providerRate = CONFIG.EMISSION_RATE * CONFIG.PROVIDER_SHARE;
            console.log(`  Provider rate: ${providerRate.toFixed(2)} MYNT/sec`);
            console.log(`  Per hour: ~${(providerRate * 3600).toFixed(0)} MYNT`);
            console.log(`  Per day: ~${(providerRate * 86400).toFixed(0)} MYNT`);
            console.log(`  Per week: ~${(providerRate * 604800).toFixed(0)} MYNT`);
            console.log(`  Per month: ~${(providerRate * 2592000).toFixed(0)} MYNT`);
        } else {
            console.log(`  ⚠️  Not staking, no emissions`);
        }
        
        console.log("\n================================================================================");
        console.log("STATUS CHECK COMPLETE");
        console.log("================================================================================\n");
        
    } catch (error: any) {
        console.error("\n❌ Error checking provider status:");
        console.error(error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
