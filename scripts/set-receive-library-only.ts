import { ethers } from "hardhat";

const ENDPOINT_ABI = [
  "function setReceiveLibrary(address oapp, uint32 eid, address lib, uint256 gracePeriod) external",
];

async function main() {
  const endpointAddr = process.env.LZ_ENDPOINT;
  const app = process.env.LZ_APP_ADDRESS;
  const eid = process.env.EID ? Number(process.env.EID) : 0;
  const lib = process.env.LZ_RECEIVE_LIB;
  const grace = process.env.GRACE ? BigInt(process.env.GRACE) : 0n;

  if (!endpointAddr || !ethers.isAddress(endpointAddr)) throw new Error("Missing/invalid LZ_ENDPOINT");
  if (!app || !ethers.isAddress(app)) throw new Error("Missing/invalid LZ_APP_ADDRESS");
  if (!lib || !ethers.isAddress(lib)) throw new Error("Missing/invalid LZ_RECEIVE_LIB");
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Missing/invalid EID");

  const [signer] = await ethers.getSigners();
  const endpoint = new ethers.Contract(endpointAddr, ENDPOINT_ABI, signer);

  const nonce = await signer.getNonce();
  console.log("Setting receive library...");
  console.log("  Signer:", signer.address);
  console.log("  Endpoint:", endpointAddr);
  console.log("  App:", app);
  console.log("  EID:", eid);
  console.log("  ReceiveLib:", lib);
  console.log("  Grace:", grace.toString());
  console.log("  Nonce:", nonce);

  const tx = await endpoint.setReceiveLibrary(app, eid, lib, grace, { nonce });
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ setReceiveLibrary confirmed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

