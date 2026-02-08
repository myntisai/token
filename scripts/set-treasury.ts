import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const TREASURY = "0x2440433b6eB8A64E3175884714FA5a4F2aC56A12";

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const stakingAddr = deployment.dualPoolStaking as string;

  const [signer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);

  console.log("Setting treasury on DualPoolStaking...");
  console.log("Staking:", stakingAddr);
  console.log("Signer:", signer.address);
  console.log("Treasury:", TREASURY);

  const tx = await staking.setTreasury(TREASURY);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const current = await staking.treasury();
  console.log("Treasury set to:", current);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
