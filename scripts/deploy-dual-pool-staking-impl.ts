import { ethers } from "hardhat";

/**
 * Deploy a new DualPoolStaking implementation contract (UUPS).
 *
 * This does NOT touch the proxy; it only deploys an implementation address
 * that can be used in a Safe proposal via upgradeToAndCall().
 *
 * Usage:
 *   npx hardhat run scripts/deploy-dual-pool-staking-impl.ts --network base-mainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available");

  console.log("Deploying DualPoolStaking implementation...");
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance (ETH):", ethers.formatEther(balance));

  const factory = await ethers.getContractFactory("DualPoolStaking", deployer);
  const impl = await factory.deploy();
  await impl.waitForDeployment();

  const implAddress = await impl.getAddress();
  const txHash = impl.deploymentTransaction()?.hash ?? "<unknown>";

  console.log("New DualPoolStaking implementation:", implAddress);
  console.log("Deployment tx:", txHash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

