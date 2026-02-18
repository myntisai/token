import { ethers } from "hardhat";

const SPOKE_OFT = process.env.SPOKE_OFT || "0x9bC5fC24778A967f4d42C0789F161a347867A778";
const HUB_EID = process.env.HUB_EID ? Number(process.env.HUB_EID) : 40245;
const HUB_MYNTIS = process.env.HUB_MYNTIS || "0x599016bF00eE23d531223c6285C92aa0cAC278EF";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${network.name} (${network.chainId})`);

  const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_OFT);
  const peerBytes32 = ethers.zeroPadValue(HUB_MYNTIS, 32);
  console.log(`Setting peer for EID ${HUB_EID} to ${peerBytes32}`);

  const tx = await spoke.setPeer(HUB_EID, peerBytes32);
  console.log(`Tx: ${tx.hash}`);
  await tx.wait();

  const setPeer = await spoke.peers(HUB_EID);
  console.log(`Verified peer: ${setPeer}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
