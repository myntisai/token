import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const registryAddr = base.globalSupplyRegistry as string;

  const amount = process.env.FUND_AMOUNT
    ? ethers.parseEther(process.env.FUND_AMOUNT)
    : ethers.parseEther("0.01");

  const [signer] = await ethers.getSigners();
  console.log("=== FUND GLOBAL SUPPLY REGISTRY ===");
  console.log("Registry:", registryAddr);
  console.log("Signer:", signer.address);
  console.log("Amount:", ethers.formatEther(amount), "ETH");

  const tx = await signer.sendTransaction({ to: registryAddr, value: amount });
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Funded in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
