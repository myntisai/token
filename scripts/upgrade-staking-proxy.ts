import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const proxy = process.env.STAKING_CONTRACT_ADDRESS;
  const newImpl = process.env.NEW_STAKING_IMPLEMENTATION;

  if (!proxy) {
    throw new Error("STAKING_CONTRACT_ADDRESS env var required");
  }
  if (!newImpl) {
    throw new Error("NEW_STAKING_IMPLEMENTATION env var required");
  }

  console.log("=".repeat(60));
  console.log("🔄 UPGRADING DualPoolStaking PROXY (UUPS)");
  console.log("=".repeat(60));
  console.log("Proxy:", proxy);
  console.log("New implementation:", newImpl);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const proxyContract = await ethers.getContractAt("DualPoolStaking", proxy);
  const UPGRADER_ROLE = await proxyContract.UPGRADER_ROLE();
  const hasRole = await proxyContract.hasRole(UPGRADER_ROLE, deployer.address);
  console.log("Has UPGRADER_ROLE:", hasRole);
  if (!hasRole) {
    throw new Error("Deployer does not have UPGRADER_ROLE");
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("Current implementation:", currentImpl);

  const tx = await proxyContract.upgradeToAndCall(newImpl, "0x");
  console.log("Upgrade tx:", tx.hash);
  await tx.wait();

  const finalImpl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("Final implementation:", finalImpl);
  console.log("✅ Upgrade complete");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
