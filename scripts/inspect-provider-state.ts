import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingAddr = dep.dualPoolStaking as string;
  const tokenAddr = dep.myntis as string;

  const provider = process.env.PROVIDER_ADDRESS || dep.deployer;

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);
  const token = await ethers.getContractAt("IERC20", tokenAddr);

  const [stake, rewardDebt] = await staking.getProviderInfo(provider);
  const pending = await staking.pendingRewards(provider);
  const p = await staking.providerPool();
  const bal = await token.balanceOf(stakingAddr);

  console.log("network", network.name);
  console.log("provider", provider);
  console.log("staking", stakingAddr);
  console.log("token", tokenAddr);
  console.log("tokenBalance(staking)", ethers.formatEther(bal));
  console.log("provider.amount", ethers.formatEther(stake));
  console.log("provider.rewardDebt", ethers.formatEther(rewardDebt));
  console.log("pendingRewards(provider)", ethers.formatEther(pending));
  console.log("providerPool.totalStaked", ethers.formatEther(p.totalStaked));
  console.log("providerPool.accRewardPerShare", p.accRewardPerShare.toString());
  console.log("providerPool.totalRewards", ethers.formatEther(p.totalRewards));

  const implied = (stake * p.accRewardPerShare) / 1_000_000_000_000n;
  console.log("impliedAccumulated", ethers.formatEther(implied));
  console.log("impliedPending", ethers.formatEther(implied > rewardDebt ? implied - rewardDebt : 0n));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
