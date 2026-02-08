import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  if (network.name !== "base-mainnet") {
    throw new Error(`Run on base-mainnet. Current network: ${network.name}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const tokenAddr = dep.myntis as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid mainnet token address");

  const token = await ethers.getContractAt("Myntis", tokenAddr);

  const addrs = [
    "0x6255cFEC19A346A5b0Add66eF44F7C5740c12377",
    "0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3",
  ];
  const amounts = [
    ethers.parseUnits("36304.460081427383493014", 18),
    ethers.parseUnits("475.64687975625", 18),
  ];

  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("Recipients:", addrs.length);

  const tx = await token.migrateMint(addrs, amounts);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
