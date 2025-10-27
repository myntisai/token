import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  
  console.log("🔧 COMPREHENSIVE TOKENOMICS FIX");
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  
  // Get token contract
  const tokenAddress = "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773";
  const token = await ethers.getContractAt("Myntis", tokenAddress);
  
  console.log("\n📊 CURRENT STATE:");
  const cap = await token.cap();
  const totalSupply = await token.totalSupply();
  const remaining = cap - totalSupply;
  
  console.log("Token Cap:", ethers.formatEther(cap));
  console.log("Total Supply:", ethers.formatEther(totalSupply));
  console.log("Remaining Cap:", ethers.formatEther(remaining));
  
  // Check admin balance
  const adminBalance = await token.balanceOf(admin);
  console.log("Admin Balance:", ethers.formatEther(adminBalance), "MYNT");
  
  // Calculate what we need
  const immediateAllocation = ethers.parseEther("200000000"); // 200M tokens
  const expectedTotal = ethers.parseEther("1000000000"); // 1B tokens
  
  console.log("\n🎯 TOKENOMICS ANALYSIS:");
  console.log("Expected Total Supply: 1,000,000,000 MYNT");
  console.log("Current Total Supply:", ethers.formatEther(totalSupply), "MYNT");
  console.log("Missing Tokens:", ethers.formatEther(expectedTotal - totalSupply), "MYNT");
  console.log("Immediate Allocation Needed: 200,000,000 MYNT");
  
  // Check if we can mint
  if (remaining >= immediateAllocation) {
    console.log("\n✅ CAN MINT: Sufficient cap remaining");
    
    console.log("\n💰 MINTING IMMEDIATE ALLOCATION...");
    try {
      const tx = await token.mint(admin, immediateAllocation);
      console.log("Transaction submitted:", tx.hash);
      await tx.wait();
      console.log("✅ Transaction confirmed");
      
      // Verify new state
      const newSupply = await token.totalSupply();
      const newAdminBalance = await token.balanceOf(admin);
      
      console.log("\n📊 AFTER MINTING:");
      console.log("New Total Supply:", ethers.formatEther(newSupply), "MYNT");
      console.log("New Admin Balance:", ethers.formatEther(newAdminBalance), "MYNT");
      
      if (newSupply >= expectedTotal) {
        console.log("✅ TOKENOMICS FIXED: Total supply now 1B tokens");
      } else {
        console.log("❌ ISSUE: Still missing tokens");
      }
      
    } catch (error) {
      console.error("❌ MINTING FAILED:", error.message);
      
      // Try to understand the issue
      console.log("\n🔍 DEBUGGING:");
      console.log("Cap:", ethers.formatEther(cap));
      console.log("Current Supply:", ethers.formatEther(totalSupply));
      console.log("Trying to mint:", ethers.formatEther(immediateAllocation));
      console.log("Would result in:", ethers.formatEther(totalSupply + immediateAllocation));
      console.log("Exceeds cap?", (totalSupply + immediateAllocation) > cap);
    }
  } else {
    console.log("\n❌ CANNOT MINT: Insufficient cap remaining");
    console.log("Remaining cap:", ethers.formatEther(remaining));
    console.log("Need to mint:", ethers.formatEther(immediateAllocation));
    console.log("Shortfall:", ethers.formatEther(immediateAllocation - remaining));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
