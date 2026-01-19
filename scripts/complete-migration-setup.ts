import { ethers } from "hardhat";

// NEW contracts (December 28 deployment)
const NEW_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const NEW_STAKING = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
const NEW_DISTRIBUTOR = "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("================================================================================");
  console.log("COMPLETING MIGRATION SETUP");
  console.log("================================================================================");
  console.log(`Deployer: ${deployer.address}`);
  
  const token = await ethers.getContractAt("Myntis", NEW_TOKEN, deployer);
  const staking = await ethers.getContractAt("DualPoolStaking", NEW_STAKING, deployer);
  const distributor = await ethers.getContractAt("ZKMerkleDistributor", NEW_DISTRIBUTOR, deployer);
  
  // =========================================================================
  // STEP 1: Provider Staking
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 1: PROVIDER STAKING");
  console.log("============================================================");
  
  const deployerBalance = await token.balanceOf(deployer.address);
  console.log(`   Deployer balance: ${ethers.formatEther(deployerBalance)} MYNT`);
  
  const providerInfo = await staking.getProviderInfo(deployer.address);
  console.log(`   Current provider stake: ${ethers.formatEther(providerInfo.stake)} MYNT`);
  
  if (providerInfo.stake === 0n) {
    const stakeAmount = ethers.parseEther("1000");
    
    // Ensure we have enough tokens
    if (deployerBalance < stakeAmount) {
      console.log("   Minting more tokens for staking...");
      const mintAmount = stakeAmount - deployerBalance;
      const mintTx = await token.migrateMint([deployer.address], [mintAmount]);
      await mintTx.wait();
      console.log(`   ✅ Minted ${ethers.formatEther(mintAmount)} MYNT`);
    }
    
    // Approve staking
    console.log("   Approving staking contract...");
    const approveTx = await token.approve(NEW_STAKING, stakeAmount);
    await approveTx.wait();
    
    // Stake to provider pool
    console.log("   Staking to provider pool...");
    const stakeTx = await staking.stakeToProviderPool(stakeAmount);
    await stakeTx.wait();
    console.log(`   ✅ Staked ${ethers.formatEther(stakeAmount)} MYNT to provider pool!`);
  } else {
    console.log("   ✅ Provider already has stake");
  }
  
  // =========================================================================
  // STEP 2: Fund Distributor
  // =========================================================================
  console.log("\n============================================================");
  console.log("STEP 2: FUND DISTRIBUTOR FOR CLAIMS");
  console.log("============================================================");
  
  const providerBalance = await distributor.providerBalance(deployer.address);
  console.log(`   Current provider balance in distributor: ${ethers.formatEther(providerBalance)} MYNT`);
  
  // Fund with 50,000 MYNT for initial claims
  const fundAmount = ethers.parseEther("50000");
  
  if (providerBalance < fundAmount) {
    // Mint tokens for distributor funding
    console.log(`   Minting ${ethers.formatEther(fundAmount)} MYNT for distributor...`);
    const mintTx = await token.migrateMint([deployer.address], [fundAmount]);
    await mintTx.wait();
    
    // Approve distributor
    console.log("   Approving distributor...");
    const approveTx = await token.approve(NEW_DISTRIBUTOR, fundAmount);
    await approveTx.wait();
    
    // Add provider balance
    console.log("   Adding provider balance to distributor...");
    const addTx = await distributor.addProviderBalance(deployer.address, fundAmount);
    await addTx.wait();
    console.log(`   ✅ Added ${ethers.formatEther(fundAmount)} MYNT to distributor!`);
  } else {
    console.log("   ✅ Distributor already funded");
  }
  
  // =========================================================================
  // FINAL STATUS
  // =========================================================================
  console.log("\n================================================================================");
  console.log("SETUP COMPLETE");
  console.log("================================================================================");
  
  const finalProviderInfo = await staking.getProviderInfo(deployer.address);
  const finalProviderBalance = await distributor.providerBalance(deployer.address);
  const finalTokenSupply = await token.totalSupply();
  
  console.log("\n📊 Final State:");
  console.log(`   Token Supply: ${ethers.formatEther(finalTokenSupply)} MYNT`);
  console.log(`   Provider Stake: ${ethers.formatEther(finalProviderInfo.stake)} MYNT`);
  console.log(`   Provider Distributor Balance: ${ethers.formatEther(finalProviderBalance)} MYNT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  });
