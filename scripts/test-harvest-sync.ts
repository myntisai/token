import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const stakingAddr = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
  const tokenAddr = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
  const providerAddr = "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627";

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);
  const token = await ethers.getContractAt("IERC20", tokenAddr);

  console.log("=== BEFORE HARVEST ===");
  const balanceBefore = await token.balanceOf(stakingAddr);
  const providerPendingBefore = await staking.providerPendingRewards();
  const userPendingBefore = await staking.userPendingRewards();
  
  const providerPool = await staking.providerPool();
  const userPool = await staking.userPool();
  const principal = providerPool.totalStaked + userPool.totalStaked;
  const pendingTreasury = await staking.pendingTreasuryWithdrawal();
  const accountedBefore = principal + providerPendingBefore + userPendingBefore + pendingTreasury;
  const unaccountedBefore = balanceBefore > accountedBefore ? balanceBefore - accountedBefore : 0n;
  
  console.log("Token Balance:", ethers.formatEther(balanceBefore), "MYNT");
  console.log("Provider Pending:", ethers.formatEther(providerPendingBefore), "MYNT");
  console.log("User Pending:", ethers.formatEther(userPendingBefore), "MYNT");
  console.log("Unaccounted:", ethers.formatEther(unaccountedBefore), "MYNT");

  console.log("\n=== TRIGGERING HARVEST ===");
  console.log("Calling harvestFromEmissions for provider:", providerAddr);
  
  const tx = await staking.harvestFromEmissions(providerAddr);
  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Gas used:", receipt?.gasUsed?.toString());
  
  // Check for RewardsQueued event
  const rewardsQueuedEvent = receipt?.logs?.find(log => {
    try {
      const parsed = staking.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "RewardsQueued";
    } catch { return false; }
  });
  
  if (rewardsQueuedEvent) {
    const parsed = staking.interface.parseLog({ topics: rewardsQueuedEvent.topics as string[], data: rewardsQueuedEvent.data });
    console.log("\n✅ RewardsQueued event emitted!");
    console.log("   Provider Amount:", ethers.formatEther(parsed?.args?.providerAmount || 0), "MYNT");
    console.log("   User Amount:", ethers.formatEther(parsed?.args?.userAmount || 0), "MYNT");
  }

  console.log("\n=== AFTER HARVEST ===");
  const balanceAfter = await token.balanceOf(stakingAddr);
  const providerPendingAfter = await staking.providerPendingRewards();
  const userPendingAfter = await staking.userPendingRewards();
  const accountedAfter = principal + providerPendingAfter + userPendingAfter + pendingTreasury;
  const unaccountedAfter = balanceAfter > accountedAfter ? balanceAfter - accountedAfter : 0n;
  
  console.log("Token Balance:", ethers.formatEther(balanceAfter), "MYNT");
  console.log("Provider Pending:", ethers.formatEther(providerPendingAfter), "MYNT");
  console.log("User Pending:", ethers.formatEther(userPendingAfter), "MYNT");
  console.log("Unaccounted:", ethers.formatEther(unaccountedAfter), "MYNT");
  
  console.log("\n=== SUMMARY ===");
  console.log("Provider Pending Change:", ethers.formatEther(providerPendingAfter - providerPendingBefore), "MYNT");
  console.log("User Pending Change:", ethers.formatEther(userPendingAfter - userPendingBefore), "MYNT");
  console.log("Unaccounted Change:", ethers.formatEther(unaccountedAfter - unaccountedBefore), "MYNT");
  
  if (unaccountedAfter === 0n) {
    console.log("\n✅ SUCCESS: All tokens are now accounted for!");
  } else {
    console.log("\n⚠️ Some unaccounted tokens remain:", ethers.formatEther(unaccountedAfter), "MYNT");
  }
}

main().catch(console.error);
