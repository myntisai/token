import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = deployment.myntis as string;
  const emissionsAddr = deployment.emissionsContract as string;
  const stakingAddr = deployment.dualPoolStaking as string;
  const zkDistAddr = deployment.zkMerkleDistributor as string;
  const vaultAddr = deployment.liquidStakingVault as string;
  const registryAddr = deployment.globalSupplyRegistry as string;

  const [signer] = await ethers.getSigners();

  const hub = await ethers.getContractAt("Myntis", hubAddr);
  const emissions = await ethers.getContractAt("EmissionsContract", emissionsAddr);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);
  const zkDist = await ethers.getContractAt("ZKMerkleDistributor", zkDistAddr);
  const vault = await ethers.getContractAt("LiquidStakingVault", vaultAddr);
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);

  console.log("=== BASE SEPOLIA STACK STATE ===");
  console.log("Signer:", signer.address);
  console.log("Hub:", hubAddr);
  console.log("Emissions:", emissionsAddr);
  console.log("Staking:", stakingAddr);
  console.log("ZK Dist:", zkDistAddr);
  console.log("Vault:", vaultAddr);
  console.log("Registry:", registryAddr);

  console.log("\n-- Hub Token (Myntis) --");
  console.log("Owner:", await hub.owner());
  console.log("Paused:", await hub.paused());
  console.log("TotalSupply:", (await hub.totalSupply()).toString());
  console.log("TotalMintedEmissions:", (await hub.totalMintedEmissions()).toString());
  console.log("TotalMintedImmediate:", (await hub.totalMintedImmediate()).toString());
  console.log("RemainingEmissions:", (await hub.remainingEmissions()).toString());
  console.log("RemainingImmediate:", (await hub.remainingImmediate()).toString());
  console.log("MigrationComplete:", await hub.migrationComplete());
  console.log("BurnFee:", (await hub.burnFee()).toString());
  console.log("FeeRecipient:", await hub.feeRecipient());
  console.log("GlobalSupplyRegistry:", await hub.globalSupplyRegistry());

  console.log("\n-- EmissionsContract --");
  console.log("Token:", await emissions.token());
  console.log("StakingContract:", await emissions.stakingContract());
  console.log("StartTime:", (await emissions.startTime()).toString());
  console.log("LastRewardTime:", (await emissions.lastRewardTime()).toString());
  console.log("MintedEmissions:", (await emissions.mintedEmissions()).toString());
  console.log("AccountedEmissions:", (await emissions.accountedEmissions()).toString());
  console.log("AccRewardPerShare:", (await emissions.accRewardPerShare()).toString());
  console.log("CurrentRate:", (await emissions.getCurrentEmissionRate()).toString());

  console.log("\n-- DualPoolStaking --");
  console.log("Token:", await staking.token());
  console.log("EmissionsContract:", await staking.emissionsContract());
  console.log("LiquidStakingVault:", await staking.liquidStakingVault());
  console.log("ZKMerkleDistributor:", await staking.zkMerkleDistributor());
  console.log("Treasury:", await staking.treasury());
  console.log("MinProviderStake:", (await staking.minProviderStake()).toString());
  console.log("ProviderPendingRewards:", (await staking.providerPendingRewards()).toString());
  console.log("UserPendingRewards:", (await staking.userPendingRewards()).toString());
  console.log("PendingTreasuryWithdrawal:", (await staking.pendingTreasuryWithdrawal()).toString());
  const providerPool = await staking.providerPool();
  const userPool = await staking.userPool();
  console.log("ProviderPool.totalStaked:", providerPool.totalStaked.toString());
  console.log("UserPool.totalStaked:", userPool.totalStaked.toString());
  console.log("ProviderPool.accRewardPerShare:", providerPool.accRewardPerShare.toString());
  console.log("UserPool.accRewardPerShare:", userPool.accRewardPerShare.toString());

  console.log("\n-- ZKMerkleDistributor --");
  console.log("Token:", await zkDist.token());
  console.log("BatchVerifier:", await zkDist.batchVerifier());
  console.log("StakingContract:", await zkDist.stakingContract());
  console.log("SlashRecipient:", await zkDist.slashRecipient());
  console.log("VerifierUpdateDelay:", (await zkDist.verifierUpdateDelay()).toString());
  console.log("PendingBatchVerifier:", await zkDist.pendingBatchVerifier());

  console.log("\n-- LiquidStakingVault --");
  console.log("Asset:", await vault.asset());
  console.log("DualPoolStaking:", await vault.dualPoolStaking());
  console.log("TotalAssets:", (await vault.totalAssets()).toString());
  console.log("TotalVaultDeposits:", (await vault.totalVaultDeposits()).toString());

  console.log("\n-- GlobalSupplyRegistry --");
  console.log("GlobalCap:", (await registry.globalCap()).toString());
  console.log("TotalCrossChainSupply:", (await registry.totalCrossChainSupply()).toString());
  console.log("TotalReservedQuota:", (await registry.totalReservedQuota()).toString());
  console.log("ChainSupply(base chainId 84532):", (await registry.chainSupply(ethers.toBigInt(84532))).toString());
  console.log("QuotaUpdateRefundAddress:", await registry.quotaUpdateRefundAddress());
  console.log("QuotaUpdateOptions length:", (await registry.quotaUpdateOptions()).length);

  console.log("\n-- Role Sanity (Deployer) --");
  try {
    const adminRole = await emissions.ADMIN_ROLE();
    console.log("Emissions ADMIN:", await emissions.hasRole(adminRole, signer.address));
  } catch {}
  try {
    const adminRole = await zkDist.ADMIN_ROLE();
    console.log("ZKDist ADMIN:", await zkDist.hasRole(adminRole, signer.address));
  } catch {}
  try {
    const adminRole = await vault.ADMIN_ROLE();
    console.log("Vault ADMIN:", await vault.hasRole(adminRole, signer.address));
  } catch {}
  try {
    const adminRole = await staking.DEFAULT_ADMIN_ROLE();
    console.log("Staking ADMIN:", await staking.hasRole(adminRole, signer.address));
  } catch {}
  try {
    const adminRole = await registry.ADMIN_ROLE();
    console.log("Registry ADMIN:", await registry.hasRole(adminRole, signer.address));
  } catch {}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
