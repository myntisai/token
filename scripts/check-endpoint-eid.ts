import { ethers } from "hardhat";

const ENDPOINT_ABI = [
  "function defaultSendLibrary(uint32 dstEid) view returns (address)",
  "function defaultReceiveLibrary(uint32 srcEid) view returns (address)"
];

async function main() {
  const endpointAddress = process.env.LZ_ENDPOINT;
  const dstEidRaw = process.env.DST_EID;

  if (!endpointAddress || !ethers.isAddress(endpointAddress)) {
    throw new Error("Missing or invalid LZ_ENDPOINT");
  }
  if (!dstEidRaw) {
    throw new Error("Missing DST_EID");
  }
  const eid = Number(dstEidRaw);
  if (!Number.isInteger(eid) || eid <= 0) {
    throw new Error(`Invalid DST_EID "${dstEidRaw}"`);
  }

  const endpoint = new ethers.Contract(endpointAddress, ENDPOINT_ABI, await ethers.provider.getSigner());
  const sendLib = await endpoint.defaultSendLibrary(eid);
  const recvLib = await endpoint.defaultReceiveLibrary(eid);
  console.log(`Endpoint: ${endpointAddress}`);
  console.log(`EID: ${eid}`);
  console.log(`defaultSendLibrary: ${sendLib}`);
  console.log(`defaultReceiveLibrary: ${recvLib}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
