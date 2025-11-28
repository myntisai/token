import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("📊 QUERYING ALL AI PROVIDERS AND STAKING AMOUNTS\n");
    console.log("=".repeat(80));

    // Try to get from env, fallback to common testnet address
    const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e";
    
    if (!ethers.isAddress(STAKING_CONTRACT_ADDRESS)) {
        throw new Error("Invalid STAKING_CONTRACT_ADDRESS");
    }

    console.log(`Staking Contract: ${STAKING_CONTRACT_ADDRESS}\n`);

    // Get the contract instance
    const StakingFactory = await ethers.getContractFactory("StakingContract");
    const staking = StakingFactory.attach(STAKING_CONTRACT_ADDRESS);

    // Get total staked amount
    const totalStaked = await staking.getTotalStaked();
    console.log(`💰 Total Staked: ${ethers.formatEther(totalStaked)} MYNT\n`);

    // Get all providers by querying the allProviders array
    // We'll query indices until we get an error or find all providers
    const providers: string[] = [];
    let index = 0;
    let hasMore = true;

    console.log("🔍 Fetching provider addresses...");
    while (hasMore) {
        try {
            const providerAddress = await staking.allProviders(index);
            if (providerAddress && providerAddress !== ethers.ZeroAddress) {
                providers.push(providerAddress);
                index++;
            } else {
                hasMore = false;
            }
        } catch (error: any) {
            // If we get an error, we've reached the end of the array
            hasMore = false;
        }
    }

    console.log(`Found ${providers.length} provider(s)\n`);

    if (providers.length === 0) {
        console.log("❌ No providers found in the staking contract.");
        return;
    }

    // Get stake info for each provider
    console.log("=".repeat(80));
    console.log("📋 PROVIDER DETAILS:\n");

    let totalVerifiedStake = 0n;
    const providerData: Array<{ address: string; stake: bigint; stakeFormatted: string }> = [];

    for (let i = 0; i < providers.length; i++) {
        const providerAddress = providers[i];
        try {
            const [stake, rewardDebt] = await staking.getProviderInfo(providerAddress);
            const stakeFormatted = ethers.formatEther(stake);
            
            providerData.push({
                address: providerAddress,
                stake: stake,
                stakeFormatted: stakeFormatted
            });

            totalVerifiedStake += stake;

            console.log(`Provider ${i + 1}:`);
            console.log(`  Address: ${providerAddress}`);
            console.log(`  Stake: ${stakeFormatted} MYNT`);
            console.log(`  Reward Debt: ${ethers.formatEther(rewardDebt)} MYNT`);
            console.log();
        } catch (error: any) {
            console.log(`Provider ${i + 1}:`);
            console.log(`  Address: ${providerAddress}`);
            console.log(`  ⚠️  Error fetching info: ${error.message}`);
            console.log();
        }
    }

    // Summary
    console.log("=".repeat(80));
    console.log("📊 SUMMARY:\n");
    console.log(`Total Providers: ${providers.length}`);
    console.log(`Total Staked (from contract): ${ethers.formatEther(totalStaked)} MYNT`);
    console.log(`Total Staked (sum of providers): ${ethers.formatEther(totalVerifiedStake)} MYNT`);
    
    if (totalStaked !== totalVerifiedStake) {
        console.log(`⚠️  Warning: Sum of provider stakes (${ethers.formatEther(totalVerifiedStake)}) does not match totalStake (${ethers.formatEther(totalStaked)})`);
    }

    // Sort by stake amount (descending)
    providerData.sort((a, b) => {
        if (a.stake > b.stake) return -1;
        if (a.stake < b.stake) return 1;
        return 0;
    });

    if (providerData.length > 0) {
        console.log("\n🏆 TOP STAKERS:\n");
        providerData.forEach((provider, index) => {
            console.log(`${index + 1}. ${provider.address}: ${provider.stakeFormatted} MYNT`);
        });
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ Query complete!\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

