import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

function buildOptions(gasLimit: bigint, value: bigint = 0n): string {
  // LayerZero V2 "Options" Type 3 encoding with Executor.lzReceive option.
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
  const gas = process.env.LZRECEIVE_GAS ? BigInt(process.env.LZRECEIVE_GAS) : 400000n;
  const refund = process.env.REFUND_ADDRESS || "";

  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const registryAddr = deployment.globalSupplyRegistry as string;
  if (!registryAddr || !ethers.isAddress(registryAddr)) throw new Error("Missing/invalid globalSupplyRegistry");

  const [signer] = await ethers.getSigners();
  const refundAddr = refund && ethers.isAddress(refund) ? refund : signer.address;
  const options = buildOptions(gas);

  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);
  console.log("Setting quota update options/refund address (with Executor.lzReceive)...");
  console.log("Registry:", registryAddr);
  console.log("Signer:", signer.address);
  console.log("Options:", options);
  console.log("RefundAddress:", refundAddr);

  const tx = await registry.setQuotaUpdateOptions(options, refundAddr);
  console.log("Tx:", tx.hash);
  await tx.wait();

  console.log("Stored options:", await registry.quotaUpdateOptions());
  console.log("Stored refund:", await registry.quotaUpdateRefundAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

