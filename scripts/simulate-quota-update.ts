import { ethers } from "hardhat";

// Simulate the hub -> spoke quota update delivery using eth_call, to capture revert reasons.
//
// Usage (arb):
// RECEIVER=0x... SPOKE_TOKEN=0x... HUB_EID=40245 HUB_PEER=0x... CHAIN_ID=40231 GRANTED=1 NONCE=12
// npx hardhat run scripts/simulate-quota-update.ts --network arbitrum-sepolia
//
// Notes:
// - HUB_PEER is bytes32 (0x + 64 hex chars) peer stored in SpokeQuotaReceiver.peers(HUB_EID)
// - GRANTED is in MYNT (ether units), NONCE is uint256
async function main() {
  const receiverAddr = process.env.RECEIVER;
  const spokeTokenAddr = process.env.SPOKE_TOKEN;
  const hubEid = process.env.HUB_EID ? Number(process.env.HUB_EID) : 0;
  const hubPeer = process.env.HUB_PEER;
  const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 0;
  const granted = process.env.GRANTED ? ethers.parseEther(process.env.GRANTED) : 0n;
  const nonce = process.env.NONCE ? BigInt(process.env.NONCE) : 0n;

  if (!receiverAddr || !ethers.isAddress(receiverAddr)) throw new Error("Missing/invalid RECEIVER");
  if (!spokeTokenAddr || !ethers.isAddress(spokeTokenAddr)) throw new Error("Missing/invalid SPOKE_TOKEN");
  if (!hubPeer || !hubPeer.startsWith("0x") || hubPeer.length !== 66) throw new Error("Missing/invalid HUB_PEER bytes32");
  if (!Number.isInteger(hubEid) || hubEid <= 0) throw new Error("Missing/invalid HUB_EID");
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error("Missing/invalid CHAIN_ID");
  if (granted <= 0n) throw new Error("Missing/invalid GRANTED");
  if (nonce <= 0n) throw new Error("Missing/invalid NONCE");

  const endpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";

  const receiver = await ethers.getContractAt("SpokeQuotaReceiver", receiverAddr);
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeTokenAddr);

  console.log("receiver:", receiverAddr);
  console.log("spokeToken:", spokeTokenAddr);
  console.log("endpoint:", endpoint);
  console.log("spoke.quotaReceiver():", await spoke.quotaReceiver());
  console.log("receiver.spokeToken():", await receiver.spokeToken());
  console.log("receiver.hubChainId():", (await receiver.hubChainId()).toString());
  console.log("receiver.registryPeer():", await receiver.registryPeer());

  const Origin = {
    srcEid: hubEid,
    sender: hubPeer,
    nonce: 0, // not used by our receiver checks
  };

  // MSG_QUOTA_UPDATE = 3
  const msgType = 3;
  const message = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8", "tuple(uint32 chainId,uint256 grantedQuota,uint256 nonce)"],
    [msgType, { chainId, grantedQuota: granted, nonce }]
  );

  const data = receiver.interface.encodeFunctionData("lzReceive", [
    Origin,
    ethers.ZeroHash, // guid
    message,
    ethers.ZeroAddress, // executor
    "0x", // extraData
  ]);

  try {
    await ethers.provider.call({
      to: receiverAddr,
      from: endpoint,
      data,
      value: 0,
    });
    console.log("✅ simulation ok (no revert)");
  } catch (e: any) {
    console.log("❌ simulation reverted");
    console.log(e?.shortMessage || e?.message || String(e));
    if (e?.data) console.log("revert.data:", e.data);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
