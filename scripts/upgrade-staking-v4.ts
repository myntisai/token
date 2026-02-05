import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  // DualPoolStaking proxy address on Base Sepolia (December 28, 2025 deployment)
  const STAKING_PROXY = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";

  console.log("=".repeat(60));
  console.log("🔄 UPGRADING DualPoolStaking PROXY (V4)");
  console.log("=".repeat(60));
  console.log("\n📍 Proxy Address:", STAKING_PROXY);
  console.log("✨ New Feature: withdrawProviderEmissions() function");
  console.log("   Allows providers to withdraw their accumulated emissions");
  console.log("   (e.g., the 20% provider share not distributed to users)\n");
  
  // Get current implementation
  const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("📍 Current Implementation:", currentImpl);
  
  // Get deployer info
  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

  // Check deployer has UPGRADER_ROLE
  const proxyContract = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  const UPGRADER_ROLE = await proxyContract.UPGRADER_ROLE();
  const hasRole = await proxyContract.hasRole(UPGRADER_ROLE, deployer.address);
  console.log("🔑 Has UPGRADER_ROLE:", hasRole);
  
  if (!hasRole) {
    console.error("❌ Deployer does not have UPGRADER_ROLE!");
    process.exit(1);
  }

  // Compile and get factory for DualPoolStaking
  console.log("\n📦 Getting DualPoolStaking factory...");
  const DualPoolStakingFactory = await ethers.getContractFactory("DualPoolStaking");
  
  // Deploy new implementation directly
  console.log("🏗️  Deploying new implementation...");
  const newImplContract = await DualPoolStakingFactory.deploy();
  await newImplContract.waitForDeployment();
  const newImplAddress = await newImplContract.getAddress();
  console.log("📍 New Implementation deployed:", newImplAddress);
  
  // Upgrade proxy to new implementation using UUPS upgradeToAndCall
  console.log("\n🚀 Upgrading proxy to new implementation...");
  const tx = await proxyContract.upgradeToAndCall(newImplAddress, "0x");
  console.log("📝 Transaction hash:", tx.hash);
  await tx.wait();
  
  // Verify the upgrade
  const finalImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ UPGRADE COMPLETE!");
  console.log("=".repeat(60));
  console.log("📍 Proxy Address:", STAKING_PROXY);
  console.log("📍 Old Implementation:", currentImpl);
  console.log("📍 New Implementation:", finalImpl);
  console.log("\n🎉 New Features:");
  console.log("   • withdrawProviderEmissions(provider, amount)");
  console.log("   • Providers can withdraw accumulated emissions");
  console.log("\n🔗 Verify new implementation:");
  console.log(`   npx hardhat verify --network base-sepolia ${finalImpl}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ Upgrade failed:", err);
  process.exitCode = 1;
});
