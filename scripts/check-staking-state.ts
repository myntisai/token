import { ethers } from "hardhat";

async function main() {
  const stakingAddr = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
  const tokenAddr = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);
  const token = await ethers.getContractAt("IERC20", tokenAddr);

  console.log("\n=== STAKING CONTRACT STATE (After V3 Upgrade) ===");
  const balance = await token.balanceOf(stakingAddr);
  console.log("Token Balance:", ethers.formatEther(balance), "MYNT");

  const providerPending = await staking.providerPendingRewards();
  console.log("Provider Pending Rewards:", ethers.formatEther(providerPending), "MYNT");

  const userPending = await staking.userPendingRewards();
  console.log("User Pending Rewards:", ethers.formatEther(userPending), "MYNT");

  const providerPool = await staking.providerPool();
  console.log("Provider Pool Staked:", ethers.formatEther(providerPool.totalStaked), "MYNT");

  const userPool = await staking.userPool();
  console.log("User Pool Staked:", ethers.formatEther(userPool.totalStaked), "MYNT");

  const pendingTreasury = await staking.pendingTreasuryWithdrawal();
  console.log("Pending Treasury:", ethers.formatEther(pendingTreasury), "MYNT");

  // Calculate unaccounted (including totalRewards distributed to pools)
  const principal = providerPool.totalStaked + userPool.totalStaked;
  const distributed = providerPool.totalRewards + userPool.totalRewards;
  const pending = providerPending + userPending + pendingTreasury;
  const accounted = principal + distributed + pending;
  const unaccounted = balance > accounted ? balance - accounted : 0n;
  
  console.log("\n=== FULL ACCOUNTING ===");
  console.log("Principal (staked):", ethers.formatEther(principal), "MYNT");
  console.log("Distributed (totalRewards):", ethers.formatEther(distributed), "MYNT");
  console.log("Pending:", ethers.formatEther(pending), "MYNT");
  console.log("Total Accounted:", ethers.formatEther(accounted), "MYNT");
  console.log("Unaccounted:", ethers.formatEther(unaccounted), "MYNT");
  
  console.log("\n=== NEXT STEP ===");
  console.log("When the staking cron runs harvestFromEmissions(), the new _syncUnaccountedTokens()");
  console.log("function will automatically move these ~466K MYNT into providerPendingRewards/userPendingRewards");
}

main().catch(console.error);
