import { ethers } from "hardhat";

const HUB_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", HUB_MYNTIS);
  const owner = await hub.owner();
  const peer = await hub.peers(ETH_SEPOLIA_EID);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Peer(${ETH_SEPOLIA_EID}): ${peer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
