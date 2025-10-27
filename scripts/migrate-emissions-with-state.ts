import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";

/**
 * Script to migrate Emissions contract to upgradeable version WITH full state preservation
 * 
 * This script:
 * 1. Reads all state from the old Emissions contract
 * 2. Deploys new EmissionsUpgradeable with UUPS proxy
 * 3. Initializes with migrated state (preserves history!)
 * 4. Updates StakingContract to point to new proxy
 * 
 * Prerequisites:
 * - You must have ADMIN_ROLE on the StakingContract
 * - Old Emissions contract must be accessible
 * 
 * Usage:
 *   npx hardhat run scripts/migrate-emissions-with-state.ts --network base-sepolia
 */

async function main() {
  console.log("🔄 Starting Emissions Contract Migration with State Preservation...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Get existing contract addresses
  const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6";
  const MYNTIS_TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773";
  const OLD_EMISSIONS_ADDRESS = process.env.EMISSIONS_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  if (OLD_EMISSIONS_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("❌ EMISSIONS_CONTRACT_ADDRESS not set in .env");
  }

  console.log("📋 Configuration:");
  console.log("  Token Address:           ", MYNTIS_TOKEN_ADDRESS);
  console.log("  Staking Contract:        ", STAKING_CONTRACT_ADDRESS);
  console.log("  Old Emissions Contract:  ", OLD_EMISSIONS_ADDRESS);
  console.log();

  // ========================================
  // STEP 1: Read state from old contract
  // ========================================
  console.log("📖 STEP 1: Reading state from old Emissions contract...");
  
  const legacyAbi = [
    "function startTime() view returns (uint256)",
    "function lastRewardTime() view returns (uint256)",
    "function accRewardPerShare() view returns (uint256)",
    "function totalEmitted() view returns (uint256)",
    "function unaccounted() view returns (uint256)",
    "function getEmissionStats() view returns (uint256 currentRate, uint256 totalEmitted_, uint256 remainingEmissions, uint256 mintedEmissions_, uint256 unaccounted_)",
  ];
  
  const oldEmissions = new Contract(OLD_EMISSIONS_ADDRESS, legacyAbi, deployer);
  
  let oldState;
  try {
    const [
      startTime,
      lastRewardTime,
      accRewardPerShare,
      totalEmitted,
      unaccounted,
      stats
    ] = await Promise.all([
      oldEmissions.startTime(),
      oldEmissions.lastRewardTime(),
      oldEmissions.accRewardPerShare(),
      oldEmissions.totalEmitted(),
      oldEmissions.unaccounted(),
      oldEmissions.getEmissionStats()
    ]);

    oldState = {
      startTime: startTime.toString(),
      lastRewardTime: lastRewardTime.toString(),
      accRewardPerShare: accRewardPerShare.toString(),
      totalEmitted: totalEmitted.toString(),
      unaccounted: unaccounted.toString(),
      mintedEmissions: stats.mintedEmissions_.toString()
    };

    console.log("✅ Successfully read old contract state:");
    console.log("  Start Time:            ", new Date(Number(oldState.startTime) * 1000).toISOString());
    console.log("  Last Reward Time:      ", new Date(Number(oldState.lastRewardTime) * 1000).toISOString());
    console.log("  Acc Reward Per Share:  ", oldState.accRewardPerShare);
    console.log("  Total Emitted:         ", ethers.formatEther(oldState.totalEmitted), "tokens");
    console.log("  Unaccounted:           ", ethers.formatEther(oldState.unaccounted), "tokens");
    console.log("  Minted Emissions:      ", ethers.formatEther(oldState.mintedEmissions), "tokens");
    console.log();

    // Check for the bug we're fixing
    const minted = BigInt(oldState.mintedEmissions);
    const emitted = BigInt(oldState.totalEmitted);
    if (minted > emitted) {
      console.log("⚠️  DETECTED: mintedEmissions > totalEmitted");
      console.log("   Confirming the emission overrun bug exists!");
      console.log("   Difference:", ethers.formatEther(minted - emitted), "tokens");
      console.log("   This migration will fix this issue.");
      console.log();
    }

  } catch (error) {
    console.error("❌ Failed to read old contract state:", error.message);
    throw error;
  }

  // ========================================
  // STEP 2: Deploy new upgradeable contract
  // ========================================
  console.log("📦 STEP 2: Deploying new EmissionsUpgradeable with UUPS proxy...");
  
  const EmissionsUpgradeableFactory = await ethers.getContractFactory("EmissionsUpgradeable");
  
  console.log("  Deploying proxy with state migration...");
  const newEmissions = await upgrades.deployProxy(
    EmissionsUpgradeableFactory,
    [
      MYNTIS_TOKEN_ADDRESS,
      STAKING_CONTRACT_ADDRESS,
      deployer.address,
      oldState.startTime,
      oldState.lastRewardTime,
      oldState.accRewardPerShare,
      oldState.totalEmitted,
      oldState.unaccounted,
      oldState.mintedEmissions
    ],
    {
      initializer: 'initializeWithMigration',
      kind: 'uups'
    }
  );

  await newEmissions.waitForDeployment();
  const proxyAddress = await newEmissions.getAddress();
  
  console.log("✅ New EmissionsUpgradeable (Proxy) deployed at:", proxyAddress);
  console.log();

  // ========================================
  // STEP 3: Verify state was migrated correctly
  // ========================================
  console.log("🔍 STEP 3: Verifying migrated state...");
  
  const newEmissionsContract = await ethers.getContractAt("EmissionsUpgradeable", proxyAddress);

  const [
    newStartTime,
    newLastRewardTime,
    newAccRewardPerShare,
    newTotalEmitted,
    newUnaccounted,
    newStats
  ] = await Promise.all([
    newEmissionsContract.startTime(),
    newEmissionsContract.lastRewardTime(),
    newEmissionsContract.accRewardPerShare(),
    newEmissionsContract.totalEmitted(),
    newEmissionsContract.unaccounted(),
    newEmissionsContract.getEmissionStats()
  ]);

  const migrationSuccess = 
    newStartTime.toString() === oldState.startTime &&
    newLastRewardTime.toString() === oldState.lastRewardTime &&
    newAccRewardPerShare.toString() === oldState.accRewardPerShare &&
    newTotalEmitted.toString() === oldState.totalEmitted &&
    newUnaccounted.toString() === oldState.unaccounted &&
    newStats.mintedEmissions_.toString() === oldState.mintedEmissions;

  if (migrationSuccess) {
    console.log("✅ State migration verified successfully!");
    console.log("  All values match the old contract exactly.");
  } else {
    console.log("❌ State migration FAILED!");
    console.log("  Comparison:");
    console.log("  Start Time:        ", oldState.startTime === newStartTime.toString() ? "✅" : "❌");
    console.log("  Last Reward Time:  ", oldState.lastRewardTime === newLastRewardTime.toString() ? "✅" : "❌");
    console.log("  Acc Reward/Share:  ", oldState.accRewardPerShare === newAccRewardPerShare.toString() ? "✅" : "❌");
    console.log("  Total Emitted:     ", oldState.totalEmitted === newTotalEmitted.toString() ? "✅" : "❌");
    console.log("  Unaccounted:       ", oldState.unaccounted === newUnaccounted.toString() ? "✅" : "❌");
    console.log("  Minted Emissions:  ", oldState.mintedEmissions === newStats.mintedEmissions_.toString() ? "✅" : "❌");
    throw new Error("State migration verification failed");
  }
  console.log();

  // ========================================
  // STEP 4: Update StakingContract
  // ========================================
  console.log("🔄 STEP 4: Updating StakingContract to point to new proxy...");
  
  const stakingContract = await ethers.getContractAt("StakingContract", STAKING_CONTRACT_ADDRESS);
  
  const updateTx = await stakingContract.setEmissionContract(proxyAddress);
  console.log("  Transaction hash:", updateTx.hash);
  
  await updateTx.wait();
  console.log("✅ StakingContract updated successfully!");
  console.log();

  // Verify the update
  const currentEmissionsAddress = await stakingContract.emissionContract();
  console.log("🔍 Final Verification:");
  console.log("  Current Emissions in StakingContract:", currentEmissionsAddress);
  console.log("  Expected (New Proxy):                 ", proxyAddress);
  console.log("  Match:                                ", currentEmissionsAddress === proxyAddress ? "✅ YES" : "❌ NO");
  console.log();

  // ========================================
  // STEP 5: Summary and next steps
  // ========================================
  console.log("═══════════════════════════════════════════════════════");
  console.log("✅ Emissions Migration Complete with State Preservation!");
  console.log("═══════════════════════════════════════════════════════");
  console.log();
  console.log("📝 Summary:");
  console.log("  Old Emissions:            ", OLD_EMISSIONS_ADDRESS);
  console.log("  New Proxy:                ", proxyAddress);
  console.log("  Staking Contract:         ", STAKING_CONTRACT_ADDRESS);
  console.log();
  console.log("  State Preserved:");
  console.log("  ✅ Start Time:             ", new Date(Number(oldState.startTime) * 1000).toISOString());
  console.log("  ✅ Last Reward Time:       ", new Date(Number(oldState.lastRewardTime) * 1000).toISOString());
  console.log("  ✅ Total Emitted:          ", ethers.formatEther(oldState.totalEmitted), "tokens");
  console.log("  ✅ Minted Emissions:       ", ethers.formatEther(oldState.mintedEmissions), "tokens");
  console.log("  ✅ Unaccounted:            ", ethers.formatEther(oldState.unaccounted), "tokens");
  console.log("  ✅ Acc Reward Per Share:   ", oldState.accRewardPerShare);
  console.log();
  console.log("🎯 Benefits:");
  console.log("  ✅ No emission history lost");
  console.log("  ✅ Provider rewards preserved");
  console.log("  ✅ Emission schedule continues correctly");
  console.log("  ✅ Now upgradeable via UUPS");
  console.log("  ✅ 'Emission overrun' bug fixed");
  console.log();
  console.log("🔍 Next Steps:");
  console.log();
  console.log("  1. Verify the proxy implementation on Etherscan:");
  console.log(`     npx hardhat verify --network base-sepolia ${proxyAddress}`);
  console.log();
  console.log("  2. Test harvesting with the new contract:");
  console.log("     - Check that 'Emission overrun' error no longer occurs");
  console.log("     - Verify providers can harvest normally");
  console.log("     - Monitor that emission schedule is correct");
  console.log();
  console.log("  3. Update your .env with the new proxy address:");
  console.log(`     EMISSIONS_CONTRACT_ADDRESS=${proxyAddress}`);
  console.log();
  console.log("  4. Future upgrades (if needed):");
  console.log("     - Deploy new implementation");
  console.log("     - Call upgradeToAndCall() on proxy");
  console.log("     - No state loss, seamless upgrade!");
  console.log();

  // Save deployment info
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    migration: {
      oldEmissions: OLD_EMISSIONS_ADDRESS,
      newProxy: proxyAddress,
      stakingContract: STAKING_CONTRACT_ADDRESS,
      tokenAddress: MYNTIS_TOKEN_ADDRESS
    },
    migratedState: {
      startTime: oldState.startTime,
      startTimeISO: new Date(Number(oldState.startTime) * 1000).toISOString(),
      lastRewardTime: oldState.lastRewardTime,
      accRewardPerShare: oldState.accRewardPerShare,
      totalEmitted: oldState.totalEmitted,
      totalEmittedFormatted: ethers.formatEther(oldState.totalEmitted),
      unaccounted: oldState.unaccounted,
      mintedEmissions: oldState.mintedEmissions,
      mintedEmissionsFormatted: ethers.formatEther(oldState.mintedEmissions)
    },
    transactions: {
      proxyDeployment: await newEmissions.deploymentTransaction()?.hash,
      stakingUpdate: updateTx.hash
    }
  };

  console.log("\n📄 Deployment Info (save this!):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });

