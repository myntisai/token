import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

/**
 * Balance Snapshot Script for Migration
 * 
 * This script snapshots all token holder balances from an existing contract
 * for migration to a new contract.
 * 
 * Usage:
 *   npx hardhat run scripts/snapshot-balances-for-migration.ts --network base-sepolia
 * 
 * Environment Variables Required:
 *   OLD_TOKEN_ADDRESS - Address of the old Myntis contract
 *   OLD_STAKING_ADDRESS (optional) - Address of the old staking contract
 */

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const CONFIG = {
    OLD_TOKEN_ADDRESS: process.env.OLD_TOKEN_ADDRESS || "",
    OLD_STAKING_ADDRESS: process.env.OLD_STAKING_ADDRESS || "",
    OUTPUT_FILE: path.join(__dirname, "../deployments/migration-snapshot-latest.json"),
};

interface HolderBalance {
    address: string;
    balance: string;
    balanceWei: string;
}

interface SnapshotResult {
    timestamp: string;
    blockNumber: number;
    oldTokenAddress: string;
    oldStakingAddress: string;
    holders: HolderBalance[];
    totalHolders: number;
    totalSupply: string;
    totalSupplyWei: string;
    stakingStats?: {
        totalStaked: string;
        totalStakedWei: string;
        stakerCount: number;
    };
}

async function main() {
    console.log("=".repeat(80));
    console.log("BALANCE SNAPSHOT FOR MIGRATION");
    console.log("=".repeat(80));
    
    if (!CONFIG.OLD_TOKEN_ADDRESS) {
        throw new Error("OLD_TOKEN_ADDRESS not set in environment variables");
    }
    
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const blockNumber = await ethers.provider.getBlockNumber();
    
    console.log(`\n📍 Snapshot Address: ${deployer.address}`);
    console.log(`🌐 Network: ${process.env.HARDHAT_NETWORK || "unknown"}`);
    console.log(`🔗 Chain ID: ${network.chainId}`);
    console.log(`📦 Block Number: ${blockNumber}`);
    console.log(`🪙 Old Token: ${CONFIG.OLD_TOKEN_ADDRESS}`);
    if (CONFIG.OLD_STAKING_ADDRESS) {
        console.log(`🥩 Old Staking: ${CONFIG.OLD_STAKING_ADDRESS}`);
    }
    
    // Attach to old token contract
    const oldToken = await ethers.getContractAt("Myntis", CONFIG.OLD_TOKEN_ADDRESS);
    
    // Get total supply
    const totalSupply = await oldToken.totalSupply();
    console.log(`\n💎 Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);
    
    // Get all Transfer events to find holders
    console.log(`\n📡 Fetching Transfer events...`);
    const filter = oldToken.filters.Transfer();
    const events = await oldToken.queryFilter(filter, 0, blockNumber);
    console.log(`  Found ${events.length} Transfer events`);
    
    // Build set of unique addresses
    const uniqueAddresses = new Set<string>();
    for (const event of events) {
        if (event.args && event.args.from) uniqueAddresses.add(event.args.from);
        if (event.args && event.args.to) uniqueAddresses.add(event.args.to);
    }
    
    // Remove zero address
    uniqueAddresses.delete(ethers.ZeroAddress);
    
    console.log(`  Found ${uniqueAddresses.size} unique addresses`);
    
    // Fetch balances for all holders
    console.log(`\n💰 Fetching balances for all holders...`);
    const holders: HolderBalance[] = [];
    let processed = 0;
    
    for (const address of uniqueAddresses) {
        const balance = await oldToken.balanceOf(address);
        
        if (balance > 0n) {
            holders.push({
                address: address,
                balance: ethers.formatEther(balance),
                balanceWei: balance.toString(),
            });
        }
        
        processed++;
        if (processed % 100 === 0) {
            console.log(`  Processed ${processed}/${uniqueAddresses.size} addresses...`);
        }
    }
    
    // Sort by balance (descending)
    holders.sort((a, b) => {
        const balanceA = BigInt(a.balanceWei);
        const balanceB = BigInt(b.balanceWei);
        return balanceA > balanceB ? -1 : balanceA < balanceB ? 1 : 0;
    });
    
    console.log(`\n✅ Found ${holders.length} holders with non-zero balances`);
    
    // Verify total
    const calculatedTotal = holders.reduce((sum, h) => sum + BigInt(h.balanceWei), 0n);
    console.log(`📊 Calculated Total: ${ethers.formatEther(calculatedTotal)} MYNT`);
    console.log(`📊 Contract Total: ${ethers.formatEther(totalSupply)} MYNT`);
    console.log(`📊 Difference: ${ethers.formatEther(totalSupply - calculatedTotal)} MYNT`);
    
    // Optional: Fetch staking stats
    let stakingStats;
    if (CONFIG.OLD_STAKING_ADDRESS) {
        console.log(`\n🥩 Fetching staking stats...`);
        try {
            const oldStaking = await ethers.getContractAt("DualPoolStaking", CONFIG.OLD_STAKING_ADDRESS);
            const stakedBalance = await oldToken.balanceOf(CONFIG.OLD_STAKING_ADDRESS);
            
            // Get unique stakers from Staked events
            const stakeFilter = oldStaking.filters.Staked();
            const stakeEvents = await oldStaking.queryFilter(stakeFilter, 0, blockNumber);
            const uniqueStakers = new Set(stakeEvents.map(e => e.args?.user).filter(Boolean));
            
            stakingStats = {
                totalStaked: ethers.formatEther(stakedBalance),
                totalStakedWei: stakedBalance.toString(),
                stakerCount: uniqueStakers.size,
            };
            
            console.log(`  Total Staked: ${stakingStats.totalStaked} MYNT`);
            console.log(`  Unique Stakers: ${stakingStats.stakerCount}`);
        } catch (error) {
            console.log(`  ⚠️  Failed to fetch staking stats: ${(error as Error).message}`);
        }
    }
    
    // Prepare snapshot result
    const snapshot: SnapshotResult = {
        timestamp: new Date().toISOString(),
        blockNumber: blockNumber,
        oldTokenAddress: CONFIG.OLD_TOKEN_ADDRESS,
        oldStakingAddress: CONFIG.OLD_STAKING_ADDRESS || "",
        holders: holders,
        totalHolders: holders.length,
        totalSupply: ethers.formatEther(totalSupply),
        totalSupplyWei: totalSupply.toString(),
        stakingStats: stakingStats,
    };
    
    // Save snapshot
    const outputDir = path.dirname(CONFIG.OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(snapshot, null, 2));
    console.log(`\n📄 Snapshot saved to: ${CONFIG.OUTPUT_FILE}`);
    
    // Also save with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const timestampedFile = path.join(outputDir, `migration-snapshot-${timestamp}.json`);
    fs.writeFileSync(timestampedFile, JSON.stringify(snapshot, null, 2));
    console.log(`📄 Timestamped snapshot saved to: ${timestampedFile}`);
    
    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("✅ SNAPSHOT COMPLETE!");
    console.log("=".repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`  Total Holders: ${snapshot.totalHolders}`);
    console.log(`  Total Supply: ${snapshot.totalSupply} MYNT`);
    if (stakingStats) {
        console.log(`  Total Staked: ${stakingStats.totalStaked} MYNT`);
        console.log(`  Unique Stakers: ${stakingStats.stakerCount}`);
    }
    
    console.log(`\n📋 Top 10 Holders:`);
    holders.slice(0, 10).forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.address.slice(0, 10)}... : ${parseFloat(h.balance).toFixed(2)} MYNT`);
    });
    
    console.log(`\n✅ Ready for migration!`);
    console.log(`   Use this snapshot with deploy-final-testnet-fresh.ts`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
