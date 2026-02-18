import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const TREASURY = "0x2440433b6eB8A64E3175884714FA5a4F2aC56A12";

// Minimal Type 3 options: 0x0003 (no extra worker options)
const QUOTA_OPTIONS = "0x0003";

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const registryAddr = deployment.globalSupplyRegistry as string;

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);

  console.log("Setting quota update options/refund address...");
  console.log("Registry:", registryAddr);
  console.log("Signer:", signer.address);
  console.log("Options:", QUOTA_OPTIONS);
  console.log("RefundAddress:", TREASURY);

  const tx = await registry.setQuotaUpdateOptions(QUOTA_OPTIONS, TREASURY);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const opts = await registry.quotaUpdateOptions();
  const refund = await registry.quotaUpdateRefundAddress();
  console.log("Options set to:", opts);
  console.log("Refund address:", refund);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
