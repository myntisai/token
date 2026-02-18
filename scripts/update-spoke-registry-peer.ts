import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Missing or invalid REGISTRY_ADDRESS");
  }

  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const quotaReceiver =
    process.env.QUOTA_RECEIVER || "0x691fb2D51d3178a78612Fd6E1FfFF4c184ce21C9";

  const [signer] = await ethers.getSigners();
  console.log("=== UPDATE SPOKE REGISTRY PEER ===");
  console.log("Signer:", signer.address);
  console.log("Spoke:", spokeAddr);
  console.log("Registry:", registryAddress);
  console.log("QuotaReceiver:", quotaReceiver);

  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);
  const tx1 = await spoke.setRegistryPeer(ethers.zeroPadValue(registryAddress, 32));
  await tx1.wait();
  console.log("✅ Spoke setRegistryPeer tx:", tx1.hash);

  const receiver = await ethers.getContractAt("SpokeQuotaReceiver", quotaReceiver);
  const tx2 = await receiver.setRegistryPeer(ethers.zeroPadValue(registryAddress, 32));
  await tx2.wait();
  console.log("✅ QuotaReceiver setRegistryPeer tx:", tx2.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
