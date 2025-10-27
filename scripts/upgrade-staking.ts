import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const STAKING_PROXY =
    process.env.STAKING_CONTRACT_ADDRESS ||
    "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";

  console.log("🔄 Upgrading StakingContract proxy:", STAKING_PROXY);

  const StakingFactory = await ethers.getContractFactory("StakingContract");
  const upgraded = await upgrades.upgradeProxy(STAKING_PROXY, StakingFactory);
  await upgraded.waitForDeployment();

  const implementation = await upgrades.erc1967.getImplementationAddress(
    STAKING_PROXY
  );
  console.log("✅ Upgrade complete. New implementation:", implementation);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
