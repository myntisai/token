import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json"), "utf8"));
  const stakingAddr = dep.dualPoolStaking as string;
  const provider = process.env.PROVIDER_ADDRESS || dep.deployer;

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);
  const accrued = await staking.providerAccruedEmissions(provider);
  const total = await staking.totalProviderAccruedEmissions();
  console.log("provider", provider);
  console.log("providerAccruedEmissions", ethers.formatEther(accrued));
  console.log("totalProviderAccruedEmissions", ethers.formatEther(total));
}

main().catch((e)=>{console.error(e); process.exitCode=1;});
