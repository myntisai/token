import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type SnapshotFile = {
  snapshotBlock: number;
  recipients: Array<{ address: string; amount: string }>;
  total: string;
};

function loadSnapshot(filePath: string): SnapshotFile {
  if (!fs.existsSync(filePath)) throw new Error(`Missing snapshot file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  if (network.name !== "base-mainnet") {
    throw new Error(`Run on base-mainnet. Current network: ${network.name}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr = dep.myntis as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid dep.myntis");

  const snapPath =
    process.env.SNAPSHOT_FILE ||
    (() => {
      const dir = path.join(__dirname, "..", "migrations");
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("base-sepolia-holders-snapshot-")) : [];
      if (files.length === 0) throw new Error("No snapshot files found in token/migrations. Set SNAPSHOT_FILE.");
      files.sort();
      return path.join(dir, files[files.length - 1]);
    })();

  const snap = loadSnapshot(snapPath);
  const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 200;
  if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error("Invalid BATCH_SIZE");

  const [signer] = await ethers.getSigners();
  const fee = await ethers.provider.getFeeData();

  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("Snapshot:", snapPath);
  console.log("Recipients:", snap.recipients.length);
  console.log("Total (MYNT):", ethers.formatEther(BigInt(snap.total)));
  console.log("BatchSize:", batchSize);
  console.log("");

  if (snap.recipients.length === 0) {
    console.log("No recipients. Nothing to estimate.");
    return;
  }

  const token = await ethers.getContractAt("Myntis", tokenAddr, signer);

  const batches = Math.ceil(snap.recipients.length / batchSize);
  const sample = snap.recipients.slice(0, Math.min(batchSize, snap.recipients.length));
  const recipients = sample.map((x) => x.address);
  const amounts = sample.map((x) => BigInt(x.amount));

  const gas = await token.migrateMint.estimateGas(recipients, amounts);
  const perBatchGas = gas;
  const estTotalGas = perBatchGas * BigInt(batches);

  // Prefer maxFeePerGas for EIP-1559 networks, fall back to gasPrice.
  const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const perBatchWei = perBatchGas * price;
  const totalWei = estTotalGas * price;

  console.log("Signer:", signer.address);
  console.log("FeeData.maxFeePerGas:", fee.maxFeePerGas?.toString() ?? "null");
  console.log("FeeData.gasPrice:", fee.gasPrice?.toString() ?? "null");
  console.log("Using price (wei):", price.toString());
  console.log("");
  console.log("Estimated gas for 1 batch (size", sample.length, "):", perBatchGas.toString());
  console.log("Estimated batches:", batches);
  console.log("Estimated total gas:", estTotalGas.toString());
  console.log("Estimated cost per batch:", ethers.formatEther(perBatchWei), "ETH");
  console.log("Estimated total cost:", ethers.formatEther(totalWei), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

