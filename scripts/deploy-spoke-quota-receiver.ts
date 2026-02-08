import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const endpoint = process.env.LZ_ENDPOINT || "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const hubEid = process.env.HUB_EID ? Number(process.env.HUB_EID) : 40245;
  const localEid = process.env.LOCAL_EID ? Number(process.env.LOCAL_EID) : 40231;
  const registry = process.env.REGISTRY_ADDRESS || "0x8B269FD6cf9df0914A41b32f0aF4B3d18E76291d";
  const spokeToken = process.env.SPOKE_TOKEN;

  if (!spokeToken || !ethers.isAddress(spokeToken)) {
    throw new Error("Missing or invalid SPOKE_TOKEN");
  }

  console.log("Deploying SpokeQuotaReceiver...");
  console.log("  Deployer:", deployer.address);
  console.log("  Endpoint:", endpoint);
  console.log("  Hub EID:", hubEid);
  console.log("  Local EID:", localEid);
  console.log("  Registry:", registry);
  console.log("  SpokeToken:", spokeToken);

  const Receiver = await ethers.getContractFactory("SpokeQuotaReceiver");
  const receiver = await Receiver.deploy(
    endpoint,
    hubEid,
    localEid,
    ethers.zeroPadValue(registry, 32),
    spokeToken,
    deployer.address
  );
  await receiver.waitForDeployment();
  const receiverAddr = await receiver.getAddress();
  console.log("✅ SpokeQuotaReceiver deployed:", receiverAddr);

  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeToken);
  console.log("Setting quota receiver on spoke...");
  // Ensure immediate application (otherwise setQuotaReceiver schedules by default).
  const tx0 = await spoke.setQuotaReceiverUpdateDelay(0);
  await tx0.wait();
  const tx1 = await spoke.setQuotaReceiver(receiverAddr);
  await tx1.wait();
  console.log("✅ setQuotaReceiver tx:", tx1.hash);
  const tx0b = await spoke.setQuotaReceiverUpdateDelay(86400);
  await tx0b.wait();

  console.log("Setting registry peer on spoke...");
  const tx2 = await spoke.setRegistryPeer(ethers.zeroPadValue(registry, 32));
  await tx2.wait();
  console.log("✅ setRegistryPeer tx:", tx2.hash);

  console.log("\nSummary:");
  console.log("  SpokeQuotaReceiver:", receiverAddr);
  console.log("  SpokeToken:", spokeToken);
  console.log("  Registry:", registry);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
