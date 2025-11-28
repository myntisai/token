import { ethers } from "hardhat";

const SPOKE_ADDRESS = "0x0042d3E3eEd282e0896e655C2bAAA3cBE2d9AEB8";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking Ethereum Sepolia Spoke...\n");
  console.log("Address:", deployer.address);
  
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_ADDRESS);
  
  const balance = await spoke.balanceOf(deployer.address);
  console.log("MYNT Balance:", ethers.formatEther(balance));
  
  const totalSupply = await spoke.totalSupply();
  console.log("Total Supply:", ethers.formatEther(totalSupply));
}

main().catch(console.error);
