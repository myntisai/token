/**
 * Deprecated: fundProviderBalance flow removed under pool-split emissions.
 */

import { ethers, upgrades } from "hardhat";

const STAKING_PROXY = "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3";

async function main() {
  console.log("NOTE: This upgrade script is deprecated under the pool-split emissions flow.");
  console.log("fundProviderBalance is no longer used. Skipping.");
  return;
  console.log("==============================================================================");
  console.log("UPGRADE DualPoolStaking - harvest/fundProviderBalance fix");
  console.log("==============================================================================\n");
  console.log("Proxy:", STAKING_PROXY);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const proxy = await ethers.getContractAt("DualPoolStaking", STAKING_PROXY);
  const UPGRADER_ROLE = await proxy.UPGRADER_ROLE();
  const hasRole = await proxy.hasRole(UPGRADER_ROLE, deployer.address);
  if (!hasRole) {
    console.error("Deployer does not have UPGRADER_ROLE");
    process.exit(1);
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("Current implementation:", currentImpl);

  const DualPoolStakingFactory = await ethers.getContractFactory("DualPoolStaking");
  const newImpl = await DualPoolStakingFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);

  console.log("\nUpgrading proxy...");
  const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  await tx.wait();
  console.log("TX:", tx.hash);

  const finalImpl = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("\nUpgrade complete. Implementation:", finalImpl);
  console.log("Verify: npx hardhat verify --network base-sepolia", finalImpl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
