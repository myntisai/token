import { ethers } from "hardhat";

const ENDPOINT_ABI = [
  "function setSendLibrary(address oapp, uint32 eid, address lib) external",
  "function setReceiveLibrary(address oapp, uint32 eid, address lib, uint256 gracePeriod) external"
];

async function main() {
  const endpointAddress = process.env.LZ_ENDPOINT;
  const sendLib = process.env.LZ_SEND_LIB;
  const receiveLib = process.env.LZ_RECEIVE_LIB;
  const dstEidRaw = process.env.DST_EID;
  const appAddress = process.env.LZ_APP_ADDRESS;
  const gracePeriodRaw = process.env.LZ_GRACE_PERIOD ?? "0";

  if (!endpointAddress || !ethers.isAddress(endpointAddress)) {
    throw new Error("Missing or invalid LZ_ENDPOINT");
  }
  if (!sendLib || !ethers.isAddress(sendLib)) {
    throw new Error("Missing or invalid LZ_SEND_LIB");
  }
  if (!receiveLib || !ethers.isAddress(receiveLib)) {
    throw new Error("Missing or invalid LZ_RECEIVE_LIB");
  }
  if (!dstEidRaw) {
    throw new Error("Missing DST_EID");
  }
  if (!appAddress || !ethers.isAddress(appAddress)) {
    throw new Error("Missing or invalid LZ_APP_ADDRESS");
  }

  const dstEid = Number(dstEidRaw);
  if (!Number.isInteger(dstEid) || dstEid <= 0) {
    throw new Error(`Invalid DST_EID \"${dstEidRaw}\"`);
  }
  const gracePeriod = BigInt(gracePeriodRaw);

  const [signer] = await ethers.getSigners();
  const endpoint = new ethers.Contract(endpointAddress, ENDPOINT_ABI, signer);

  console.log("Configuring app libraries:");
  console.log("  endpoint:", endpointAddress);
  console.log("  app:", appAddress);
  console.log("  dstEid:", dstEid);
  console.log("  sendLib:", sendLib);
  console.log("  receiveLib:", receiveLib);

  const tx1 = await endpoint.setSendLibrary(appAddress, dstEid, sendLib);
  console.log("  setSendLibrary tx:", tx1.hash);
  await tx1.wait();

  const tx2 = await endpoint.setReceiveLibrary(appAddress, dstEid, receiveLib, gracePeriod);
  console.log("  setReceiveLibrary tx:", tx2.hash);
  await tx2.wait();

  console.log("✅ App libraries configured");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
