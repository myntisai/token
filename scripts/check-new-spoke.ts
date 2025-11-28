import { ethers } from "hardhat";

const SPOKE_NEW = "0x6d059168ae5250c8637b7EFc3343F5509BB0118B";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking NEW Spoke on Ethereum Sepolia...\n");
  
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_NEW);
  
  console.log("Name:", await spoke.name());
  console.log("Symbol:", await spoke.symbol());
  console.log("Is Hub:", await spoke.isHub());
  console.log("Hub Chain EID:", await spoke.hubChainEid());
  console.log("Emergency Mint Limit:", ethers.formatEther(await spoke.EMERGENCY_MINT_LIMIT()), "MYNT");
  console.log("\nUser Balance:", ethers.formatEther(await spoke.balanceOf(deployer.address)), "MYNT");
  console.log("Total Supply:", ethers.formatEther(await spoke.totalSupply()), "MYNT");
}

main().catch(console.error);
