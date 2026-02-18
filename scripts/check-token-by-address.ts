import { ethers, network } from "hardhat";

async function main() {
  const tokenAddr = process.env.TOKEN_ADDRESS;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
    throw new Error("Set TOKEN_ADDRESS to a valid address");
  }

  const token = await ethers.getContractAt("Myntis", tokenAddr);
  const decimals = await token.decimals();
  const supply = await token.totalSupply();

  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("Decimals:", decimals.toString());
  console.log("TotalSupply:", ethers.formatUnits(supply, decimals));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

