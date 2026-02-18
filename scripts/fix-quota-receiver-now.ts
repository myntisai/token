import pkg from "hardhat";

// Fix helper for testnets:
// - Set quotaReceiver update delay to 0
// - Set quotaReceiver immediately
// - Optionally restore delay (RESTORE_DELAY_SECONDS, default 86400)
//
// Usage:
// SPOKE_TOKEN=0x... NEW_RECEIVER=0x... npx hardhat run scripts/fix-quota-receiver-now.ts --network arbitrum-sepolia
// RESTORE_DELAY_SECONDS=0 to keep it at 0.
async function main() {
  const { ethers } = pkg as unknown as typeof import("hardhat");

  const spokeTokenAddr = process.env.SPOKE_TOKEN;
  const newReceiver = process.env.NEW_RECEIVER;
  if (!spokeTokenAddr || !ethers.isAddress(spokeTokenAddr)) throw new Error("Missing/invalid SPOKE_TOKEN");
  if (!newReceiver || !ethers.isAddress(newReceiver)) throw new Error("Missing/invalid NEW_RECEIVER");

  const restoreDelaySeconds = process.env.RESTORE_DELAY_SECONDS
    ? Number(process.env.RESTORE_DELAY_SECONDS)
    : 86400;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeTokenAddr, signer);

  const before = await spoke.quotaReceiver();
  const delayBefore = await spoke.quotaReceiverUpdateDelay();
  console.log("Spoke:", spokeTokenAddr);
  console.log("signer:", await signer.getAddress());
  console.log("quotaReceiver(before):", before);
  console.log("quotaReceiverUpdateDelay(before):", delayBefore.toString());

  // Set delay to 0 so setQuotaReceiver applies immediately.
  const tx1 = await spoke.setQuotaReceiverUpdateDelay(0);
  console.log("tx.setQuotaReceiverUpdateDelay(0):", tx1.hash);
  await tx1.wait();

  const tx2 = await spoke.setQuotaReceiver(newReceiver);
  console.log("tx.setQuotaReceiver(new):", tx2.hash);
  await tx2.wait();

  if (restoreDelaySeconds >= 0) {
    const tx3 = await spoke.setQuotaReceiverUpdateDelay(restoreDelaySeconds);
    console.log("tx.setQuotaReceiverUpdateDelay(restore):", tx3.hash);
    await tx3.wait();
  }

  const after = await spoke.quotaReceiver();
  const delayAfter = await spoke.quotaReceiverUpdateDelay();
  console.log("quotaReceiver(after):", after);
  console.log("quotaReceiverUpdateDelay(after):", delayAfter.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

