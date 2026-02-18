import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  myntis?: string;
  dualPoolStaking?: string;
  emissions?: string;
  zkMerkleDistributor?: string;
  liquidStakingVault?: string;
  deployer?: string;
};

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

const STAKING_ABI = [
  "function getTotalStaked() view returns (uint256)",
  "function getProviderInfo(address) view returns (uint256 stake, uint256 rewardDebt)",
  "function pendingRewards(address) view returns (uint256)",
  "function providerPendingRewards() view returns (uint256)",
  "function userPendingRewards() view returns (uint256)",
  "function emissionsContract() view returns (address)",
  "function token() view returns (address)",
  "function zkMerkleDistributor() view returns (address)",
  "function liquidStakingVault() view returns (address)",
];

const DISTRIBUTOR_ABI = [
  "function providerBalance(address) view returns (uint256)",
  "function lockedBalance(address) view returns (uint256)",
  "function token() view returns (address)",
  "function stakingContract() view returns (address)",
];

async function main() {
  const n = await ethers.provider.getNetwork();
  console.log("\n🔎 Yields + Balances Check");
  console.log(`Network: ${network.name} (chainId: ${n.chainId})`);

  const deploymentPath =
    process.env.DEPLOYMENT_FILE || path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  const dep: Deployment = fs.existsSync(deploymentPath)
    ? (JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as Deployment)
    : {};

  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || dep.myntis;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS || dep.dualPoolStaking;
  const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS || dep.emissions;
  const distributorAddress = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || dep.zkMerkleDistributor;
  const vaultAddress = process.env.LIQUID_STAKING_VAULT_ADDRESS || dep.liquidStakingVault;
  const providerAddress = process.env.PROVIDER_ADDRESS || dep.deployer;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) throw new Error("Missing/invalid token address");
  if (!stakingAddress || !ethers.isAddress(stakingAddress)) throw new Error("Missing/invalid staking address");
  if (!emissionsAddress || !ethers.isAddress(emissionsAddress)) throw new Error("Missing/invalid emissions address");
  if (!distributorAddress || !ethers.isAddress(distributorAddress)) throw new Error("Missing/invalid distributor address");
  if (!vaultAddress || !ethers.isAddress(vaultAddress)) throw new Error("Missing/invalid vault address");
  if (!providerAddress || !ethers.isAddress(providerAddress)) throw new Error("Missing/invalid provider address (set PROVIDER_ADDRESS)");

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, ethers.provider);
  const staking = new ethers.Contract(stakingAddress, STAKING_ABI, ethers.provider);
  const distributor = new ethers.Contract(distributorAddress, DISTRIBUTOR_ABI, ethers.provider);

  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  const format = (value: bigint) => ethers.formatUnits(value, decimals);

  console.log("\n📋 Contract Addresses");
  console.log(`Token:       ${tokenAddress}`);
  console.log(`Staking:     ${stakingAddress}`);
  console.log(`Emissions:   ${emissionsAddress}`);
  console.log(`Distributor:${distributorAddress}`);
  console.log(`Vault:       ${vaultAddress}`);
  console.log(`Provider:    ${providerAddress}`);

  console.log("\n💰 Token Balances");
  const [
    stakingBal,
    emissionsBal,
    distributorBal,
    vaultBal,
  ] = await Promise.all([
    token.balanceOf(stakingAddress),
    token.balanceOf(emissionsAddress),
    token.balanceOf(distributorAddress),
    token.balanceOf(vaultAddress),
  ]);
  console.log(`Staking:     ${format(stakingBal)} ${symbol}`);
  console.log(`Emissions:   ${format(emissionsBal)} ${symbol}`);
  console.log(`Distributor:${format(distributorBal)} ${symbol}`);
  console.log(`Vault:       ${format(vaultBal)} ${symbol}`);

  console.log("\n🏦 Staking State");
  const [totalStaked, providerInfo, pendingRewards] = await Promise.all([
    staking.getTotalStaked(),
    staking.getProviderInfo(providerAddress),
    staking.pendingRewards(providerAddress),
  ]);

  const [providerPending, userPending] = await Promise.all([
    staking.providerPendingRewards(),
    staking.userPendingRewards(),
  ]);
  const providerStake = providerInfo[0] as bigint;
  const providerRewardDebt = providerInfo[1] as bigint;
  console.log(`Total Staked:        ${format(totalStaked)} ${symbol}`);
  console.log(`Provider Stake:      ${format(providerStake)} ${symbol}`);
  console.log(`Provider RewardDebt: ${format(providerRewardDebt)} ${symbol}`);
  console.log(`Provider Pending:    ${format(pendingRewards)} ${symbol}`);
  console.log(`Pool Pending (Prov): ${format(providerPending)} ${symbol}`);
  console.log(`Pool Pending (User): ${format(userPending)} ${symbol}`);

  console.log("\n📦 Distributor State");
  const [providerBalance, lockedBalance] = await Promise.all([
    distributor.providerBalance(providerAddress),
    distributor.lockedBalance(providerAddress),
  ]);
  console.log(`Provider Available:  ${format(providerBalance)} ${symbol}`);
  console.log(`Provider Locked:     ${format(lockedBalance)} ${symbol}`);
  console.log(`Provider Total:      ${format(providerBalance + lockedBalance)} ${symbol}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
