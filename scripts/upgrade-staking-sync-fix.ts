import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Upgrade DualPoolStaking to V3 — fixes double-counting in syncEmissions.
 *
 * Changes:
 *  1. syncEmissions: includes totalProviderAccruedEmissions in accounted,
 *     sends all remaining to user pool (no more 87.5/12.5 re-split).
 *  2. _syncUnaccountedTokens: same accounting fix.
 *  3. _harvestRewards: caps provider transfer to providerAccruedEmissions
 *     (handles historical inflation so unstaking works).
 *  4. pendingRewards view: caps provider display to providerAccruedEmissions.
 *  5. reinitializeV3: one-time rebalance of pendingTreasuryWithdrawal to
 *     perfectly match balance accounting.
 */
async function main() {
  // Load deployment addresses
  const deploymentPath = path.resolve(__dirname, "../deployments/deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const STAKING_PROXY = deployment.dualPoolStaking;

  if (!STAKING_PROXY) {
    throw new Error("dualPoolStaking address not found in deployment file");
  }

  console.log("=".repeat(60));
  console.log("UPGRADING DualPoolStaking PROXY (V3 sync fix)");
  console.log("=".repeat(60));
  console.log("\nProxy Address:", STAKING_PROXY);
  console.log("Fix: double-counting in syncEmissions + harvestRewards cap\n");

  // Get current implementation
  const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("Current Implementation:", currentImpl);

  // Get deployer info
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // Verify deployer has UPGRADER_ROLE
  const proxyContract = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  const UPGRADER_ROLE = await proxyContract.UPGRADER_ROLE();
  const hasRole = await proxyContract.hasRole(UPGRADER_ROLE, deployer.address);
  console.log("Has UPGRADER_ROLE:", hasRole);

  if (!hasRole) {
    console.error("Deployer does not have UPGRADER_ROLE!");
    process.exit(1);
  }

  // Pre-upgrade state snapshot
  console.log("\n--- Pre-upgrade state ---");
  const tokenAddr = await proxyContract.token();
  const tokenContract = await ethers.getContractAt("IERC20", tokenAddr);
  const stakingBalance = await tokenContract.balanceOf(STAKING_PROXY);
  const totalStaked = await proxyContract.getTotalStaked();
  const provPending = await proxyContract.providerPendingRewards();
  const userPending = await proxyContract.userPendingRewards();
  const treasuryPending = await proxyContract.pendingTreasuryWithdrawal();
  const totalAccrued = await proxyContract.totalProviderAccruedEmissions();

  console.log("  Staking balance:", ethers.formatEther(stakingBalance));
  console.log("  Total staked:", ethers.formatEther(totalStaked));
  console.log("  Provider pending rewards:", ethers.formatEther(provPending));
  console.log("  User pending rewards:", ethers.formatEther(userPending));
  console.log("  Treasury pending:", ethers.formatEther(treasuryPending));
  console.log("  Total provider accrued:", ethers.formatEther(totalAccrued));

  const oldAccounted = totalStaked + provPending + userPending + treasuryPending + totalAccrued;
  const drift = stakingBalance > oldAccounted
    ? stakingBalance - oldAccounted
    : oldAccounted - stakingBalance;
  console.log("  Accounting drift:", ethers.formatEther(drift),
    stakingBalance >= oldAccounted ? "(under-accounted)" : "(OVER-accounted)");

  // Deploy new implementation
  console.log("\nDeploying new implementation...");
  const DualPoolStakingFactory = await ethers.getContractFactory("DualPoolStaking");
  const newImplContract = await DualPoolStakingFactory.deploy();
  await newImplContract.waitForDeployment();
  const newImplAddress = await newImplContract.getAddress();
  console.log("New Implementation deployed:", newImplAddress);

  // Encode reinitializeV3() call
  const reinitData = proxyContract.interface.encodeFunctionData("reinitializeV3");
  console.log("reinitializeV3 calldata:", reinitData);

  // Upgrade proxy to new implementation + call reinitializeV3
  console.log("\nUpgrading proxy...");
  const tx = await proxyContract.upgradeToAndCall(newImplAddress, reinitData);
  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt!.blockNumber);

  // Verify the upgrade
  const finalImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);

  // Post-upgrade state snapshot
  console.log("\n--- Post-upgrade state ---");
  const newBalance = await tokenContract.balanceOf(STAKING_PROXY);
  const newTotalStaked = await proxyContract.getTotalStaked();
  const newProvPending = await proxyContract.providerPendingRewards();
  const newUserPending = await proxyContract.userPendingRewards();
  const newTreasuryPending = await proxyContract.pendingTreasuryWithdrawal();
  const newTotalAccrued = await proxyContract.totalProviderAccruedEmissions();

  console.log("  Staking balance:", ethers.formatEther(newBalance));
  console.log("  Total staked:", ethers.formatEther(newTotalStaked));
  console.log("  Provider pending rewards:", ethers.formatEther(newProvPending));
  console.log("  User pending rewards:", ethers.formatEther(newUserPending));
  console.log("  Treasury pending:", ethers.formatEther(newTreasuryPending));
  console.log("  Total provider accrued:", ethers.formatEther(newTotalAccrued));

  const newAccounted = newTotalStaked + newProvPending + newUserPending + newTreasuryPending + newTotalAccrued;
  const newDrift = newBalance > newAccounted
    ? newBalance - newAccounted
    : newAccounted - newBalance;
  console.log("  Accounting drift:", ethers.formatEther(newDrift),
    newBalance >= newAccounted ? "(under-accounted)" : "(OVER-accounted)");

  // Update deployment file
  deployment.dualPoolStakingImplementation = newImplAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment file updated:", deploymentPath);

  console.log("\n" + "=".repeat(60));
  console.log("UPGRADE COMPLETE!");
  console.log("=".repeat(60));
  console.log("Proxy Address:", STAKING_PROXY);
  console.log("Old Implementation:", currentImpl);
  console.log("New Implementation:", finalImpl);
  console.log("\nV3 Fixes applied:");
  console.log("  - syncEmissions: no more double-counting");
  console.log("  - _harvestRewards: capped to providerAccruedEmissions");
  console.log("  - pendingRewards: accurate display for providers");
  console.log("  - reinitializeV3: treasury rebalanced");
  console.log("\nVerify new implementation:");
  console.log(`  npx hardhat verify --network base-mainnet ${finalImpl}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Upgrade failed:", err);
  process.exitCode = 1;
});
