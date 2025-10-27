import { upgrades } from "hardhat";

async function main() {
  const proxy =
    process.env.STAKING_CONTRACT_ADDRESS ||
    "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";
  const admin = await upgrades.erc1967.getAdminAddress(proxy);
  console.log("Proxy admin:", admin);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
