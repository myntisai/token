import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// NEW contracts (December 28 deployment)
const NEW_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_STAKING = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
const NEW_DISTRIBUTOR = "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";
const NEW_EMISSIONS = "0x31b816258ac3b72625169CD37F80ac12191e76ad";
const NEW_GLOBAL_SUPPLY = "0xFBD4a2b0c095dbF14Be62B784c01d4baFaFa57d7";

// Load the latest snapshot
function loadLatestSnapshot(): any {
  const snapshotDir = path.join(__dirname, "../snapshots");
  const files = fs.readdirSync(snapshotDir)
    .filter(f => f.startsWith("migration-snapshot-"))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error("No snapshot found! Run snapshot-for-migration.ts first");
  }
  
  const latestFile = path.join(snapshotDir, files[0]);
  console.log(`📁 Loading snapshot: ${files[0]}`);
  return JSON.parse(fs.readFileSync(latestFile, "utf-8"));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("================================================================================");
  console.log("EXECUTING BALANCE MIGRATION");
  console.log("================================================================================");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`New Token: ${NEW_TOKEN}`);
  console.log(`New Staking: ${NEW_STAKING}`);
  console.log(`New Distributor: ${NEW_DISTRIBUTOR}`);
  console.log();
  
  // Load snapshot
  const snapshot = loadLatestSnapshot();
  console.log(`📊 Snapshot from block: ${snapshot.blockNumber}`);
  console.log(`   Total Supply: ${snapshot.totalSupplyFormatted} MYNT`);
  console.log(`   User Balances: ${snapshot.summary.totalUserBalanceFormatted} MYNT`);
  console.log(`   Staked: ${snapshot.summary.totalStakedFormatted} MYNT`);
  
  // Get contracts
  const token = await ethers.getContractAt("Myntis", NEW_TOKEN, deployer);
  const staking = await ethers.getContractAt("DualPoolStaking", NEW_STAKING, deployer);
  const distributor = await ethers.getContractAt("ZKMerkleDistributor", NEW_DISTRIBUTOR, deployer);
  const globalSupply = await ethers.getContractAt("GlobalSupplyRegistry", NEW_GLOBAL_SUPPLY, deployer);
  
  // Check migration status
  const migrationComplete = await token.migrationComplete();
  console.log(`\n📌 Migration complete: ${migrationComplete}`);
  
  if (migrationComplete) {
    console.log("❌ Migration is already complete! Cannot mint more tokens.");
    console.log("   Exiting...");
    return;
  }
  console.log("✅ Migration is still open - can mint tokens");
  
  // =========================================================================
  // STEP 1: Migrate user balances
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 1: MIGRATING USER BALANCES");
  console.log("============================================================");
  
  const usersToMigrate = snapshot.holders.filter((h: any) => !h.isExcluded && BigInt(h.balance) > 0n);
  console.log(`   Users to migrate: ${usersToMigrate.length}`);
  
  // Batch users into groups of 50
  const BATCH_SIZE = 50;
  let totalMigrated = 0n;
  let migratedCount = 0;
  
  for (let i = 0; i < usersToMigrate.length; i += BATCH_SIZE) {
    const batch = usersToMigrate.slice(i, i + BATCH_SIZE);
    
    // Filter out users who already have sufficient balance
    const toMint: { address: string; amount: bigint }[] = [];
    
    for (const h of batch) {
      const existingBalance = await token.balanceOf(h.address);
      const targetBalance = BigInt(h.balance);
      
      if (existingBalance >= targetBalance) {
        console.log(`   ⏭️ ${h.address.slice(0, 10)}... already has balance, skipping`);
        continue;
      }
      
      const amountToMint = targetBalance - existingBalance;
      if (amountToMint > 0n) {
        toMint.push({ address: h.address, amount: amountToMint });
      }
    }
    
    if (toMint.length === 0) {
      console.log(`\n   Batch ${Math.floor(i / BATCH_SIZE) + 1}: All users already have balances, skipping`);
      continue;
    }
    
    const recipients = toMint.map(m => m.address);
    const amounts = toMint.map(m => m.amount);
    const batchTotal = amounts.reduce((a, b) => a + b, 0n);
    
    console.log(`\n   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(usersToMigrate.length / BATCH_SIZE)}`);
    console.log(`   Recipients: ${recipients.length}`);
    console.log(`   Total amount: ${ethers.formatEther(batchTotal)} MYNT`);
    
    try {
      // Use batch migrateMint (takes arrays)
      console.log(`   🔄 Executing batch mint...`);
      const tx = await token.migrateMint(recipients, amounts);
      await tx.wait();
      totalMigrated += batchTotal;
      migratedCount += recipients.length;
      console.log(`   ✅ Batch complete! TX: ${tx.hash}`);
    } catch (e: any) {
      console.error(`   ❌ Batch failed: ${e.message}`);
      // Continue with next batch
    }
  }
  
  console.log(`\n✅ User migration complete!`);
  console.log(`   Migrated: ${migratedCount} users`);
  console.log(`   Total: ${ethers.formatEther(totalMigrated)} MYNT`);
  
  // =========================================================================
  // STEP 2: Setup provider staking
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 2: SETTING UP PROVIDER STAKING");
  console.log("============================================================");
  
  const providerStakeAmount = ethers.parseEther("1000"); // 1000 MYNT like before
  
  // Check if deployer has enough tokens
  const deployerBalance = await token.balanceOf(deployer.address);
  console.log(`   Deployer balance: ${ethers.formatEther(deployerBalance)} MYNT`);
  
  if (deployerBalance < providerStakeAmount) {
    console.log(`   ⚠️ Insufficient balance for staking, minting additional...`);
    const mintAmount = providerStakeAmount - deployerBalance;
    // migrateMint takes arrays
    const mintTx = await token.migrateMint([deployer.address], [mintAmount]);
    await mintTx.wait();
    console.log(`   ✅ Minted ${ethers.formatEther(mintAmount)} MYNT to deployer`);
  }
  
  // Approve staking
  console.log("\n   📝 Approving staking contract...");
  const approveTx = await token.approve(NEW_STAKING, providerStakeAmount);
  await approveTx.wait();
  console.log("   ✅ Approved!");
  
  // Check if already staked
  const existingStake = await staking.getProviderInfo(deployer.address);
  console.log(`   Current provider stake: ${ethers.formatEther(existingStake.stake)} MYNT`);
  
  if (existingStake.stake < providerStakeAmount) {
    console.log("\n   📝 Registering and staking as provider...");
    try {
      const stakeTx = await staking.registerAndStake(providerStakeAmount);
      await stakeTx.wait();
      console.log(`   ✅ Staked ${ethers.formatEther(providerStakeAmount)} MYNT as provider!`);
    } catch (e: any) {
      if (e.message.includes("already registered")) {
        console.log("   ⚠️ Already registered, trying to stake more...");
        const addStakeTx = await staking.stakeToProviderPool(providerStakeAmount);
        await addStakeTx.wait();
        console.log(`   ✅ Added ${ethers.formatEther(providerStakeAmount)} MYNT to provider stake!`);
      } else {
        console.error(`   ❌ Staking failed: ${e.message}`);
      }
    }
  } else {
    console.log("   ✅ Provider already has sufficient stake");
  }
  
  // =========================================================================
  // STEP 3: Setup distributor provider balance
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 3: SETTING UP DISTRIBUTOR");
  console.log("============================================================");
  
  // Check provider role
  const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
  const hasProviderRole = await distributor.hasRole(PROVIDER_ROLE, deployer.address);
  console.log(`   Provider role: ${hasProviderRole}`);
  
  if (!hasProviderRole) {
    console.log("   📝 Granting PROVIDER_ROLE...");
    const roleTx = await distributor.grantRole(PROVIDER_ROLE, deployer.address);
    await roleTx.wait();
    console.log("   ✅ PROVIDER_ROLE granted!");
  }
  
  // Add initial provider balance for claims (from deployer's tokens)
  const providerDistributorBalance = ethers.parseEther("115408"); // Restore the locked balance
  const deployerBalanceNow = await token.balanceOf(deployer.address);
  
  if (deployerBalanceNow >= providerDistributorBalance) {
    console.log("\n   📝 Adding provider balance to distributor...");
    // Approve distributor
    const approveDistTx = await token.approve(NEW_DISTRIBUTOR, providerDistributorBalance);
    await approveDistTx.wait();
    
    // Add balance
    const addBalanceTx = await distributor.addProviderBalance(deployer.address, providerDistributorBalance);
    await addBalanceTx.wait();
    console.log(`   ✅ Added ${ethers.formatEther(providerDistributorBalance)} MYNT to provider balance!`);
  } else {
    console.log(`   ⚠️ Insufficient balance for distributor funding`);
    console.log(`   Need: ${ethers.formatEther(providerDistributorBalance)} MYNT`);
    console.log(`   Have: ${ethers.formatEther(deployerBalanceNow)} MYNT`);
  }
  
  // =========================================================================
  // STEP 4: Sync global supply
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 4: SYNCING GLOBAL SUPPLY");
  console.log("============================================================");
  
  const currentSupply = await token.totalSupply();
  console.log(`   Token total supply: ${ethers.formatEther(currentSupply)} MYNT`);
  
  const chainId = 84532; // Base Sepolia
  try {
    const syncTx = await globalSupply.syncChainSupply(chainId, currentSupply);
    await syncTx.wait();
    console.log(`   ✅ Global supply synced for chain ${chainId}!`);
  } catch (e: any) {
    console.log(`   ⚠️ Sync issue: ${e.message.slice(0, 100)}`);
  }
  
  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log("\n================================================================================");
  console.log("MIGRATION COMPLETE");
  console.log("================================================================================");
  
  const finalSupply = await token.totalSupply();
  const finalProviderStake = await staking.getProviderInfo(deployer.address);
  const finalProviderBalance = await distributor.providerBalance(deployer.address);
  
  console.log("\n📊 Final State:");
  console.log(`   Token Supply: ${ethers.formatEther(finalSupply)} MYNT`);
  console.log(`   Provider Stake: ${ethers.formatEther(finalProviderStake.stake)} MYNT`);
  console.log(`   Provider Distributor Balance: ${ethers.formatEther(finalProviderBalance)} MYNT`);
  console.log(`   Users Migrated: ${migratedCount}`);
  console.log(`   Total Migrated: ${ethers.formatEther(totalMigrated)} MYNT`);
  
  console.log("\n⚠️ Next Steps:");
  console.log("   1. Update claim-generation-service config with new addresses");
  console.log("   2. Rebuild and restart services");
  console.log("   3. Test claiming flow");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
