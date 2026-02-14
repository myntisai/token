import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TREASURY = process.env.TREASURY;

async function main() {
  if (!TREASURY || !ethers.isAddress(TREASURY)) {
    throw new Error("Missing or invalid TREASURY env var.");
  }
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingAddr = deployment.dualPoolStaking as string;

  const [signer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);

  console.log("Setting treasury on DualPoolStaking...");
  console.log("Network:", network.name);
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
