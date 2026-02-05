import { ethers } from "hardhat";

const DEFAULTS = {
  MYNTIS_TOKEN_ADDRESS: "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8",
  STAKING_CONTRACT_ADDRESS: "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8",
  EMISSIONS_CONTRACT_ADDRESS: "0x31b816258ac3b72625169CD37F80ac12191e76ad",
  ZK_MERKLE_DISTRIBUTOR_ADDRESS: "0x1C7eFdAC07C6fc7eb74565D557E2d98c4dACd095",
  LIQUID_STAKING_VAULT_ADDRESS: "0xC3d6e556b9C7dCAE100777e10234944A09A8cEac",
  PROVIDER_ADDRESS: "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627",
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
  "function providerAccruedEmissions(address) view returns (uint256)",
  "function providerPendingRewards() view returns (uint256)",
  "function userPendingRewards() view returns (uint256)",
  "function emissionsContract() view returns (address)",
  "function token() view returns (address)",
  "function zkMerkleDistributor() view returns (address)",
  "function liquidStakingVault() view returns (address)",
  "event ProviderEmissionsAccrued(address indexed provider, uint256 amount, uint256 totalAccrued)",
];

const DISTRIBUTOR_ABI = [
  "function providerBalance(address) view returns (uint256)",
  "function lockedBalance(address) view returns (uint256)",
  "function token() view returns (address)",
  "function stakingContract() view returns (address)",
];

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("\n🔎 Yields + Balances Check");
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);

  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || DEFAULTS.MYNTIS_TOKEN_ADDRESS;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS || DEFAULTS.STAKING_CONTRACT_ADDRESS;
  const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS || DEFAULTS.EMISSIONS_CONTRACT_ADDRESS;
  const distributorAddress =
    process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || DEFAULTS.ZK_MERKLE_DISTRIBUTOR_ADDRESS;
  const vaultAddress = process.env.LIQUID_STAKING_VAULT_ADDRESS || DEFAULTS.LIQUID_STAKING_VAULT_ADDRESS;
  const providerAddress = process.env.PROVIDER_ADDRESS || DEFAULTS.PROVIDER_ADDRESS;

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

  let providerAccrued: bigint | null = null;
  try {
    providerAccrued = await staking.providerAccruedEmissions(providerAddress);
  } catch {
    // Fallback to event scan if the deployed proxy doesn't expose providerAccruedEmissions
    const latestBlock = await ethers.provider.getBlockNumber();
    const startBlockEnv = process.env.EVENT_START_BLOCK;
    const startBlock = startBlockEnv ? Number(startBlockEnv) : Math.max(0, latestBlock - 300_000);
    const chunkSize = 20_000;
    let lastTotalAccrued: bigint | null = null;

    for (let from = startBlock; from <= latestBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlock);
      const filter = staking.filters.ProviderEmissionsAccrued(providerAddress);
      const logs = await staking.queryFilter(filter, from, to);
      if (logs.length > 0) {
        const last = logs[logs.length - 1];
        const totalAccrued = (last.args?.totalAccrued ?? 0n) as bigint;
        lastTotalAccrued = totalAccrued;
      }
    }

    providerAccrued = lastTotalAccrued ?? 0n;
  }

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
  console.log(`Provider Accrued:    ${format(providerAccrued)} ${symbol}`);
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
