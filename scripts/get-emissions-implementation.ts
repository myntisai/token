import { upgrades } from "hardhat";

async function main() {
  const proxy = process.env.EMISSIONS_CONTRACT_ADDRESS || "0xcBeC89921DDb9Ec10aF7737e7AA10249660d37D8";
  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("Emissions impl:", impl);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
