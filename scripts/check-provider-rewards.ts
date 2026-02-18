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
  const [available, locked] = await Promise.all([
    distributor.providerBalance(providerAddress),
    distributor.lockedBalance(providerAddress),
  ]);

  console.log("Provider:", providerAddress);
  console.log("Pending (staking):", format(pending), symbol);
  console.log("Distributor available:", format(available), symbol);
  console.log("Distributor locked:", format(locked), symbol);
  console.log("Distributor total:", format(available + locked), symbol);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
