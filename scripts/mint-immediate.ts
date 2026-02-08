import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const myntisAddr = deployment.myntis as string;

  const amount = process.env.MINT_AMOUNT ? ethers.parseEther(process.env.MINT_AMOUNT) : ethers.parseEther("1500");

  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Myntis", myntisAddr);

  console.log("Minting immediate tokens...");
  console.log("Signer:", signer.address);
  console.log("Token:", myntisAddr);
  console.log("Amount:", ethers.formatEther(amount), "MYNT");

  const tx = await token.mintImmediate(signer.address, amount);
  console.log("Mint tx:", tx.hash);
  await tx.wait();

  console.log("✅ Minted");
  console.log("Balance:", ethers.formatEther(await token.balanceOf(signer.address)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
