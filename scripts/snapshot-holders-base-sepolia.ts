import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type SnapshotEntry = { address: string; amount: string };

function getTransferTopic() {
  return ethers.id("Transfer(address,address,uint256)");
}

function chunkRange(from: number, to: number, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = from;
  while (start <= to) {
    const end = Math.min(to, start + step - 1);
    out.push([start, end]);
    start = end + 1;
  }
  return out;
}

async function getCreationBlockEtherscan(chainId: number, contract: string): Promise<number> {
  const key = process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY;
  if (!key) throw new Error("Missing ETHERSCAN_API_KEY/BASESCAN_API_KEY in token/.env");

  const url =
    `https://api.etherscan.io/v2/api?chainid=${chainId}` +
    `&module=contract&action=getcontractcreation&contractaddresses=${contract}` +
    `&apikey=${key}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "1" || !data.result || !data.result[0] || !data.result[0].blockNumber) {
    throw new Error(`Etherscan getcontractcreation failed: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return Number(data.result[0].blockNumber);
}

async function main() {
  if (network.name !== "base-sepolia") {
    throw new Error(`Run this snapshot script on base-sepolia. Current network: ${network.name}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  // Allow overriding the token address for historical snapshots / alternate deployments.
  const tokenAddr = (process.env.TOKEN_ADDRESS || (dep.myntis as string)) as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid dep.myntis in base-sepolia deployment");

  const provider = ethers.provider;
  const latest = await provider.getBlockNumber();
  const snapshotBlock = process.env.SNAPSHOT_BLOCK ? Number(process.env.SNAPSHOT_BLOCK) : latest;
  if (!Number.isFinite(snapshotBlock) || snapshotBlock <= 0) throw new Error("Invalid SNAPSHOT_BLOCK");
  if (snapshotBlock > latest) throw new Error(`SNAPSHOT_BLOCK ${snapshotBlock} > latest ${latest}`);

  const chainId = Number((await provider.getNetwork()).chainId);
  const creationBlock = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : await getCreationBlockEtherscan(chainId, tokenAddr);

  const fromBlock = Math.max(creationBlock, 0);
  const toBlock = snapshotBlock;

  console.log("Snapshot network:", network.name, "chainId", chainId);
  console.log("Token:", tokenAddr);
  console.log("FromBlock:", fromBlock);
  console.log("SnapshotBlock:", snapshotBlock);
  console.log("");

  // Exclude protocol/system contract balances and the testnet deployer by default.
  const excluded = new Set<string>(
    [
      "0x0000000000000000000000000000000000000000",
      // Base Sepolia final testnet stack (from INTERNAL_CONTRACT_DEPLOYMENT_HISTORY_FINAL_TESTING.md)
      "0xC5aA7e0992EEDf67f5096Cb629152267cEDf2875", // Myntis
      "0x07D28cA0ccAE70e992A1a1Dd310443bb96C81979", // Emissions
      "0xc8B635C09161CA61005143630B3002B4FA335770", // Staking proxy
      "0xf80D159e64400E9aCAAb625e285F556d79E9Ac70", // Staking impl
      "0x198Bf984C5757947A0a88C901f12371A5ad3e000", // ZK distributor
      "0x50F0B152DD8A9115B37A12F48524148f39E12C89", // Groth16 verifier
      "0xAea0e9d9c7a38860361d836C3ba3f70f66d4D1A1", // (note: used in history for GSR after redeploy)
      "0x605F3BD99A60105ec90C245040663F8109693E07", // old GSR
      "0x99466736A2285Ca2BE0279C1f2c7757533ebc0cd", // Vault
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627", // testnet deployer/admin (exclude unless explicitly intended)
    ].map((a) => a.toLowerCase())
  );

  const transferTopic = getTransferTopic();
  const ranges = chunkRange(fromBlock, toBlock, 20_000);
  const addrs = new Set<string>();

  console.log(`Scanning Transfer logs in ${ranges.length} chunks...`);
  for (let i = 0; i < ranges.length; i++) {
    const [a, b] = ranges[i];
    const logs = await provider.getLogs({
      address: tokenAddr,
      topics: [transferTopic],
      fromBlock: a,
      toBlock: b,
    });
    for (const log of logs) {
      // topics[1] and topics[2] are indexed from/to
      const from = ethers.getAddress("0x" + log.topics[1].slice(26));
      const to = ethers.getAddress("0x" + log.topics[2].slice(26));
      addrs.add(from.toLowerCase());
      addrs.add(to.toLowerCase());
    }
    if ((i + 1) % 5 === 0 || i === ranges.length - 1) {
      console.log(`  chunk ${i + 1}/${ranges.length} -> logs ${logs.length}, uniqueAddrs ${addrs.size}`);
    }
  }

  // Remove obviously excluded before balance checks.
  for (const x of excluded) addrs.delete(x);
  console.log("");
  console.log("Candidate addresses after exclusions:", addrs.size);

  const token = await ethers.getContractAt("Myntis", tokenAddr);

  const addrList = Array.from(addrs.values());
  const results: SnapshotEntry[] = [];

  // Fetch balances (and then filter to EOAs by code length at snapshot block).
  // NOTE: Many "user" wallets can be smart-contract wallets (e.g. Safe).
  // Default is to INCLUDE contracts unless EOA_ONLY=true.
  const eoaOnly =
    (process.env.EOA_ONLY || "").toLowerCase() === "true" ||
    (process.env.EOA_ONLY || "").toLowerCase() === "1";
  const concurrency = 25;
  for (let i = 0; i < addrList.length; i += concurrency) {
    const batch = addrList.slice(i, i + concurrency);
    const balances = await Promise.all(batch.map((a) => token.balanceOf(a, { blockTag: snapshotBlock } as any)));
    const codes = await Promise.all(batch.map((a) => provider.getCode(a, snapshotBlock)));
    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j];
      const bal = balances[j];
      const code = codes[j];
      if (bal === 0n) continue;
      if (eoaOnly && code && code !== "0x") continue; // optional: skip contract wallets
      results.push({ address: ethers.getAddress(addr), amount: bal.toString() });
    }
  }

  // Sort for stable output.
  results.sort((x, y) => x.address.toLowerCase().localeCompare(y.address.toLowerCase()));

  const total = results.reduce((acc, e) => acc + BigInt(e.amount), 0n);
  console.log("");
  console.log("Snapshot recipients:", results.length);
  console.log("Snapshot total (wei):", total.toString());

  const outDir = path.join(__dirname, "..", "migrations");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `base-sepolia-holders-snapshot-${snapshotBlock}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: network.name,
        chainId,
        token: tokenAddr,
        fromBlock,
        snapshotBlock,
        excluded: Array.from(excluded.values()).sort(),
        recipients: results,
        total: total.toString(),
      },
      null,
      2
    )
  );
  console.log("Wrote snapshot:", outFile);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
