import { ethers, upgrades } from "hardhat";

async function main() {
  const stakingProxy = process.env.STAKING_PROXY;
  const emissionsProxy = process.env.EMISSIONS_PROXY;

  if (!stakingProxy || !ethers.isAddress(stakingProxy)) {
    throw new Error("Missing or invalid STAKING_PROXY");
  }
  if (!emissionsProxy || !ethers.isAddress(emissionsProxy)) {
    throw new Error("Missing or invalid EMISSIONS_PROXY");
  }

  const stakingImpl = await upgrades.erc1967.getImplementationAddress(stakingProxy);
  const emissionsImpl = await upgrades.erc1967.getImplementationAddress(emissionsProxy);

  console.log("Staking implementation:", stakingImpl);
  console.log("Emissions implementation:", emissionsImpl);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
