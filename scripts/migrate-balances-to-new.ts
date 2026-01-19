import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Old token to migrate FROM (from snapshot)
const OLD_TOKEN = "0x5242925C716225C58459f557E5B4Be51373aB767";

// New token to migrate TO
const NEW_TOKEN = process.env.NEW_MYNTIS_TOKEN || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";

// Protocol contracts to EXCLUDE from migration (don't mint to old contracts)
const EXCLUDED_ADDRESSES = [
  // Old contracts from previous deployment
  "0x26B9c344a5245f7402f047F622F57be9E3975718", // Original MerkleDistributor
  "0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16", // Latest old MerkleDistributor
  "0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e", // Old StakingContract
  "0x56Ad5c5285d036833828886108b733873345E86b", // Old EmissionsContract
  "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1", // GlobalNullifier
  "0x1CE9AbFe9810D1FdBd92754714dE0286EE8a58D5", // Wrong-Wallet Hub (Dec 26)
  "0x71EfdD04D6de862F68AC9B24282B0555Ca0e4b9A", // Wrong-Wallet Spoke (Dec 26)
  "0x0000000000000000000000000000000000000000", // Zero address
  // Previous "current" contracts that are now being replaced
  "0x5242925C716225C58459f557E5B4Be51373aB767", // Old Myntis token itself
  "0x45E241a5018b61BBCA454F88C23363971A13bA96", // Old GlobalSupplyRegistry
  "0x8D7817B77692Ad0B1D0D399F889A3158104291a5", // Old DualPoolStaking
  "0x6Dc42e62024F3f18d6fD91F662C19850c1BFD978", // Old EmissionsContract
  "0xa8699B994A2f5DAf5FA5B42bCDe9CBe75a52E6be", // Old LiquidStakingVault
  "0xf74dF81441D120E4e4EF1c5bCa9bcde6f44256C8", // Old ZKMerkleDistributor
  "0xf8d7c7E74Bc8B031fb0FdDC66FC725CC126a62b0", // Old RewardWeightingRegistry
].map(a => a.toLowerCase());

interface BalanceEntry {
  address: string;
  balance: string;
  balanceFormatted: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("================================================================================");
  console.log("BALANCE MIGRATION TO NEW CONTRACTS");
  console.log("================================================================================");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Old Token: ${OLD_TOKEN}`);
  console.log(`New Token: ${NEW_TOKEN}`);
  console.log();
  
  // Load snapshot
  const snapshotDir = path.join(__dirname, "../snapshots");
  const files = fs.readdirSync(snapshotDir)
    .filter(f => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.error("❌ No snapshot files found in snapshots/");
    console.log("   Run: npx hardhat run scripts/snapshot-state.ts --network base-sepolia");
    process.exit(1);
  }
  
  const latestSnapshot = files[0];
  console.log(`📂 Using snapshot: ${latestSnapshot}`);
  
  const snapshotPath = path.join(snapshotDir, latestSnapshot);
  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  
  console.log(`   Total holders in snapshot: ${snapshotData.holders?.length || 0}`);
  console.log(`   Snapshot taken at block: ${snapshotData.blockNumber}`);
  console.log();
  
  // Get new token contract
  const Myntis = await ethers.getContractFactory("Myntis");
  const newToken = Myntis.attach(NEW_TOKEN);
  
  // Check if migration is still open
  try {
    const migrationComplete = await newToken.migrationComplete();
    if (migrationComplete) {
      console.error("❌ Migration is already complete on new token!");
      process.exit(1);
    }
    console.log("✅ Migration window is open");
  } catch (e) {
    console.log("⚠️ Could not check migration status, proceeding...");
  }
  
  // Filter holders
  const holders: BalanceEntry[] = snapshotData.holders || [];
  const validHolders = holders.filter(h => {
    const addr = h.address.toLowerCase();
    if (EXCLUDED_ADDRESSES.includes(addr)) {
      console.log(`   Excluding: ${h.address} (${h.balanceFormatted} MYNT) - protocol contract`);
      return false;
    }
    if (BigInt(h.balance) === 0n) {
      return false;
    }
    return true;
  });
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Total holders: ${holders.length}`);
  console.log(`   Excluded (protocol): ${holders.length - validHolders.length}`);
  console.log(`   To migrate: ${validHolders.length}`);
  
  // Calculate total
  let totalToMigrate = 0n;
  for (const h of validHolders) {
    totalToMigrate += BigInt(h.balance);
  }
  console.log(`   Total amount: ${ethers.formatEther(totalToMigrate)} MYNT`);
  console.log();
  
  // Confirm
  console.log("⚠️ About to migrate balances. This will mint tokens to all holders.");
  console.log("   Press Ctrl+C to cancel, or wait 10 seconds to continue...");
  await new Promise(r => setTimeout(r, 10000));
  
  // Batch migration
  const BATCH_SIZE = 50;
  let migrated = 0;
  let failed = 0;
  
  for (let i = 0; i < validHolders.length; i += BATCH_SIZE) {
    const batch = validHolders.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(validHolders.length/BATCH_SIZE)}...`);
    
    for (const holder of batch) {
      try {
        const addr = holder.address;
        const amount = BigInt(holder.balance);
        
        // Check current balance on new token
        const currentBalance = await newToken.balanceOf(addr);
        if (currentBalance >= amount) {
          console.log(`   ⏭️ ${addr}: Already has ${ethers.formatEther(currentBalance)} MYNT`);
          migrated++;
          continue;
        }
        
        // Mint the difference
        const toMint = amount - currentBalance;
        console.log(`   🔨 Minting ${ethers.formatEther(toMint)} MYNT to ${addr}...`);
        
        const tx = await newToken.migrateMint(addr, toMint);
        await tx.wait();
        
        console.log(`   ✅ Minted! TX: ${tx.hash}`);
        migrated++;
        
      } catch (e: any) {
        console.error(`   ❌ Failed for ${holder.address}: ${e.message}`);
        failed++;
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < validHolders.length) {
      console.log("   Waiting 2 seconds before next batch...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log("\n================================================================================");
  console.log("MIGRATION COMPLETE");
  console.log("================================================================================");
  console.log(`✅ Migrated: ${migrated}`);
  console.log(`❌ Failed: ${failed}`);
  
  // Verify total supply
  const newSupply = await newToken.totalSupply();
  console.log(`\n📊 New Token Total Supply: ${ethers.formatEther(newSupply)} MYNT`);
  
  console.log("\n⚠️ NEXT STEPS:");
  console.log("1. Verify all balances are correct");
  console.log("2. Fund ZKMerkleDistributor for claims");
  console.log("3. Register provider in staking");
  console.log("4. Complete migration: npx hardhat run scripts/complete-migration.ts --network base-sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
