import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * FULL MIGRATION SCRIPT - Feb 4, 2026 Deployment
 * 
 * This script:
 * 1. Snapshots all holders from old Myntis token
 * 2. Mints equivalent balances on new token
 * 3. Stakes 1000 MYNT for provider registration
 * 4. Generates migration report
 * 
 * Run: npx hardhat run scripts/full-migration-with-provider.ts --network base-sepolia
 */

// Old and new addresses
const OLD_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const NEW_STAKING = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";

// Provider stake amount (1000 MYNT, not 100k)
const PROVIDER_STAKE = ethers.parseEther("1000");

interface HolderBalance {
    address: string;
    balance: bigint;
}

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("================================================================================");
    console.log("FULL MIGRATION - OLD TOKEN → NEW TOKEN");
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
    // STEP 1: SNAPSHOT OLD TOKEN HOLDERS
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 1: SNAPSHOTTING OLD TOKEN HOLDERS");
    console.log("================================================================================\n");
    
    const holders: HolderBalance[] = [];
    let totalSupply = 0n;
    
    // Get Transfer events to find all holders
    console.log("📡 Fetching Transfer events from old token...");
    const filter = oldToken.filters.Transfer();
    const events = await oldToken.queryFilter(filter, 0, "latest");
    
    // Collect unique addresses
    const uniqueAddresses = new Set<string>();
    for (const event of events) {
        if (event.args && event.args.to) {
            uniqueAddresses.add(event.args.to);
        }
        if (event.args && event.args.from && event.args.from !== ethers.ZeroAddress) {
            uniqueAddresses.add(event.args.from);
        }
    }
    
    console.log(`  Found ${uniqueAddresses.size} unique addresses\n`);
    
    // Get balances for each holder
    console.log("💰 Fetching balances...");
    for (const address of uniqueAddresses) {
        const balance = await oldToken.balanceOf(address);
        if (balance > 0n) {
            holders.push({ address, balance });
            totalSupply += balance;
            console.log(`  ${address}: ${ethers.formatEther(balance)} MYNT`);
        }
    }
    
    console.log(`\n📊 Snapshot complete:`);
    console.log(`  Total holders: ${holders.length}`);
    console.log(`  Total supply: ${ethers.formatEther(totalSupply)} MYNT\n`);
    
    // Sort by balance (largest first)
    holders.sort((a, b) => Number(b.balance - a.balance));
    
    // ============================================================================
    // STEP 2: MIGRATE BALANCES TO NEW TOKEN
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 2: MIGRATING BALANCES TO NEW TOKEN");
    console.log("================================================================================\n");
    
    let migratedCount = 0;
    let migratedTotal = 0n;
    const errors: { address: string; error: string }[] = [];
    
    for (const holder of holders) {
        try {
            // Check if already has balance on new token
            const existingBalance = await newToken.balanceOf(holder.address);
            if (existingBalance > 0n) {
                console.log(`  ⏭️  ${holder.address} already has ${ethers.formatEther(existingBalance)} MYNT, skipping`);
                migratedCount++;
                migratedTotal += holder.balance;
                continue;
            }
            
            // Mint to holder
            console.log(`  💸 Minting ${ethers.formatEther(holder.balance)} MYNT to ${holder.address}...`);
            const tx = await newToken.mint(holder.address, holder.balance);
            await tx.wait(1);
            console.log(`     ✅ TX: ${tx.hash}`);
            
            migratedCount++;
            migratedTotal += holder.balance;
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
    
    // ============================================================================
    // STEP 3: STAKE FOR PROVIDER REGISTRATION
    // ============================================================================
    console.log("================================================================================");
    console.log("STEP 3: PROVIDER REGISTRATION (1000 MYNT STAKE)");
    console.log("================================================================================\n");
    
    // Check if provider already staked
    const providerInfo = await staking.getProviderInfo(deployer.address);
    const currentStake = providerInfo[0];
    
    if (currentStake >= PROVIDER_STAKE) {
        console.log(`✅ Provider already staked: ${ethers.formatEther(currentStake)} MYNT`);
    } else {
        const amountToStake = PROVIDER_STAKE - currentStake;
        
        // Check provider balance
        const providerBalance = await newToken.balanceOf(deployer.address);
        console.log(`Provider wallet balance: ${ethers.formatEther(providerBalance)} MYNT`);
        
        if (providerBalance < amountToStake) {
            console.log(`\n💰 Minting ${ethers.formatEther(amountToStake)} MYNT to provider...`);
            const mintTx = await newToken.mint(deployer.address, amountToStake);
            await mintTx.wait(1);
            console.log(`  ✅ Minted! TX: ${mintTx.hash}\n`);
        }
        
        // Approve staking contract
        console.log(`🔐 Approving staking contract...`);
        const approveTx = await newToken.approve(staking.target, amountToStake);
        await approveTx.wait(1);
        console.log(`  ✅ Approved! TX: ${approveTx.hash}\n`);
        
        // Stake to provider pool
        console.log(`🔄 Staking ${ethers.formatEther(amountToStake)} MYNT to provider pool...`);
        const stakeTx = await staking.stakeToProviderPool(amountToStake);
        await stakeTx.wait(1);
        console.log(`  ✅ Staked! TX: ${stakeTx.hash}\n`);
        
        // Verify
        const finalInfo = await staking.getProviderInfo(deployer.address);
        const finalStake = finalInfo[0];
        console.log(`✅ Provider stake: ${ethers.formatEther(finalStake)} MYNT`);
    }
    
    // ============================================================================
    // STEP 4: GENERATE MIGRATION REPORT
    // ============================================================================
    console.log("\n================================================================================");
    console.log("STEP 4: GENERATING MIGRATION REPORT");
    console.log("================================================================================\n");
    
    const report = {
        timestamp: new Date().toISOString(),
        oldToken: OLD_MYNTIS,
        newToken: NEW_MYNTIS,
        staking: NEW_STAKING,
        migration: {
            totalHolders: holders.length,
            migratedHolders: migratedCount,
            totalSupply: ethers.formatEther(totalSupply),
            migratedSupply: ethers.formatEther(migratedTotal),
            errors: errors.length
        },
        provider: {
            address: deployer.address,
            stake: ethers.formatEther(PROVIDER_STAKE),
            finalStake: ethers.formatEther(currentStake)
        },
        holders: holders.map(h => ({
            address: h.address,
            balance: ethers.formatEther(h.balance)
        })),
        errors: errors
    };
    
    // Save report
    const reportDir = path.join(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, `migration-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved: ${reportFile}\n`);
    
    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log("================================================================================");
    console.log("✅ MIGRATION COMPLETE!");
    console.log("================================================================================\n");
    console.log("📊 Summary:");
    console.log(`  Old token holders: ${holders.length}`);
    console.log(`  Migrated holders: ${migratedCount}`);
    console.log(`  Total migrated: ${ethers.formatEther(migratedTotal)} MYNT`);
    console.log(`  Provider stake: ${ethers.formatEther(PROVIDER_STAKE)} MYNT`);
    console.log(`  Errors: ${errors.length}\n`);
    
    if (errors.length > 0) {
        console.log("⚠️  Errors encountered:");
        errors.forEach(e => console.log(`  - ${e.address}: ${e.error}`));
        console.log();
    }
    
    console.log("🎯 Next steps:");
    console.log("  1. Review migration report");
    console.log("  2. Update production .env files");
    console.log("  3. Update CONTRACT_DEPLOYMENT_HISTORY.md");
    console.log("  4. Test frontend with new addresses");
    console.log("  5. Start reward distribution\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
