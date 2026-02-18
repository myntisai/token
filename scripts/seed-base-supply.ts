import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const BASE_CHAIN_ID = 84532;

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = base.myntis as string;
  const registryAddr = base.globalSupplyRegistry as string;

  const [signer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", hubAddr);
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);

  const supply = await hub.totalSupply();
  console.log("=== SEED BASE SUPPLY ===");
  console.log("Hub:", hubAddr);
  console.log("Registry:", registryAddr);
  console.log("ChainId:", BASE_CHAIN_ID);
  console.log("TotalSupply:", supply.toString());

  const tx = await registry.seedChainSupply(BASE_CHAIN_ID, supply);
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ seedChainSupply confirmed in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
