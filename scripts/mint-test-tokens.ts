import { ethers } from "hardhat";

async function main() {
  const hubAddr = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
  const [deployer] = await ethers.getSigners();
  
  console.log("Minting test tokens on hub...");
  console.log("Deployer:", deployer.address);
  
  const contract = await ethers.getContractAt("MyntisOFT", hubAddr);
  
  // Mint 10,000 MYNT for testing
  const amount = ethers.parseEther("10000");
  console.log("Minting:", ethers.formatEther(amount), "MYNT");
  
  const tx = await contract.mintImmediate(deployer.address, amount);
  await tx.wait();
  
  console.log("✅ Minted!");
  console.log("New balance:", ethers.formatEther(await contract.balanceOf(deployer.address)), "MYNT");
  console.log("Total supply:", ethers.formatEther(await contract.totalSupply()), "MYNT");
}

main().catch(console.error);
