import { ethers } from "hardhat";

async function main() {
  const registryAddress =
    process.env.REGISTRY_ADDRESS || "0x8B269FD6cf9df0914A41b32f0aF4B3d18E76291d";
  const spokeAddress = process.env.SPOKE_ADDRESS;
  const quotaReceiver = process.env.QUOTA_RECEIVER;
  const eid = process.env.SPOKE_EID ? Number(process.env.SPOKE_EID) : 0;

  if (!ethers.isAddress(registryAddress)) {
    throw new Error("Invalid REGISTRY_ADDRESS");
  }
  if (!spokeAddress || !ethers.isAddress(spokeAddress)) {
    throw new Error("Missing or invalid SPOKE_ADDRESS");
  }
  if (!quotaReceiver || !ethers.isAddress(quotaReceiver)) {
    throw new Error("Missing or invalid QUOTA_RECEIVER");
  }
  if (!Number.isInteger(eid) || eid <= 0) {
    throw new Error("Missing or invalid SPOKE_EID");
  }

  const [signer] = await ethers.getSigners();
  console.log("Wiring registry for spoke...");
  console.log("  Signer:", signer.address);
  console.log("  Registry:", registryAddress);
  console.log("  Spoke:", spokeAddress);
  console.log("  QuotaReceiver:", quotaReceiver);
  console.log("  EID:", eid);

  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddress);

  console.log("\nRegistering spoke peer...");
  const tx1 = await registry.registerSpoke(eid, ethers.zeroPadValue(spokeAddress, 32));
  await tx1.wait();
  console.log("  registerSpoke tx:", tx1.hash);

  console.log("Registering quota receiver...");
  const tx2 = await registry.registerQuotaReceiver(eid, ethers.zeroPadValue(quotaReceiver, 32));
  await tx2.wait();
  console.log("  registerQuotaReceiver tx:", tx2.hash);

  console.log("\nVerification:");
  const storedPeer = await registry.peers(eid);
  const storedReceiver = await registry.quotaReceivers(eid);
  console.log("  Peer:", storedPeer);
  console.log("  QuotaReceiver:", storedReceiver);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
