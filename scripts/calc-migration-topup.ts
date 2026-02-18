import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Snapshot = {
  token: string;
  snapshotBlock: number;
  recipients: Array<{ address: string; amount: string }>;
};

async function main() {
  if (network.name !== "base-sepolia") {
    throw new Error(`Run on base-sepolia. Current network: ${network.name}`);
  }

  const snapPath =
    process.env.SNAPSHOT_FILE ||
    path.join(__dirname, "..", "migrations", "base-sepolia-holders-snapshot-37378124.json");
  if (!fs.existsSync(snapPath)) throw new Error(`Missing snapshot file: ${snapPath}`);
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as Snapshot;

  const tokenAddr = process.env.TOKEN_ADDRESS || snap.token;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid TOKEN_ADDRESS/token in snapshot");

  const provider = ethers.provider;
  const token = await ethers.getContractAt("Myntis", tokenAddr);
  const decimals = await token.decimals();

  const recipients = snap.recipients;
  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  console.log("Snapshot file:", snapPath);
  console.log("Snapshot block:", snap.snapshotBlock);
  console.log("Recipients:", recipients.length);
  console.log("");

  const concurrency = 20;
  const deltas: Array<{ address: string; delta: bigint; current: bigint; snap: bigint }> = [];

  for (let i = 0; i < recipients.length; i += concurrency) {
    const batch = recipients.slice(i, i + concurrency);
    const bals = await Promise.all(batch.map((r) => token.balanceOf(r.address)));
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

  const maxRows = process.env.MAX_ROWS ? Number(process.env.MAX_ROWS) : 20;
  for (let i = 0; i < Math.min(deltas.length, maxRows); i++) {
    const d = deltas[i];
    console.log(
      `${i + 1}. ${d.address} delta=${ethers.formatUnits(d.delta, decimals)} MYNT ` +
        `(snap=${ethers.formatUnits(d.snap, decimals)} current=${ethers.formatUnits(d.current, decimals)})`
    );
  }

  // Also check if there are new holders not in snapshot (optional)
  if (process.env.CHECK_NEW_HOLDERS === "true") {
    console.log("\nChecking for new holders not in snapshot...");
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const latest = await provider.getBlockNumber();
    const fromBlock = snap.snapshotBlock + 1;
    const toBlock = latest;
    const ranges: Array<[number, number]> = [];
    for (let start = fromBlock; start <= toBlock; start += 20_000) {
      const end = Math.min(toBlock, start + 20_000 - 1);
      ranges.push([start, end]);
    }
    const seen = new Set(recipients.map((r) => r.address.toLowerCase()));
    const newAddrs = new Set<string>();
    for (const [a, b] of ranges) {
      const logs = await provider.getLogs({ address: tokenAddr, topics: [transferTopic], fromBlock: a, toBlock: b });
      for (const log of logs) {
        const to = ethers.getAddress("0x" + log.topics[2].slice(26)).toLowerCase();
        if (!seen.has(to)) newAddrs.add(to);
      }
    }
    console.log("New address candidates since snapshot:", newAddrs.size);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

