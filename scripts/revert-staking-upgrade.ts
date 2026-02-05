import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const STAKING_PROXY = "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
  const OLD_IMPLEMENTATION = "0xBe3E429Ff9Fe8Eaa39655C96a787c43b4C607056";

  console.log("=".repeat(60));
  console.log("⏪ REVERTING DualPoolStaking to OLD Implementation");
  console.log("=".repeat(60));
  console.log("\n📍 Proxy Address:", STAKING_PROXY);
  console.log("📍 Old Implementation to restore:", OLD_IMPLEMENTATION);
  
  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  // Get the proxy contract
  const proxyContract = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  
  // Revert to old implementation
  console.log("\n⏪ Reverting to old implementation...");
  const tx = await proxyContract.upgradeToAndCall(OLD_IMPLEMENTATION, "0x");
  console.log("📝 Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("\n✅ Reverted to old implementation:", OLD_IMPLEMENTATION);
}

main().catch((err) => {
  console.error("❌ Revert failed:", err);
  process.exitCode = 1;
});
