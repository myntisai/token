import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const quotaReceiver = process.env.QUOTA_RECEIVER;
  const eid = process.env.SPOKE_EID ? Number(process.env.SPOKE_EID) : 0;

  if (!registryAddress || !ethers.isAddress(registryAddress)) throw new Error("Missing/invalid REGISTRY_ADDRESS");
  if (!quotaReceiver || !ethers.isAddress(quotaReceiver)) throw new Error("Missing/invalid QUOTA_RECEIVER");
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Missing/invalid SPOKE_EID");

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddress);

  console.log("Registering quota receiver...");
  console.log("  Signer:", signer.address);
  console.log("  Registry:", registryAddress);
  console.log("  EID:", eid);
  console.log("  QuotaReceiver:", quotaReceiver);

  // Bump fees to avoid accidental "replacement underpriced" if mempool is weird.
  const feeData = await ethers.provider.getFeeData();
  const maxPriority = feeData.maxPriorityFeePerGas ?? 2n * 10n ** 9n;
  const maxFee = feeData.maxFeePerGas ?? 20n * 10n ** 9n;

  const tx = await registry.registerQuotaReceiver(eid, ethers.zeroPadValue(quotaReceiver, 32), {
    maxPriorityFeePerGas: maxPriority + 1n * 10n ** 9n,
    maxFeePerGas: maxFee + 2n * 10n ** 9n,
  });
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ registerQuotaReceiver confirmed");

  console.log("Stored:", await registry.quotaReceivers(eid));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

