/**
 * Upgrade DualPoolStaking: add resetPendingRewards admin function
 *
 * Adds emergency admin function to reset stuck userPendingRewards
 * that were incorrectly synced from old harvests before the upgrade.
 *
 * Run: npx hardhat run scripts/upgrade-staking-reset-pending-fix.ts --network base-sepolia
 */

import { ethers, upgrades } from "hardhat";

const STAKING_PROXY = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";

async function main() {
  console.log("==============================================================================");
  console.log("UPGRADE DualPoolStaking - add resetPendingRewards()");
  console.log("==============================================================================\n");
  console.log("Proxy:", STAKING_PROXY);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const proxy = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  const UPGRADER_ROLE = await proxy.UPGRADER_ROLE();
  const hasRole = await proxy.hasRole(UPGRADER_ROLE, deployer.address);
  if (!hasRole) {
    console.error("❌ Deployer does not have UPGRADER_ROLE");
    process.exit(1);
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("Current implementation:", currentImpl);

  console.log("\nDeploying new implementation...");
  const DualPoolStakingFactory = await ethers.getContractFactory("DualPoolStaking");
  const newImpl = await DualPoolStakingFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);

  console.log("\nUpgrading proxy...");
  const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  await tx.wait();
  console.log("✅ Upgrade TX:", tx.hash);

  const finalImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("\n✅ Upgrade complete!");
  console.log("Implementation:", finalImpl);
  console.log("\nVerify:");
  console.log(`  npx hardhat verify --network base-sepolia ${finalImpl}`);
  
  console.log("\n==============================================================================");
  console.log("RESET STUCK USER PENDING REWARDS");
  console.log("==============================================================================\n");

  // Check current state
  const userPending = await proxy.userPendingRewards();
  console.log("Current userPendingRewards:", ethers.formatEther(userPending));

  if (userPending > 0n) {
    console.log("\nResetting userPendingRewards to 0...");
    const resetTx = await proxy.resetPendingRewards(1); // PoolType.User = 1
    await resetTx.wait();
    console.log("✅ Reset TX:", resetTx.hash);

    const newUserPending = await proxy.userPendingRewards();
    console.log("New userPendingRewards:", ethers.formatEther(newUserPending));

    // Check available balance now
    const token = await ethers.getContractAt("Myntis", MYNTIS);
    const tokenBalance = await token.balanceOf(proxy.target);
    const providerPool = await proxy.getPoolInfo(0);
    const userPool = await proxy.getPoolInfo(1);
    const providerPending = await proxy.providerPendingRewards();
    const pendingTreasury = await proxy.pendingTreasuryWithdrawal();

    const principal = providerPool.totalStaked + userPool.totalStaked;
    const accounted = principal + providerPending + newUserPending + pendingTreasury;
    const available = tokenBalance > accounted ? tokenBalance - accounted : 0n;

    console.log("\nAfter reset:");
    console.log("  Available:", ethers.formatEther(available), "MYNT");
    
    const providerAccrued = await proxy.providerAccruedEmissions(PROVIDER);
    console.log("  Provider accrued:", ethers.formatEther(providerAccrued), "MYNT");
    
    if (available >= providerAccrued) {
      console.log("\n✅ Provider can now withdraw full accrued amount!");
    }
  } else {
    console.log("No userPendingRewards to reset");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
