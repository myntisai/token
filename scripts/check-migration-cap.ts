import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr = dep.myntis as string;
  const token = await ethers.getContractAt("Myntis", tokenAddr);

  const cap = await token.MAX_MIGRATION_AMOUNT();
  const dec = await token.decimals();

  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("MAX_MIGRATION_AMOUNT:", ethers.formatUnits(cap, dec), "MYNT");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

