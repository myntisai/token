import { ethers } from "hardhat";

// Dumps endpoint.getConfig(oapp, lib, eid, configType) for debugging ULN setup.
//
// Usage:
// LZ_ENDPOINT=0x... OAPP=0x... LIB=0x... EID=40245 TYPES=1,2 npx hardhat run scripts/dump-lz-config.ts --network arbitrum-sepolia
//
// If LIB is omitted, the script will try endpoint.getReceiveLibrary(OAPP,EID) and use that lib.
async function main() {
  const endpointAddr = process.env.LZ_ENDPOINT;
  const oapp = process.env.OAPP;
  const libOverride = process.env.LIB;
  const eidRaw = process.env.EID;
  const typesRaw = process.env.TYPES || "2";

  if (!endpointAddr || !ethers.isAddress(endpointAddr)) throw new Error("Missing/invalid LZ_ENDPOINT");
  if (!oapp || !ethers.isAddress(oapp)) throw new Error("Missing/invalid OAPP");
  if (!eidRaw) throw new Error("Missing EID");
  const eid = Number(eidRaw);
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Invalid EID");

  const typeList = typesRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0);
  if (typeList.length === 0) throw new Error("No TYPES");

  const ENDPOINT_ABI = [
    "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
    "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
  ];
  const endpoint = new ethers.Contract(endpointAddr, ENDPOINT_ABI, await ethers.provider.getSigner());

  let lib = libOverride;
  if (!lib) {
    const [recvLib] = await endpoint.getReceiveLibrary(oapp, eid);
    lib = recvLib;
  }
  if (!lib || !ethers.isAddress(lib)) throw new Error("Missing/invalid LIB (and failed to infer)");

  console.log("endpoint:", endpointAddr);
  console.log("oapp:", oapp);
  console.log("eid:", eid);
  console.log("lib:", lib);
  console.log("types:", typeList.join(","));

  for (const t of typeList) {
    const bytes = await endpoint.getConfig(oapp, lib, eid, t);
    console.log(`configType ${t}:`, bytes);
    console.log(`configType ${t} length:`, (bytes.length - 2) / 2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

