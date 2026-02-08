/**
 * Legacy cleanup: move stuck pending rewards into pool accounting.
 *
 * If pending rewards are stuck (e.g., no stakers when rewards were queued),
 * updatePools() will move them into pool accounting or treasury queue.
 *
 * Run: npx hardhat run scripts/cleanup-stuck-pending-rewards.ts --network base-sepolia
 */

import { ethers } from "hardhat";

const STAKING_PROXY = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";
const MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const PROVIDER = "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627";

async function main() {
  console.log("==============================================================================");
  console.log("CLEANUP STUCK PENDING REWARDS");
  console.log("==============================================================================\n");

  const [deployer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  const token = await ethers.getContractAt("Myntis", MYNTIS);

  console.log("Current state:");
  const tokenBalance = await token.balanceOf(staking.target);
  const providerPool = await staking.getPoolInfo(0);
  const userPool = await staking.getPoolInfo(1);
  const providerPending = await staking.providerPendingRewards();
  const userPending = await staking.userPendingRewards();
  const pendingTreasury = await staking.pendingTreasuryWithdrawal();
  console.log("  Token balance:", ethers.formatEther(tokenBalance));
  console.log("  Principal staked:", ethers.formatEther(providerPool.totalStaked + userPool.totalStaked));
  console.log("  Provider pending:", ethers.formatEther(providerPending));
  console.log("  User pending:", ethers.formatEther(userPending));
  console.log("  Treasury pending:", ethers.formatEther(pendingTreasury));
  console.log("");

  const principal = providerPool.totalStaked + userPool.totalStaked;
  console.log("This script will call updatePools() to distribute pending rewards.\n");

  // Check if we can call updatePools
  try {
    console.log("Calling updatePools() to distribute stuck rewards...");
    const tx = await staking.updatePools();
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("✅ Pools updated\n");

    // Check new state
    const newUserPending = await staking.userPendingRewards();
    const newUserPool = await staking.getPoolInfo(1);
    const newTokenBalance = await token.balanceOf(staking.target);
    console.log("After updatePools:");
    console.log("  User pending:", ethers.formatEther(newUserPending));
    console.log("  User pool accPerShare:", ethers.formatEther(newUserPool.accPerShare));
    console.log("");

  } catch (e) {
    console.error("updatePools failed:", e.message);
    console.log("\nManual fix needed:");
    console.log("  Contact admin to add resetPendingRewards() function");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
