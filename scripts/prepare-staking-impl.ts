import { ethers, upgrades } from "hardhat";

async function main() {
  const proxy =
    process.env.STAKING_CONTRACT_ADDRESS ||
    "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";

  const StakingFactory = await ethers.getContractFactory("StakingContract");
  const impl = await upgrades.prepareUpgrade(proxy, StakingFactory);
  console.log("Prepared new staking implementation at:", impl);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
