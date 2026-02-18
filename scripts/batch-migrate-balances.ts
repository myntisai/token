import { ethers } from "hardhat";

/**
 * BATCH MIGRATION - Feb 4, 2026
 * 
 * Uses migrateMint() function for efficient batch migration
 * 
 * Run: npx hardhat run scripts/batch-migrate-balances.ts --network base-sepolia
 */

const OLD_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const NEW_STAKING = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";
const PROVIDER_STAKE = ethers.parseEther("1000");

// Batch size for migration (to avoid gas limits)
const BATCH_SIZE = 20;

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("================================================================================");
    console.log("BATCH MIGRATION - OLD TOKEN → NEW TOKEN");
    console.log("================================================================================\n");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Old Token: ${OLD_MYNTIS}`);
    console.log(`New Token: ${NEW_MYNTIS}`);
    console.log(`Batch Size: ${BATCH_SIZE} holders per transaction\n`);
    
    const oldToken = await ethers.getContractAt("Myntis", OLD_MYNTIS);
    const newToken = await ethers.getContractAt("Myntis", NEW_MYNTIS);
    const staking = await ethers.getContractAt("DualPoolStaking", NEW_STAKING);
    
    // Check migration flag
    const migrationComplete = await newToken.migrationComplete();
    console.log(`Migration complete flag: ${migrationComplete}`);
    if (migrationComplete) {
        console.log("⚠️  Migration already marked as complete!");
        console.log("   Skipping balance migration, proceeding to provider setup...\n");
    }
    
    // ============================================================================
    // STEP 1: SCAN HOLDERS
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 1: SCANNING HOLDERS");
    console.log("================================================================================\n");
    
    console.log("📡 Scanning recent blocks for holders...");
    const latestBlock = await ethers.provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 100000);
    
    const holders = new Set<string>();
    const filter = oldToken.filters.Transfer();
    const chunkSize = 5000;
    let currentBlock = fromBlock;
    
    while (currentBlock <= latestBlock) {
        const toBlock = Math.min(currentBlock + chunkSize, latestBlock);
        console.log(`  Blocks ${currentBlock} - ${toBlock}...`);
        
        try {
            const events = await oldToken.queryFilter(filter, currentBlock, toBlock);
            for (const event of events) {
                if (event.args?.to && event.args.to !== ethers.ZeroAddress) holders.add(event.args.to);
                if (event.args?.from && event.args.from !== ethers.ZeroAddress) holders.add(event.args.from);
            }
            console.log(`    Found ${holders.size} unique addresses`);
        } catch (e: any) {
            console.warn(`    ⚠️  ${e.message.split('\n')[0]}`);
        }
        
        currentBlock = toBlock + 1;
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
    }
    
    console.log(`\n✅ Found ${holders.size} unique addresses\n`);
    
    // ============================================================================
    // STEP 2: GET BALANCES
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 2: FETCHING BALANCES");
    console.log("================================================================================\n");
    
    const holderBalances: { address: string; oldBalance: bigint; newBalance: bigint }[] = [];
    let totalOld = 0n;
    
    for (const address of holders) {
        const oldBalance = await oldToken.balanceOf(address);
        const newBalance = await newToken.balanceOf(address);
        
        if (oldBalance > 0n) {
            holderBalances.push({ address, oldBalance, newBalance });
            totalOld += oldBalance;
            
            if (oldBalance > ethers.parseEther("1000")) {
                console.log(`  ${address}: ${ethers.formatEther(oldBalance)} MYNT (new: ${ethers.formatEther(newBalance)})`);
            }
        }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`  Holders with balance: ${holderBalances.length}`);
    console.log(`  Total old supply: ${ethers.formatEther(totalOld)} MYNT\n`);
    
    if (holderBalances.length === 0) {
        console.log("ℹ️  No holders found, proceeding with provider setup only...\n");
    }
    
    // ============================================================================
    // STEP 3: BATCH MIGRATE (if not complete)
    // ============================================================================
    if (!migrationComplete && holderBalances.length > 0) {
        console.log("================================================================================");
        console.log("STEP 3: BATCH MIGRATION");
        console.log("================================================================================\n");
        
        // Filter holders that need migration
        const toMigrate = holderBalances.filter(h => h.newBalance < h.oldBalance);
        console.log(`Holders needing migration: ${toMigrate.length}/${holderBalances.length}\n`);
        
        let migratedCount = 0;
        let batchNum = 0;
        
        // Process in batches
        for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
            batchNum++;
            const batch = toMigrate.slice(i, i + BATCH_SIZE);
            const recipients: string[] = [];
            const amounts: bigint[] = [];
            
            for (const holder of batch) {
                const amountToMint = holder.oldBalance - holder.newBalance;
                recipients.push(holder.address);
                amounts.push(amountToMint);
            }
            
            console.log(`\n📦 Batch ${batchNum}: Migrating ${recipients.length} holders...`);
            const batchTotal = amounts.reduce((a, b) => a + b, 0n);
            console.log(`  Total in batch: ${ethers.formatEther(batchTotal)} MYNT`);
            
            try {
                // Use mintImmediate for each holder (owner-only, uses IMMEDIATE_ALLOCATION)
                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    const amount = amounts[j];
                    
                    console.log(`    Minting ${ethers.formatEther(amount)} MYNT to ${recipient}...`);
                    const tx = await newToken.mintImmediate(recipient, amount);
                    await tx.wait(1);
                    console.log(`      ✅ TX: ${tx.hash}`);
                    
                    migratedCount++;
                }
                
                console.log(`  ✅ Batch ${batchNum} complete!`);
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error: any) {
                console.error(`  ❌ Batch ${batchNum} failed: ${error.message}`);
                console.log(`  Continuing with next batch...`);
            }
        }
        
        console.log(`\n✅ Migration complete: ${migratedCount}/${toMigrate.length} holders\n`);
        
        // Mark migration complete
        console.log("🔒 Marking migration as complete...");
        const completeTx = await newToken.completeMigration();
        await completeTx.wait(1);
        console.log(`  ✅ Migration locked! TX: ${completeTx.hash}\n`);
    }
    
    // ============================================================================
    // STEP 4: PROVIDER REGISTRATION
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 4: PROVIDER REGISTRATION (1000 MYNT)");
    console.log("================================================================================\n");
    
    const providerInfo = await staking.getProviderInfo(deployer.address);
    const currentStake = providerInfo[0];
    
    console.log(`Current stake: ${ethers.formatEther(currentStake)} MYNT`);
    
    if (currentStake >= PROVIDER_STAKE) {
        console.log(`✅ Provider already staked!\n`);
    } else {
        const needed = PROVIDER_STAKE - currentStake;
        console.log(`Need to stake: ${ethers.formatEther(needed)} MYNT\n`);
        
        // Get balance
        const balance = await newToken.balanceOf(deployer.address);
        console.log(`Wallet balance: ${ethers.formatEther(balance)} MYNT`);
        
        // Mint if needed (use mintImmediate for provider)
        if (balance < needed) {
            console.log(`\n💰 Minting ${ethers.formatEther(needed)} MYNT via mintImmediate...`);
            const tx = await newToken.mintImmediate(deployer.address, needed);
            await tx.wait(1);
            console.log(`  ✅ Minted! TX: ${tx.hash}\n`);
        }
        
        // Approve
        console.log(`🔐 Approving staking contract...`);
        const approveTx = await newToken.approve(staking.target, needed);
        await approveTx.wait(1);
        console.log(`  ✅ Approved!\n`);
        
        // Stake
        console.log(`🔄 Staking to provider pool...`);
        const stakeTx = await staking.stakeToProviderPool(needed);
        await stakeTx.wait(1);
        console.log(`  ✅ Staked! TX: ${stakeTx.hash}\n`);
        
        // Verify
        const finalInfo = await staking.getProviderInfo(deployer.address);
        const userInfo = await staking.userInfo(deployer.address);
        console.log(`✅ Provider registered:`);
        console.log(`  Stake: ${ethers.formatEther(finalInfo[0])} MYNT`);
        console.log(`  Is Provider: ${userInfo.isProvider}\n`);
    }
    
    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log("================================================================================");
    console.log("✅ COMPLETE!");
    console.log("================================================================================\n");
    console.log("📊 Final Status:");
    
    const finalSupply = await newToken.totalSupply();
    const finalStake = await staking.getProviderInfo(deployer.address);
    
    console.log(`  New token supply: ${ethers.formatEther(finalSupply)} MYNT`);
    console.log(`  Provider stake: ${ethers.formatEther(finalStake[0])} MYNT`);
    console.log(`  Migration complete: ${await newToken.migrationComplete()}\n`);
    
    console.log("🎯 Next steps:");
    console.log("  1. Verify: npx hardhat run scripts/check-provider-status.ts --network base-sepolia");
    console.log("  2. Update docs: CONTRACT_DEPLOYMENT_HISTORY.md");
    console.log("  3. Wait 1h for emissions");
    console.log("  4. Distribute: node scripts/oneoff-distribute-staking-pending.js\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
