import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  const pending = await spoke.pendingQuotaRequestNonce();
  if (pending === 0n) {
    console.log("No pending quota request. Nothing to clear.");
    return;
  }

  console.log("Clearing pending quota request...");
  console.log("  Spoke:", spokeAddr);
  console.log("  Signer:", signer.address);
  console.log("  Pending nonce:", pending.toString());

  const tx = await spoke.clearPendingQuotaRequest();
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Cleared in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
