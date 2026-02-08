import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const tokenAddr = deployment.myntis as string;
  const distributorAddr = deployment.zkMerkleDistributor as string;

  const fundAmount = process.env.FUND_AMOUNT
    ? ethers.parseEther(process.env.FUND_AMOUNT)
    : ethers.parseEther("100");

  const [rawSigner] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();

  const token = await ethers.getContractAt("Myntis", tokenAddr, signer);
  const distributor = await ethers.getContractAt("ZKMerkleDistributor", distributorAddr, signer);

  console.log("Funding distributor...");
  console.log("Signer:", signerAddress);
  console.log("Token:", tokenAddr);
  console.log("Distributor:", distributorAddr);
  console.log("Fund amount:", ethers.formatEther(fundAmount), "MYNT");

  const walletBal = await token.balanceOf(signerAddress);
  console.log("Wallet balance:", ethers.formatEther(walletBal), "MYNT");
  if (walletBal < fundAmount) {
    throw new Error("Insufficient wallet balance for funding");
  }

  const approveTx = await token.approve(distributorAddr, fundAmount);
  console.log("Approve tx:", approveTx.hash);
  await approveTx.wait();

  const depositTx = await distributor.depositBalance(fundAmount);
  console.log("depositBalance tx:", depositTx.hash);
  await depositTx.wait();

  const providerBal = await distributor.getProviderBalance(signerAddress);
  console.log("Provider balance:", ethers.formatEther(providerBal), "MYNT");

  console.log("✅ Distributor funded");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
