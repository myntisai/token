import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  
  console.log("🔧 FIXING TOKENOMICS");
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  
  // Get token contract
  const tokenAddress = "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773";
  const token = await ethers.getContractAt("Myntis", tokenAddress);
  
  console.log("\n📊 BEFORE FIX:");
  const beforeSupply = await token.totalSupply();
  console.log("Total Supply:", ethers.formatEther(beforeSupply), "MYNT");
  
  // Check current balance of admin
  const adminBalance = await token.balanceOf(admin);
  console.log("Admin Balance:", ethers.formatEther(adminBalance), "MYNT");
  
  // Calculate missing immediate allocation
  const immediateAllocation = ethers.parseEther("200000000"); // 200M tokens
  const currentSupply = await token.totalSupply();
  const expectedSupply = ethers.parseEther("1000000000"); // 1B tokens
  const missingTokens = expectedSupply - currentSupply;
  
  console.log("\n🎯 TOKENOMICS FIX:");
  console.log("Expected Total Supply: 1,000,000,000 MYNT");
  console.log("Current Total Supply:", ethers.formatEther(currentSupply), "MYNT");
  console.log("Missing Tokens:", ethers.formatEther(missingTokens), "MYNT");
  console.log("Immediate Allocation: 200,000,000 MYNT");
  
  if (missingTokens > 0) {
    console.log("\n💰 MINTING IMMEDIATE ALLOCATION...");
    
    // Mint 200M tokens to admin (immediate allocation)
    const tx = await token.mint(admin, immediateAllocation);
    await tx.wait();
    
    console.log("✅ Minted 200M tokens to admin");
    console.log("Transaction:", tx.hash);
    
    // Verify new supply
    const afterSupply = await token.totalSupply();
    const newAdminBalance = await token.balanceOf(admin);
    
    console.log("\n📊 AFTER FIX:");
    console.log("Total Supply:", ethers.formatEther(afterSupply), "MYNT");
    console.log("Admin Balance:", ethers.formatEther(newAdminBalance), "MYNT");
    
    if (afterSupply >= expectedSupply) {
      console.log("✅ TOKENOMICS FIXED: Total supply now 1B tokens");
    } else {
      console.log("❌ ISSUE: Still missing tokens");
    }
  } else {
    console.log("✅ Tokenomics already correct");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
