import { ethers } from "hardhat";

async function main() {
  const token = await ethers.getContractAt("Myntis", "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773");
  
  const cap = await token.cap();
  const totalSupply = await token.totalSupply();
  const remaining = cap - totalSupply;
  
  console.log("Token Cap:", ethers.formatEther(cap));
  console.log("Total Supply:", ethers.formatEther(totalSupply));
  console.log("Remaining:", ethers.formatEther(remaining));
  
  // Check if we can mint 200M
  const wantToMint = ethers.parseEther("200000000");
  console.log("Want to mint:", ethers.formatEther(wantToMint));
  console.log("Can mint 200M?", remaining >= wantToMint);
}
