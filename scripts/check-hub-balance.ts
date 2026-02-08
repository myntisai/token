import { ethers } from "hardhat";

const HUB_ADDRESS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";

async function main() {
  const [deployer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", HUB_ADDRESS);
  const bal = await hub.balanceOf(deployer.address);
  const supply = await hub.totalSupply();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(bal)} MYNT`);
  console.log(`Supply:   ${ethers.formatEther(supply)} MYNT`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
