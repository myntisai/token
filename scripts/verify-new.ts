import { ethers } from "hardhat";

async function main() {
  // New deployments
  const HUB_NEW = "0xE1eFd4598Cb371035F78dD3eb4151A7498F9dEa4";
  
  console.log("Verifying NEW MyntisOFT at:", HUB_NEW);
  
  const code = await ethers.provider.getCode(HUB_NEW);
  console.log("Contract code exists:", code.length > 2);
  
  if (code.length > 2) {
    const contract = await ethers.getContractAt("MyntisOFT", HUB_NEW);
    console.log("Name:", await contract.name());
    console.log("Symbol:", await contract.symbol());
    console.log("Total Supply:", ethers.formatEther(await contract.totalSupply()));
    console.log("Max Supply:", ethers.formatEther(await contract.MAX_SUPPLY()));
    console.log("Is Hub:", await contract.isHub());
  }
}

main().catch(console.error);
