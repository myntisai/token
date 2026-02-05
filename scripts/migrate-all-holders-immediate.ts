import { ethers } from "hardhat";

/**
 * MIGRATE ALL HOLDERS - Using mintImmediate
 * 
 * Now that TOKEN_ROLE is granted, migrate all holders from old to new token
 * 
 * Run: npx hardhat run scripts/migrate-all-holders-immediate.ts --network base-sepolia
 */

const OLD_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const NEW_STAKING = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";
const PROVIDER_STAKE = ethers.parseEther("1000");

// Delay between mints to avoid nonce issues
const MINT_DELAY = 1500; // ms

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("================================================================================");
    console.log("MIGRATE ALL HOLDERS - mintImmediate");
    console.log("================================================================================\n");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Old Token: ${OLD_MYNTIS}`);
    console.log(`New Token: ${NEW_MYNTIS}\n`);
    
    const oldToken = await ethers.getContractAt("Myntis", OLD_MYNTIS);
    const newToken = await ethers.getContractAt("Myntis", NEW_MYNTIS);
    const staking = await ethers.getContractAt("DualPoolStaking", NEW_STAKING);
    
    // ============================================================================
    // STEP 1: SCAN HOLDERS
    // ============================================================================
    console.log("📡 Scanning for holders...");
    const latestBlock = await ethers.provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 100000);
    
    const holderSet = new Set<string>();
    const filter = oldToken.filters.Transfer();
    const chunkSize = 5000;
    
    for (let block = fromBlock; block <= latestBlock; block += chunkSize) {
        const toBlock = Math.min(block + chunkSize, latestBlock);
        try {
            const events = await oldToken.queryFilter(filter, block, toBlock);
            for (const event of events) {
                if (event.args?.to && event.args.to !== ethers.ZeroAddress) holderSet.add(event.args.to);
                if (event.args?.from && event.args.from !== ethers.ZeroAddress) holderSet.add(event.args.from);
            }
            console.log(`  Blocks ${block}-${toBlock}: ${holderSet.size} addresses`);
        } catch (e: any) {
            console.warn(`  ⚠️  Blocks ${block}-${toBlock}: ${e.message.split('\n')[0]}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`\n✅ Found ${holderSet.size} unique addresses\n`);
    
    // ============================================================================
    // STEP 2: GET BALANCES
    // ============================================================================
    console.log("💰 Fetching balances...");
    const holders: { address: string; old: bigint; new: bigint }[] = [];
    
    for (const addr of holderSet) {
        const oldBal = await oldToken.balanceOf(addr);
        const newBal = await newToken.balanceOf(addr);
        
        if (oldBal > 0n) {
            holders.push({ address: addr, old: oldBal, new: newBal });
            if (oldBal > ethers.parseEther("50000")) {
                console.log(`  ${addr}: ${ethers.formatEther(oldBal)} MYNT (new: ${ethers.formatEther(newBal)})`);
            }
        }
    }
    
    const totalOld = holders.reduce((sum, h) => sum + h.old, 0n);
    console.log(`\n📊 ${holders.length} holders, ${ethers.formatEther(totalOld)} MYNT total\n`);
    
    // ============================================================================
    // STEP 3: MIGRATE
    // ============================================================================
    console.log("================================================================================");
    console.log("MIGRATING BALANCES");
    console.log("================================================================================\n");
    
    const toMigrate = holders.filter(h => h.new < h.old);
    console.log(`Need to migrate: ${toMigrate.length}/${holders.length} holders\n`);
    
    let migrated = 0;
    let totalMigrated = 0n;
    
    for (const holder of toMigrate) {
        const amount = holder.old - holder.new;
        
        try {
            console.log(`[${migrated + 1}/${toMigrate.length}] ${holder.address}: ${ethers.formatEther(amount)} MYNT`);
            const tx = await newToken.mintImmediate(holder.address, amount);
            await tx.wait(1);
            console.log(`  ✅ TX: ${tx.hash}`);
            
            migrated++;
            totalMigrated += amount;
            
            // Progress update every 10
            if (migrated % 10 === 0) {
                console.log(`\n  Progress: ${migrated}/${toMigrate.length} (${ethers.formatEther(totalMigrated)} MYNT)\n`);
            }
            
            await new Promise(r => setTimeout(r, MINT_DELAY));
            
        } catch (error: any) {
            console.error(`  ❌ Failed: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Migration complete: ${migrated}/${toMigrate.length} holders`);
    console.log(`Total migrated: ${ethers.formatEther(totalMigrated)} MYNT\n`);
    
    // ============================================================================
    // STEP 4: PROVIDER STAKE
    // ============================================================================
    console.log("================================================================================");
    console.log("PROVIDER REGISTRATION");
    console.log("================================================================================\n");
    
    const providerInfo = await staking.getProviderInfo(deployer.address);
    const currentStake = providerInfo[0];
    
    console.log(`Current stake: ${ethers.formatEther(currentStake)} MYNT`);
    
    if (currentStake >= PROVIDER_STAKE) {
        console.log(`✅ Provider already staked!\n`);
    } else {
        const needed = PROVIDER_STAKE;
        const balance = await newToken.balanceOf(deployer.address);
        
        console.log(`Wallet balance: ${ethers.formatEther(balance)} MYNT`);
        console.log(`Need to stake: ${ethers.formatEther(needed)} MYNT\n`);
        
        if (balance < needed) {
            console.log(`💰 Minting ${ethers.formatEther(needed)} MYNT...`);
            const mintTx = await newToken.mintImmediate(deployer.address, needed);
            await mintTx.wait(1);
            console.log(`  ✅ Minted! TX: ${mintTx.hash}\n`);
        }
        
        console.log(`🔐 Approving ${ethers.formatEther(needed)} MYNT...`);
        const approveTx = await newToken.approve(staking.target, needed);
        await approveTx.wait(1);
        console.log(`  ✅ Approved!\n`);
        
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
    const finalSupply = await newToken.totalSupply();
    const finalImmediate = await newToken.totalMintedImmediate();
    
    console.log("================================================================================");
    console.log("✅ COMPLETE!");
    console.log("================================================================================\n");
    console.log("📊 Final Status:");
    console.log(`  Total supply: ${ethers.formatEther(finalSupply)} MYNT`);
    console.log(`  Immediate minted: ${ethers.formatEther(finalImmediate)} / 200M`);
    console.log(`  Holders migrated: ${migrated}`);
    console.log(`  Provider stake: ${ethers.formatEther(PROVIDER_STAKE)} MYNT\n`);
    
    console.log("🎯 Next:");
    console.log("  1. Verify: npx hardhat run scripts/check-provider-status.ts --network base-sepolia");
    console.log("  2. Check balances on Basescan");
    console.log("  3. Wait 1h for emissions");
    console.log("  4. Distribute: node scripts/oneoff-distribute-staking-pending.js\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
