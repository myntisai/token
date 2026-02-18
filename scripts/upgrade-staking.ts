import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  // DualPoolStaking proxy address on Base Sepolia (December 28, 2025 deployment)
  // IMPORTANT: Use the CURRENT production proxy, NOT the old one in .env
  const STAKING_PROXY = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";

  console.log("=".repeat(60));
  console.log("🔄 UPGRADING DualPoolStaking PROXY");
  console.log("=".repeat(60));
  console.log("\n📍 Proxy Address:", STAKING_PROXY);
  
  // Get current implementation
  const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("📍 Current Implementation:", currentImpl);
  
  // Get deployer info
  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

  // Compile and get factory for DualPoolStaking
  console.log("📦 Compiling DualPoolStaking...");
  const DualPoolStakingFactory = await ethers.getContractFactory("DualPoolStaking");
  
  // Force import the proxy if not already registered
  console.log("📥 Force importing proxy (if needed)...");
  try {
    await upgrades.forceImport(STAKING_PROXY, DualPoolStakingFactory, {
      kind: "uups"
    });
    console.log("   ✅ Proxy imported successfully");
  } catch (e: any) {
    if (e.message?.includes("already registered") || e.message?.includes("already imported")) {
      console.log("   ℹ️ Proxy already registered");
    } else {
      console.log("   ℹ️ Import note:", e.message?.substring(0, 100));
    }
  }
  
  // Perform the upgrade
  console.log("\n🚀 Executing proxy upgrade...");
  const upgraded = await upgrades.upgradeProxy(STAKING_PROXY, DualPoolStakingFactory, {
    unsafeAllowRenames: true, // Allow storage layout changes if needed
  });
  await upgraded.waitForDeployment();

  // Get new implementation address
  const newImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ UPGRADE COMPLETE!");
  console.log("=".repeat(60));
  console.log("📍 Proxy Address:", STAKING_PROXY);
  console.log("📍 Old Implementation:", currentImpl);
  console.log("📍 New Implementation:", newImpl);
  console.log("\n🔗 Verify new implementation:");
  console.log(`   npx hardhat verify --network base-sepolia ${newImpl}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ Upgrade failed:", err);
  process.exitCode = 1;
});
