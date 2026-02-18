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
    throw new Error(`Run migration on base-mainnet. Current network: ${network.name}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr = dep.myntis as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid dep.myntis in base-mainnet deployment");

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
  console.log("Network:", network.name);
  console.log("Token (mainnet):", tokenAddr);
  console.log("Snapshot file:", snapPath);
  console.log("Snapshot block:", snap.snapshotBlock);
  console.log("Recipients:", snap.recipients.length);
  console.log("Total (wei):", snap.total);
  console.log("");

  if (snap.recipients.length === 0) {
    console.log("No recipients to migrate. Exiting.");
    return;
  }

  const token = await ethers.getContractAt("Myntis", tokenAddr);
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Owner:", await token.owner());

  const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 200;
  if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error("Invalid BATCH_SIZE");

  for (let i = 0; i < snap.recipients.length; i += batchSize) {
    const batch = snap.recipients.slice(i, i + batchSize);
    const recipients = batch.map((x) => x.address);
    const amounts = batch.map((x) => BigInt(x.amount));

    console.log(`\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(snap.recipients.length / batchSize)}: ${batch.length} recipients`);
    const tx = await token.migrateMint(recipients, amounts);
    console.log("Tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt?.status);
  }

  console.log("\nMigration mint complete. Do NOT call completeMigration() until you've confirmed everything.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

