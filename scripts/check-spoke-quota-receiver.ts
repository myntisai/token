import { ethers } from "hardhat";

async function main() {
  const spokeTokenAddr = process.env.SPOKE_TOKEN;
  if (!spokeTokenAddr || !ethers.isAddress(spokeTokenAddr)) throw new Error("Missing/invalid SPOKE_TOKEN");

  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeTokenAddr);
  const receiverAddr = await spoke.quotaReceiver();
  console.log("Spoke:", spokeTokenAddr);
  console.log("quotaReceiver:", receiverAddr);

  const receiver = await ethers.getContractAt("SpokeQuotaReceiver", receiverAddr);
  console.log("hubChainId:", (await receiver.hubChainId()).toString());
  console.log("registryPeer:", await receiver.registryPeer());
  console.log("peer(hubEid):", await receiver.peers(await receiver.hubChainId()));
  console.log("spokeToken:", await receiver.spokeToken());
  console.log("lastQuotaNonce:", (await receiver.lastQuotaNonce()).toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

