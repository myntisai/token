import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json"), "utf8"));
  const tokenAddr = dep.myntis as string;
  const stakingAddr = dep.dualPoolStaking as string;
  const distAddr = dep.zkMerkleDistributor as string;
  const vaultAddr = dep.liquidStakingVault as string;
  const treasury = "0x2440433b6eB8A64E3175884714FA5a4F2aC56A12";
  const deployer = dep.deployer as string;

  const token = await ethers.getContractAt("IERC20", tokenAddr);
  const addrs: Record<string,string> = {deployer, staking: stakingAddr, distributor: distAddr, vault: vaultAddr, treasury};
  for (const [k,a] of Object.entries(addrs)) {
    const b = await token.balanceOf(a);
    console.log(k, a, ethers.formatEther(b));
  }
}

main().catch((e)=>{console.error(e);process.exitCode=1;});
