import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const registryAddr = deployment.globalSupplyRegistry as string;
  const tokenAddr = deployment.myntis as string;

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);

  console.log("Registering token with GlobalSupplyRegistry...");
  console.log("Signer:", signer.address);
  console.log("Registry:", registryAddr);
  console.log("Token:", tokenAddr);

  const tokenRole = await registry.TOKEN_ROLE();
  const hasRole = await registry.hasRole(tokenRole, tokenAddr);
  if (hasRole) {
    console.log("TOKEN_ROLE already granted to token.");
    return;
  }

  const tx = await registry.registerToken(tokenAddr);
  console.log("Tx:", tx.hash);
  await tx.wait();

  console.log("✅ Token registered.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
