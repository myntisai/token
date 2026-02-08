import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Snapshot = {
  token: string;
  snapshotBlock: number;
  recipients: Array<{ address: string; amount: string }>;
};

type Delta = { address: string; delta: bigint; current: bigint; snap: bigint };

async function main() {
  if (network.name !== "base-mainnet") {
    throw new Error(`Run on base-mainnet. Current network: ${network.name}`);
  }

  const snapPath =
    process.env.SNAPSHOT_FILE ||
    path.join(__dirname, "..", "migrations", "base-sepolia-holders-snapshot-37378124.json");
  if (!fs.existsSync(snapPath)) throw new Error(`Missing snapshot file: ${snapPath}`);
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as Snapshot;

  const sepoliaTokenAddr = process.env.SEPOLIA_TOKEN_ADDRESS || snap.token;
  if (!sepoliaTokenAddr || !ethers.isAddress(sepoliaTokenAddr)) {
    throw new Error("Invalid SEPOLIA_TOKEN_ADDRESS/token in snapshot");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const mainnetTokenAddr = dep.myntis as string;
  if (!mainnetTokenAddr || !ethers.isAddress(mainnetTokenAddr)) throw new Error("Invalid mainnet token");

  // Provider to read Base Sepolia balances.
  const sepoliaUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaUrl);

  const sepoliaToken = await ethers.getContractAt("Myntis", sepoliaTokenAddr, sepoliaProvider);
  const mainnetToken = await ethers.getContractAt("Myntis", mainnetTokenAddr);
  const decimals = await mainnetToken.decimals();

  console.log("Network:", network.name);
  console.log("Mainnet token:", mainnetTokenAddr);
  console.log("Sepolia token:", sepoliaTokenAddr);
  console.log("Snapshot:", snapPath);
  console.log("Recipients:", snap.recipients.length);
  console.log("");

  const recipients = snap.recipients;
  const concurrency = 20;
  const deltas: Delta[] = [];

  for (let i = 0; i < recipients.length; i += concurrency) {
    const batch = recipients.slice(i, i + concurrency);
    const bals = await Promise.all(batch.map((r) => sepoliaToken.balanceOf(r.address)));
    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j].address;
      const snapBal = BigInt(batch[j].amount);
      const cur = bals[j];
      if (cur > snapBal) {
        deltas.push({ address: addr, delta: cur - snapBal, current: cur, snap: snapBal });
      }
    }
    if ((i + concurrency) % (concurrency * 5) === 0 || i + concurrency >= recipients.length) {
      console.log(`Checked ${Math.min(i + concurrency, recipients.length)}/${recipients.length}`);
    }
  }

  deltas.sort((a, b) => (a.delta > b.delta ? -1 : a.delta < b.delta ? 1 : 0));
  const totalDelta = deltas.reduce((acc, d) => acc + d.delta, 0n);

  console.log("");
  console.log("Top-up candidates:", deltas.length);
  console.log("Total delta (MYNT):", ethers.formatUnits(totalDelta, decimals));
  console.log("");

  if (deltas.length === 0) {
    console.log("No top-ups needed. Exiting.");
    return;
  }

  // Execute top-up using migrateMint in batches
  const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 200;
  if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error("Invalid BATCH_SIZE");

  for (let i = 0; i < deltas.length; i += batchSize) {
    const batch = deltas.slice(i, i + batchSize);
    const addrs = batch.map((d) => d.address);
    const amounts = batch.map((d) => d.delta);
    console.log(`\nTop-up batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(deltas.length / batchSize)}: ${batch.length} recipients`);
    const tx = await mainnetToken.migrateMint(addrs, amounts);
    console.log("Tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt?.status);
  }

  console.log("\nTop-up migration complete. Do NOT call completeMigration() until you've confirmed everything.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

