import { ethers } from "hardhat";

const HUB = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const EID = 40161;

async function main() {
  const hub = await ethers.getContractAt("Myntis", HUB);
  const opts = await hub.enforcedOptions(EID, 1);
  console.log(`enforcedOptions(EID ${EID}, msgType 1): ${opts}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
