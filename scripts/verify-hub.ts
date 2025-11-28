import { ethers } from "hardhat";

async function main() {
  const addr = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
  
  console.log("Verifying MyntisOFT at:", addr);
  
  const code = await ethers.provider.getCode(addr);
  console.log("Contract code exists:", code.length > 2);
  
  if (code.length > 2) {
    const contract = await ethers.getContractAt("MyntisOFT", addr);
    console.log("Name:", await contract.name());
    console.log("Symbol:", await contract.symbol());
    console.log("Total Supply:", ethers.formatEther(await contract.totalSupply()));
    console.log("Max Supply:", ethers.formatEther(await contract.MAX_SUPPLY()));
  }
}

main().catch(console.error);
