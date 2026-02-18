import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const stakingAddr = deployment.dualPoolStaking as string;
  const vaultAddr = deployment.liquidStakingVault as string;

  const [signer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);

  console.log("Setting liquid staking vault on DualPoolStaking...");
  console.log("Staking:", stakingAddr);
  console.log("Signer:", signer.address);
  console.log("Vault:", vaultAddr);

  const tx = await staking.setLiquidStakingVault(vaultAddr);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status);

  const current = await staking.liquidStakingVault();
  console.log("LiquidStakingVault set to:", current);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
