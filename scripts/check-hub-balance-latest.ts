import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = deployment.myntis as string;

  const [signer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", hubAddr);

  const decimals = await hub.decimals();
  const balance = await hub.balanceOf(signer.address);
  const supply = await hub.totalSupply();

  console.log("Hub:", hubAddr);
  console.log("Signer:", signer.address);
  console.log("Decimals:", decimals.toString());
  console.log("Balance:", ethers.formatUnits(balance, decimals), "MYNT");
  console.log("TotalSupply:", ethers.formatUnits(supply, decimals), "MYNT");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
