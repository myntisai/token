import { ethers, network, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Post-upgrade sanity check for the Base mainnet MasterChef delta-sync fix.
 *
 * Usage:
 *   npx hardhat run scripts/check-post-masterchef-upgrade.ts --network base-mainnet
 */
async function main() {
  const depPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const stakingProxy = ethers.getAddress(dep.dualPoolStaking as string);
  const tokenAddr = ethers.getAddress(dep.myntis as string);
  const emissionsAddr = ethers.getAddress(dep.emissionsContract as string);
  const vaultAddr = ethers.getAddress(dep.liquidStakingVault as string);
  const distributorAddr = ethers.getAddress(dep.zkMerkleDistributor as string);

  const safeAddr = ethers.getAddress("0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B");
  const expectedImpl = ethers.getAddress("0xAB62e9dD23f77a6ceEbCd386AC7ed6869115c755");

  const chain = await ethers.provider.getNetwork();
  console.log("Network:", `${network.name} (chainId ${chain.chainId})`);
  console.log("Staking proxy:", stakingProxy);
  console.log("Token:", tokenAddr);
  console.log("Emissions:", emissionsAddr);
  console.log("Vault:", vaultAddr);
  console.log("Distributor:", distributorAddr);
  console.log("Safe:", safeAddr);

  const impl = await upgrades.erc1967.getImplementationAddress(stakingProxy);
  console.log("\nERC1967 implementation:", impl);
  console.log("Matches expected impl:", impl.toLowerCase() === expectedImpl.toLowerCase());

  const safe = new ethers.Contract(safeAddr, ["function nonce() view returns (uint256)"], ethers.provider);
  console.log("Safe nonce:", (await safe.nonce()).toString());

  const token = await ethers.getContractAt("IERC20", tokenAddr);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingProxy);
  const emissions = await ethers.getContractAt("EmissionsContract", emissionsAddr);
  const vault = await ethers.getContractAt("LiquidStakingVault", vaultAddr);

  const [
    tokenBalStaking,
    totalStaked,
    providerPendingRewards,
    userPendingRewards,
    pendingTreasuryWithdrawal,
    lastSyncedEmissionsMinted,
    totalProviderAccruedEmissions
  ] = await Promise.all([
    token.balanceOf(stakingProxy),
    staking.getTotalStaked(),
    staking.providerPendingRewards(),
    staking.userPendingRewards(),
    staking.pendingTreasuryWithdrawal(),
    staking.lastSyncedEmissionsMinted(),
    staking.totalProviderAccruedEmissions()
  ]);

  const [providerPool, userPool] = await Promise.all([staking.providerPool(), staking.userPool()]);

  console.log("\nStaking state");
  console.log("  tokenBalance(staking):", ethers.formatEther(tokenBalStaking));
  console.log("  totalStaked:", ethers.formatEther(totalStaked));
  console.log("  providerPool.totalStaked:", ethers.formatEther(providerPool.totalStaked));
  console.log("  userPool.totalStaked:", ethers.formatEther(userPool.totalStaked));
  console.log("  providerPendingRewards:", ethers.formatEther(providerPendingRewards));
  console.log("  userPendingRewards:", ethers.formatEther(userPendingRewards));
  console.log("  pendingTreasuryWithdrawal:", ethers.formatEther(pendingTreasuryWithdrawal));
  console.log("  totalProviderAccruedEmissions:", ethers.formatEther(totalProviderAccruedEmissions));
  console.log("  lastSyncedEmissionsMinted:", ethers.formatEther(lastSyncedEmissionsMinted));

  const [mintedEmissions, accountedEmissions, stakingWiring, rate] = await Promise.all([
    emissions.mintedEmissions(),
    emissions.accountedEmissions(),
    emissions.stakingContract(),
    emissions.getCurrentEmissionRate()
  ]);

  console.log("\nEmissions state");
  console.log("  emissions.stakingContract:", stakingWiring);
  console.log("  mintedEmissions:", ethers.formatEther(mintedEmissions));
  console.log("  accountedEmissions:", ethers.formatEther(accountedEmissions));
  console.log("  minted==accounted:", mintedEmissions === accountedEmissions);
  console.log("  currentEmissionRate (raw):", rate.toString());

  const accounts = [
    ethers.getAddress("0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6"), // service provider
    ethers.getAddress("0xca7735a6290f384c8a9394b0e3141fef89e6589d"), // personal provider
    vaultAddr
  ];

  console.log("\nKey accounts");
  for (const a of accounts) {
    const [ui, pending, accrued] = await Promise.all([
      staking.userInfo(a),
      staking.pendingRewards(a),
      staking.providerAccruedEmissions(a)
    ]);

    const poolType = Number(ui.poolType);
    const accRewardPerShare = poolType === 0 ? providerPool.accRewardPerShare : userPool.accRewardPerShare;
    const accumulated = (ui.amount * accRewardPerShare) / 1_000_000_000_000n;
    const impliedPending = accumulated > ui.rewardDebt ? accumulated - ui.rewardDebt : 0n;

    console.log(" ", a);
    console.log("    poolType:", poolType === 0 ? "Provider" : "User");
    console.log("    isProvider:", ui.isProvider);
    console.log("    amount:", ethers.formatEther(ui.amount));
    console.log("    rewardDebt:", ethers.formatEther(ui.rewardDebt));
    console.log("    pendingRewards():", ethers.formatEther(pending));
    console.log("    impliedPending:", ethers.formatEther(impliedPending));
    console.log("    providerAccruedEmissions:", ethers.formatEther(accrued));
  }

  const [vaultTotalAssets, vaultTotalDeposits] = await Promise.all([
    vault.totalAssets(),
    vault.totalVaultDeposits().catch(() => 0n)
  ]);
  console.log("\nVault");
  console.log("  totalAssets:", ethers.formatEther(vaultTotalAssets));
  console.log("  totalVaultDeposits:", ethers.formatEther(vaultTotalDeposits));

  // Non-invasive simulation: ensure harvestFromEmissions would not revert.
  try {
    const simulated = await staking.harvestFromEmissions.staticCall(accounts[0]);
    console.log("\nSIMULATION");
    console.log("  harvestFromEmissions(provider) staticCall ok, minted:", ethers.formatEther(simulated));
  } catch (e: any) {
    console.log("\nSIMULATION");
    console.log("  harvestFromEmissions(provider) staticCall REVERT:", e?.shortMessage || e?.message || String(e));
  }

  // Non-invasive simulation: ensure key accounts can harvest without insolvency.
  // (We set `from` to satisfy `harvestRewards` auth checks.)
  const stakingRO = staking.connect(ethers.provider);
  for (const a of accounts) {
    try {
      const simulatedHarvest = await (stakingRO as any).harvestRewards.staticCall(a, { from: a });
      void simulatedHarvest;
      console.log("  harvestRewards(account) staticCall ok:", a);
    } catch (e: any) {
      console.log("  harvestRewards(account) staticCall REVERT:", a, "-", e?.shortMessage || e?.message || String(e));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
