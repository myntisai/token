import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.prod"), override: true });

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const STAKING_ABI = [
  "function pendingRewards(address) view returns (uint256)",
  "function providerAccruedEmissions(address) view returns (uint256)",
  "event ProviderEmissionsAccrued(address indexed provider, uint256 amount, uint256 totalAccrued)",
];

const DISTRIBUTOR_ABI = [
  "function providerBalance(address) view returns (uint256)",
  "function lockedBalance(address) view returns (uint256)",
];

async function main() {
  const providerAddress =
    process.env.NEXT_PUBLIC_PROVIDER_ADDRESS || process.env.PROVIDER_ADDRESS;
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS;
  const distributorAddress = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS;

  if (!providerAddress || !tokenAddress || !stakingAddress || !distributorAddress) {
    throw new Error(
      "Missing env vars. Need NEXT_PUBLIC_PROVIDER_ADDRESS/PROVIDER_ADDRESS, MYNTIS_TOKEN_ADDRESS, STAKING_CONTRACT_ADDRESS, ZK_MERKLE_DISTRIBUTOR_ADDRESS"
    );
  }

  const rpcUrl = process.env.RPC_URL;
  const provider = rpcUrl ? new ethers.JsonRpcProvider(rpcUrl) : ethers.provider;

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const staking = new ethers.Contract(stakingAddress, STAKING_ABI, provider);
  const distributor = new ethers.Contract(distributorAddress, DISTRIBUTOR_ABI, provider);

  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  const format = (value: bigint) => ethers.formatUnits(value, decimals);

  const pending = await staking.pendingRewards(providerAddress);
  let accrued: bigint | null = null;
  try {
    accrued = await staking.providerAccruedEmissions(providerAddress);
  } catch {
    const latestBlock = await provider.getBlockNumber();
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
    accrued = lastTotalAccrued ?? 0n;
  }

  const [available, locked] = await Promise.all([
    distributor.providerBalance(providerAddress),
    distributor.lockedBalance(providerAddress),
  ]);

  console.log("Provider:", providerAddress);
  console.log("Pending (staking):", format(pending), symbol);
  console.log("Accrued (staking):", format(accrued), symbol);
  console.log("Distributor available:", format(available), symbol);
  console.log("Distributor locked:", format(locked), symbol);
  console.log("Distributor total:", format(available + locked), symbol);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
