import { ethers } from "hardhat";

const SPOKE_ADDRESS = "0x9bC5fC24778A967f4d42C0789F161a347867A778";
const HUB_EID = 40245;
const HUB_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";

async function main() {
  const [deployer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_ADDRESS);
  const bal = await spoke.balanceOf(deployer.address);
  const supply = await spoke.totalSupply();
  const peer = await spoke.peers(HUB_EID);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(bal)} MYNT`);
  console.log(`Supply:   ${ethers.formatEther(supply)} MYNT`);
  console.log(`Peer(${HUB_EID}): ${peer}`);
  console.log(`Expected: ${ethers.zeroPadValue(HUB_MYNTIS, 32)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
