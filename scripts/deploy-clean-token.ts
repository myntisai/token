import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  
  console.log("🆕 DEPLOYING CLEAN TOKEN");
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  
  // Deploy new clean token
  const Factory = await ethers.getContractFactory("Myntis");
  const token = await upgrades.deployProxy(
    Factory,
    [admin, ethers.parseEther("1000000000"), ethers.parseEther("1000000000")],
    { initializer: "initialize", kind: "uups" }
  );
  await token.waitForDeployment();
  
  const tokenAddress = await token.getAddress();
  console.log("✅ New Token Deployed:", tokenAddress);
  
  // Mint 200M immediate allocation to admin
  console.log("\n💰 MINTING IMMEDIATE ALLOCATION...");
  const immediateAllocation = ethers.parseEther("200000000");
  const tx = await token.mint(admin, immediateAllocation);
  await tx.wait();
  console.log("✅ Minted 200M tokens to admin");
  console.log("Transaction:", tx.hash);
  
  // Verify final state
  const totalSupply = await token.totalSupply();
  const adminBalance = await token.balanceOf(admin);
  const cap = await token.cap();
  
  console.log("\n📊 FINAL TOKENOMICS:");
  console.log("Token Address:", tokenAddress);
  console.log("Total Supply:", ethers.formatEther(totalSupply), "MYNT");
  console.log("Admin Balance:", ethers.formatEther(adminBalance), "MYNT");
  console.log("Token Cap:", ethers.formatEther(cap), "MYNT");
  console.log("Remaining for Emissions:", ethers.formatEther(cap - totalSupply), "MYNT");
  
  if (totalSupply >= ethers.parseEther("200000000")) {
    console.log("✅ TOKENOMICS FIXED: Clean 1B token with 200M immediate allocation");
  } else {
    console.log("❌ ISSUE: Tokenomics not properly set");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
