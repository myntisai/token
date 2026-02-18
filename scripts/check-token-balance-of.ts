import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const addr = process.env.ADDRESS;
  if (!addr || !ethers.isAddress(addr)) {
    throw new Error("Set ADDRESS to a valid address");
  }

  const tokenAddr =
    process.env.TOKEN_ADDRESS ||
    (() => {
      const p = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
      if (!fs.existsSync(p)) throw new Error(`Missing deployment file: ${p}`);
      const dep = JSON.parse(fs.readFileSync(p, "utf8"));
      return dep.myntis as string;
    })();

  if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
    throw new Error("Set TOKEN_ADDRESS or ensure deployments file has myntis");
  }

  const token = await ethers.getContractAt("Myntis", tokenAddr);
  const dec = await token.decimals();
  const bal = await token.balanceOf(addr);

  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("Address:", ethers.getAddress(addr));
  console.log("Balance:", ethers.formatUnits(bal, dec), "MYNT");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

