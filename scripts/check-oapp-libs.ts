import { ethers } from "hardhat";

const ENDPOINT_ABI = [
  "function delegates(address) view returns (address)",
  "function getSendLibrary(address sender, uint32 dstEid) view returns (address lib)",
  "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
  "function isDefaultSendLibrary(address sender, uint32 dstEid) view returns (bool)",
];

async function main() {
  const endpointAddr = process.env.LZ_ENDPOINT;
  const app = process.env.LZ_APP_ADDRESS;
  const eid = process.env.EID ? Number(process.env.EID) : 0;
  if (!endpointAddr || !ethers.isAddress(endpointAddr)) throw new Error("Missing/invalid LZ_ENDPOINT");
  if (!app || !ethers.isAddress(app)) throw new Error("Missing/invalid LZ_APP_ADDRESS");
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Missing/invalid EID");

  const [signer] = await ethers.getSigners();
  const endpoint = new ethers.Contract(endpointAddr, ENDPOINT_ABI, signer);

  console.log("Endpoint:", endpointAddr);
  console.log("App:", app);
  console.log("EID:", eid);
  console.log("Delegate:", await endpoint.delegates(app));

  const sendLib = await endpoint.getSendLibrary(app, eid);
  const isDefaultSend = await endpoint.isDefaultSendLibrary(app, eid);
  const [recvLib, recvIsDefault] = await endpoint.getReceiveLibrary(app, eid);
  console.log("SendLib:", sendLib, "default?", isDefaultSend);
  console.log("RecvLib:", recvLib, "default?", recvIsDefault);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

