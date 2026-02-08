import { ethers } from "hardhat";

// IMessageLibManager subset (EndpointV2 implements this).
const ENDPOINT_ABI = [
  "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
  "function setConfig(address oapp, address lib, tuple(uint32 eid,uint32 configType,bytes config)[] params) external",
];

async function main() {
  const endpointAddr = process.env.LZ_ENDPOINT;
  const fromOapp = process.env.FROM_OAPP;
  const toOapp = process.env.TO_OAPP;
  const lib = process.env.LIB;
  const eid = process.env.EID ? Number(process.env.EID) : 0;
  const types = (process.env.CONFIG_TYPES || "1,2")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (!endpointAddr || !ethers.isAddress(endpointAddr)) throw new Error("Missing/invalid LZ_ENDPOINT");
  if (!fromOapp || !ethers.isAddress(fromOapp)) throw new Error("Missing/invalid FROM_OAPP");
  if (!toOapp || !ethers.isAddress(toOapp)) throw new Error("Missing/invalid TO_OAPP");
  if (!lib || !ethers.isAddress(lib)) throw new Error("Missing/invalid LIB");
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Missing/invalid EID");
  if (types.length === 0) throw new Error("No CONFIG_TYPES");

  const [signer] = await ethers.getSigners();
  const endpoint = new ethers.Contract(endpointAddr, ENDPOINT_ABI, signer);
  const msgLib = new ethers.Contract(
    lib,
    ["function getConfig(uint16 eid, address oapp, uint256 configType) view returns (bytes)"],
    signer
  );

  console.log("Copying LZ config...");
  console.log("  Endpoint:", endpointAddr);
  console.log("  FromOApp:", fromOapp);
  console.log("  ToOApp:", toOapp);
  console.log("  Lib:", lib);
  console.log("  EID:", eid);
  console.log("  Types:", types.join(","));

  const params: { eid: number; configType: number; config: string }[] = [];
  for (const t of types) {
    let cfg: string;
    try {
      cfg = await endpoint.getConfig(fromOapp, lib, eid, t);
    } catch {
      // Some message libs do not support Endpoint.getConfig passthrough on certain networks.
      // Fallback to reading directly from the message lib contract.
      cfg = await msgLib.getConfig(eid, fromOapp, t);
    }
    console.log("  getConfig type", t, "len", cfg.length);
    params.push({ eid, configType: t, config: cfg });
  }

  // Avoid "nonce too low" races by using the pending nonce.
  const nonce = await ethers.provider.getTransactionCount(signer.address, "pending");
  const tx = await endpoint.setConfig(toOapp, lib, params, { nonce });
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ setConfig confirmed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
