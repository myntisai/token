/**
 * One-time cleanup: reset stuck userPendingRewards
 * 
 * Before the harvest/fund fix, _syncUnaccountedTokens was called after every harvest,
 * adding harvested tokens to providerPendingRewards and userPendingRewards.
 * This made those tokens "accounted" so they can't be withdrawn via providerAccruedEmissions.
 * 
 * This script resets the stuck pending rewards and makes them available for withdrawal.
 * 
 * REQUIRES: Contract upgrade to add a reset function, OR manual intervention
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
  const providerAccrued = await staking.providerAccruedEmissions(PROVIDER);

  console.log("  Token balance:", ethers.formatEther(tokenBalance));
  console.log("  Principal staked:", ethers.formatEther(providerPool.totalStaked + userPool.totalStaked));
  console.log("  Provider pending:", ethers.formatEther(providerPending));
  console.log("  User pending:", ethers.formatEther(userPending));
  console.log("  Treasury pending:", ethers.formatEther(pendingTreasury));
  console.log("  Provider accrued:", ethers.formatEther(providerAccrued), "\n");

  const principal = providerPool.totalStaked + userPool.totalStaked;
  const accounted = principal + providerPending + userPending + pendingTreasury;
  const available = tokenBalance > accounted ? tokenBalance - accounted : 0n;

  console.log("Accounting:");
  console.log("  Accounted:", ethers.formatEther(accounted));
  console.log("  Available:", ethers.formatEther(available));
  console.log("  Shortfall:", ethers.formatEther(providerAccrued - available), "\n");

  console.log("Issue:");
  console.log("  userPendingRewards (2,729.83) is stuck from old harvest syncs");
  console.log("  This blocks withdrawing the full providerAccruedEmissions\n");

  console.log("Solutions:");
  console.log("  1. Add resetPendingRewards() admin function to contract (requires upgrade)");
  console.log("  2. Service only withdraws available amount (implemented in staking.js)");
  console.log("  3. Distribute the stuck userPendingRewards to users (via manual updatePools)\n");

  console.log("Option 3: Distribute stuck user rewards");
  console.log("  This will move 2,729.83 MYNT from userPendingRewards to user pool rewards");
  console.log("  Then available will increase by 2,729.83 MYNT\n");

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
    const newAccounted = principal + providerPending + newUserPending + pendingTreasury;
    const newAvailable = newTokenBalance > newAccounted ? newTokenBalance - newAccounted : 0n;

    console.log("After updatePools:");
    console.log("  User pending:", ethers.formatEther(newUserPending));
    console.log("  User pool accPerShare:", ethers.formatEther(newUserPool.accPerShare));
    console.log("  Available:", ethers.formatEther(newAvailable), "\n");

    if (newAvailable >= providerAccrued) {
      console.log("✅ Provider can now withdraw full accrued amount!");
    } else {
      console.log("⚠️  Still insufficient. Stuck rewards may be in user pool accPerShare.");
      console.log("   Users with stakes would need to claim to release these tokens.");
    }

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
