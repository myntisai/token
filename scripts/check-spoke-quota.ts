import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  console.log("=== SPOKE QUOTA STATE ===");
  console.log("Spoke:", spokeAddr);
  console.log("Signer:", signer.address);
  console.log("mintQuota:", ethers.formatEther(await spoke.mintQuota()), "MYNT");
  console.log("quotaConsumedSinceLastRequest:", ethers.formatEther(await spoke.quotaConsumedSinceLastRequest()), "MYNT");
  console.log("pendingQuotaRequestNonce:", (await spoke.pendingQuotaRequestNonce()).toString());
  console.log("pendingQuotaConsumed:", ethers.formatEther(await spoke.pendingQuotaConsumed()), "MYNT");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
