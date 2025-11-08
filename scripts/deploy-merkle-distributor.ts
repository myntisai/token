import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("👷 Deploying MerkleDistributor with account:", deployer.address);

  // Get configuration from environment
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || process.env.MYNTIS_OFT_ADDRESS;
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;
  const stakingContractAddress = process.env.STAKING_CONTRACT_ADDRESS;

  if (!tokenAddress) {
    throw new Error("Missing MYNTIS_TOKEN_ADDRESS or MYNTIS_OFT_ADDRESS in environment");
  }

  if (!ethers.isAddress(tokenAddress)) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }

  console.log("\n📋 Configuration:");
  console.log("   Token Address:", tokenAddress);
  console.log("   Admin Address:", adminAddress);
  console.log("   Staking Contract:", stakingContractAddress || "<will set later>");
  console.log("   Network:", (await ethers.provider.getNetwork()).name);

  // Deploy MerkleDistributor
  console.log("\n🚀 Deploying MerkleDistributor...");
  const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = await MerkleDistributorFactory.deploy(tokenAddress, adminAddress);
  await merkleDistributor.waitForDeployment();
  const merkleDistributorAddress = await merkleDistributor.getAddress();

  console.log("✅ MerkleDistributor deployed at:", merkleDistributorAddress);

  // Verify it has the required functions
  console.log("\n🔍 Verifying contract functions...");
  const code = await ethers.provider.getCode(merkleDistributorAddress);
  const codeStr = code.toLowerCase();
  
  const notifyRewardSelector = ethers.id("notifyReward(address,uint256)").slice(0, 10);
  const setStakingSelector = ethers.id("setStakingContract(address)").slice(0, 10);
  const addBalanceSelector = ethers.id("addProviderBalance(address,uint256)").slice(0, 10);

  const hasNotifyReward = codeStr.includes(notifyRewardSelector.substring(2).toLowerCase());
  const hasSetStaking = codeStr.includes(setStakingSelector.substring(2).toLowerCase());
  const hasAddBalance = codeStr.includes(addBalanceSelector.substring(2).toLowerCase());

  console.log("   notifyReward:", hasNotifyReward ? "✅" : "❌");
  console.log("   setStakingContract:", hasSetStaking ? "✅" : "❌");
  console.log("   addProviderBalance:", hasAddBalance ? "✅" : "❌");

  if (!hasNotifyReward || !hasSetStaking || !hasAddBalance) {
    throw new Error("Deployed contract is missing required functions! Deployment may have failed.");
  }

  // Set StakingContract if provided
  if (stakingContractAddress && ethers.isAddress(stakingContractAddress)) {
    console.log("\n🔗 Setting StakingContract on MerkleDistributor...");
    try {
      const tx = await merkleDistributor.setStakingContract(stakingContractAddress);
      console.log("   Transaction hash:", tx.hash);
      await tx.wait();
      console.log("   ✅ StakingContract set successfully");

      // Verify
      const setStaking = await merkleDistributor.stakingContract();
      if (setStaking.toLowerCase() === stakingContractAddress.toLowerCase()) {
        console.log("   ✅ Verified: StakingContract correctly set");
      } else {
        console.log("   ⚠️  Warning: Verification shows different address");
      }
    } catch (error: any) {
      console.error("   ❌ Error setting StakingContract:", error.message);
      throw error;
    }
  } else {
    console.log("\n⚠️  StakingContract address not provided - you'll need to set it manually later");
  }

  // Summary
  console.log("\n📊 Deployment Summary:");
  console.log("   MerkleDistributor:", merkleDistributorAddress);
  console.log("   Token:", tokenAddress);
  console.log("   Admin:", adminAddress);
  if (stakingContractAddress) {
    console.log("   StakingContract:", stakingContractAddress, "(set)");
  }

  console.log("\n✅ Deployment complete!");
  console.log("\n📝 Next steps:");
  console.log("   1. Update StakingContract to point to new MerkleDistributor");
  console.log("   2. Update environment variables with new address");
  console.log("   3. Restart services");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

