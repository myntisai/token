import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

function buildOptions(gasLimit: bigint, value: bigint = 0n): string {
  const type3 = "0003";
  const workerType = "01"; // Executor
  const optionType = "01"; // lzReceive
  const gasHex = gasLimit.toString(16).padStart(32, "0");
  const valueHex = value.toString(16).padStart(32, "0");
  const optionData = optionType + gasHex + valueHex;
  const length = (optionData.length / 2).toString(16).padStart(4, "0");
  return "0x" + type3 + workerType + length + optionData;
}

async function main() {
  const requested = process.env.REQUEST_QUOTA
    ? ethers.parseEther(process.env.REQUEST_QUOTA)
    : ethers.parseEther("10");

  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  const pending = await spoke.pendingQuotaRequestNonce();
  if (pending !== 0n) {
    throw new Error(`Pending quota request exists: ${pending.toString()}`);
  }

  const storedOptions = await spoke.supplyUpdateOptions();
  const storedRefund = await spoke.supplyUpdateRefundAddress();
  const options = storedOptions && storedOptions !== "0x" ? storedOptions : buildOptions(400000n);
  const refund = storedRefund !== ethers.ZeroAddress ? storedRefund : signer.address;

  console.log("=== REQUEST MINT QUOTA (SPOKE) ===");
  console.log("Spoke:", spokeAddr);
  console.log("Signer:", signer.address);
  console.log("Requested:", ethers.formatEther(requested), "MYNT");
  console.log("Options:", options);
  console.log("Refund:", refund);
  console.log("Current mintQuota:", ethers.formatEther(await spoke.mintQuota()), "MYNT");

  const tx = await spoke.requestMintQuota(requested, options, refund, {
    value: ethers.parseEther("0.005"),
  });
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ requestMintQuota confirmed in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
