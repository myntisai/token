import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * SIMPLE MIGRATION - Feb 4, 2026
 * 
 * Migrates balances from a predefined list of holders
 * (avoids RPC event scanning issues)
 * 
 * Run: npx hardhat run scripts/migrate-balances-simple.ts --network base-sepolia
 */

// Contract addresses
const OLD_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const NEW_STAKING = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";
const PROVIDER_STAKE = ethers.parseEther("1000");

// Known holder addresses (from previous snapshots/monitoring)
// If you don't have a list, this will scan recent blocks only
const KNOWN_HOLDERS: string[] = [
    // Add known holder addresses here
    // Or leave empty to do a quick scan of recent blocks
];

async function getRecentHolders(token: any, fromBlock: number): Promise<Set<string>> {
    console.log(`📡 Scanning blocks ${fromBlock} to latest for Transfer events...`);
    const holders = new Set<string>();
    
    try {
        const filter = token.filters.Transfer();
        const latestBlock = await ethers.provider.getBlockNumber();
        
        // Scan in chunks to avoid RPC limits
        const chunkSize = 5000;
        let currentBlock = fromBlock;
        
        while (currentBlock <= latestBlock) {
            const toBlock = Math.min(currentBlock + chunkSize, latestBlock);
            console.log(`  Scanning blocks ${currentBlock} - ${toBlock}...`);
            
            try {
                const events = await token.queryFilter(filter, currentBlock, toBlock);
                
                for (const event of events) {
                    if (event.args && event.args.to && event.args.to !== ethers.ZeroAddress) {
                        holders.add(event.args.to);
                    }
                    if (event.args && event.args.from && event.args.from !== ethers.ZeroAddress) {
                        holders.add(event.args.from);
                    }
                }
                
                console.log(`    Found ${holders.size} unique addresses so far`);
            } catch (e: any) {
                console.warn(`    ⚠️  Error scanning blocks ${currentBlock}-${toBlock}: ${e.message}`);
                // Continue with next chunk
            }
            
            currentBlock = toBlock + 1;
        }
    } catch (e: any) {
        console.warn(`⚠️  Error during scan: ${e.message}`);
    }
    
    return holders;
}

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("================================================================================");
    console.log("SIMPLE MIGRATION - OLD TOKEN → NEW TOKEN");
    console.log("================================================================================\n");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Old Token: ${OLD_MYNTIS}`);
    console.log(`New Token: ${NEW_MYNTIS}`);
    console.log(`Provider Stake: ${ethers.formatEther(PROVIDER_STAKE)} MYNT\n`);
    
    // Get contract instances
    const oldToken = await ethers.getContractAt("Myntis", OLD_MYNTIS);
    const newToken = await ethers.getContractAt("Myntis", NEW_MYNTIS);
    const staking = await ethers.getContractAt("DualPoolStaking", NEW_STAKING);
    
    // ============================================================================
    // STEP 1: GET HOLDER LIST
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 1: GETTING HOLDER LIST");
    console.log("================================================================================\n");
    
    let holderAddresses: Set<string>;
    
    if (KNOWN_HOLDERS.length > 0) {
        console.log(`Using predefined list of ${KNOWN_HOLDERS.length} holders\n`);
        holderAddresses = new Set(KNOWN_HOLDERS);
    } else {
        console.log("No predefined list, scanning recent blocks...\n");
        // Get old token deployment block (or use a recent block)
        const latestBlock = await ethers.provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 100000); // Last ~100k blocks
        
        holderAddresses = await getRecentHolders(oldToken, fromBlock);
        console.log(`\nFound ${holderAddresses.size} unique addresses\n`);
    }
    
    // Get balances for all holders
    console.log("💰 Fetching current balances...");
    const holders: { address: string; balance: bigint }[] = [];
    let totalSupply = 0n;
    
    for (const address of holderAddresses) {
        try {
            const balance = await oldToken.balanceOf(address);
            if (balance > 0n) {
                holders.push({ address, balance });
                totalSupply += balance;
                console.log(`  ${address}: ${ethers.formatEther(balance)} MYNT`);
            }
        } catch (e: any) {
            console.warn(`  ⚠️  Error getting balance for ${address}: ${e.message}`);
        }
    }
    
    console.log(`\n📊 Found ${holders.length} holders with balances`);
    console.log(`Total supply: ${ethers.formatEther(totalSupply)} MYNT\n`);
    
    if (holders.length === 0) {
        console.log("⚠️  No holders found! Either:");
        console.log("  1. Old token has no holders (fresh start)");
        console.log("  2. RPC issues prevented scanning");
        console.log("  3. Need to add KNOWN_HOLDERS list to script\n");
        console.log("Proceeding with provider registration only...\n");
    }
    
    // ============================================================================
    // STEP 2: MIGRATE BALANCES
    // ============================================================================
    if (holders.length > 0) {
        console.log("================================================================================");
        console.log("STEP 2: MIGRATING BALANCES");
        console.log("================================================================================\n");
        
        let migratedCount = 0;
        let migratedTotal = 0n;
        const errors: { address: string; error: string }[] = [];
        
        for (const holder of holders) {
            try {
                // Check if already migrated
                const newBalance = await newToken.balanceOf(holder.address);
                if (newBalance >= holder.balance) {
                    console.log(`  ⏭️  ${holder.address} already has ${ethers.formatEther(newBalance)} MYNT`);
                    migratedCount++;
                    migratedTotal += holder.balance;
                    continue;
                }
                
                // Mint to holder
                const amountToMint = holder.balance - newBalance;
                console.log(`  💸 Minting ${ethers.formatEther(amountToMint)} MYNT to ${holder.address}...`);
                
                const tx = await newToken.mint(holder.address, amountToMint);
                await tx.wait(1);
                console.log(`     ✅ TX: ${tx.hash}`);
                
                migratedCount++;
                migratedTotal += amountToMint;
                
                // Small delay to avoid nonce issues
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error: any) {
                console.error(`     ❌ Error: ${error.message}`);
                errors.push({ address: holder.address, error: error.message });
            }
        }
        
        console.log(`\n✅ Migration complete:`);
        console.log(`  Migrated: ${migratedCount}/${holders.length} holders`);
        console.log(`  Total migrated: ${ethers.formatEther(migratedTotal)} MYNT`);
        if (errors.length > 0) {
            console.log(`  Errors: ${errors.length}`);
        }
        console.log();
    }
    
    // ============================================================================
    // STEP 3: PROVIDER REGISTRATION (1000 MYNT)
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 3: PROVIDER REGISTRATION (1000 MYNT STAKE)");
    console.log("================================================================================\n");
    
    // Check current stake
    const providerInfo = await staking.getProviderInfo(deployer.address);
    const currentStake = providerInfo[0];
    
    console.log(`Current provider stake: ${ethers.formatEther(currentStake)} MYNT`);
    
    if (currentStake >= PROVIDER_STAKE) {
        console.log(`✅ Provider already staked: ${ethers.formatEther(currentStake)} MYNT\n`);
    } else {
        const amountToStake = PROVIDER_STAKE - currentStake;
        console.log(`Need to stake: ${ethers.formatEther(amountToStake)} MYNT\n`);
        
        // Check balance
        const providerBalance = await newToken.balanceOf(deployer.address);
        console.log(`Provider wallet balance: ${ethers.formatEther(providerBalance)} MYNT`);
        
        if (providerBalance < amountToStake) {
            const amountToMint = amountToStake - providerBalance;
            console.log(`\n💰 Minting ${ethers.formatEther(amountToMint)} MYNT to provider...`);
            const mintTx = await newToken.mint(deployer.address, amountToMint);
            await mintTx.wait(1);
            console.log(`  ✅ Minted! TX: ${mintTx.hash}\n`);
        }
        
        // Approve
        console.log(`🔐 Approving staking contract for ${ethers.formatEther(amountToStake)} MYNT...`);
        const approveTx = await newToken.approve(staking.target, amountToStake);
        await approveTx.wait(1);
        console.log(`  ✅ Approved! TX: ${approveTx.hash}\n`);
        
        // Stake
        console.log(`🔄 Staking to provider pool...`);
        const stakeTx = await staking.stakeToProviderPool(amountToStake);
        await stakeTx.wait(1);
        console.log(`  ✅ Staked! TX: ${stakeTx.hash}\n`);
        
        // Verify
        const finalInfo = await staking.getProviderInfo(deployer.address);
        const finalStake = finalInfo[0];
        const userInfo = await staking.userInfo(deployer.address);
        
        console.log(`✅ Provider registered:`);
        console.log(`  Stake: ${ethers.formatEther(finalStake)} MYNT`);
        console.log(`  Is Provider: ${userInfo.isProvider}`);
        console.log(`  Timestamp: ${new Date(Number(userInfo.lastStakeTime) * 1000).toISOString()}\n`);
    }
    
    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log("================================================================================");
    console.log("✅ MIGRATION COMPLETE!");
    console.log("================================================================================\n");
    console.log("📊 Summary:");
    console.log(`  Holders scanned: ${holders.length}`);
    console.log(`  Provider stake: ${ethers.formatEther(PROVIDER_STAKE)} MYNT`);
    console.log(`  Status: Ready for distribution\n`);
    
    console.log("🎯 Next steps:");
    console.log("  1. Verify: npx hardhat run scripts/check-provider-status.ts --network base-sepolia");
    console.log("  2. Wait 1 hour for emissions to accumulate");
    console.log("  3. Distribute: cd claim-generation-service && node scripts/oneoff-distribute-staking-pending.js\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
