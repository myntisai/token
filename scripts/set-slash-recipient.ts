import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TREASURY = "0x2440433b6eB8A64E3175884714FA5a4F2aC56A12";

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const zkDistAddr = deployment.zkMerkleDistributor as string;

  const [signer] = await ethers.getSigners();
  const zkDist = await ethers.getContractAt("ZKMerkleDistributor", zkDistAddr);

  console.log("Setting slashRecipient on ZKMerkleDistributor...");
  console.log("ZK Distributor:", zkDistAddr);
  console.log("Signer:", signer.address);
  console.log("SlashRecipient:", TREASURY);

  const tx = await zkDist.setSlashRecipient(TREASURY);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status);

  const current = await zkDist.slashRecipient();
  console.log("slashRecipient set to:", current);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
