import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type CreationInfo = { blockNumber: number; txHash: string };

async function getCreationInfoEtherscan(chainId: number, contract: string): Promise<CreationInfo> {
  const key = process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY;
  if (!key) throw new Error("Missing ETHERSCAN_API_KEY/BASESCAN_API_KEY in token/.env");

  const url =
    `https://api.etherscan.io/v2/api?chainid=${chainId}` +
    `&module=contract&action=getcontractcreation&contractaddresses=${contract}` +
    `&apikey=${key}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "1" || !data.result || !data.result[0]) {
    throw new Error(`Etherscan getcontractcreation failed: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const r = data.result[0];
  return { blockNumber: Number(r.blockNumber), txHash: String(r.txHash) };
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

async function main() {
  if (network.name !== "base-mainnet") {
    throw new Error(`Run on base-mainnet. Current network: ${network.name}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr = dep.myntis as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) throw new Error("Invalid dep.myntis");

  const provider = ethers.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  const latest = await provider.getBlockNumber();

  // Prefer explicit overrides so this script works even with limited explorer API plans.
  const forcedFrom = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : undefined;
  const forcedTx = process.env.CREATION_TX ? String(process.env.CREATION_TX) : undefined;

  const creation = forcedFrom
    ? { blockNumber: forcedFrom, txHash: forcedTx || "unknown" }
    : await getCreationInfoEtherscan(chainId, tokenAddr);

  const fromBlock = creation.blockNumber;
  const toBlock = latest;

  console.log("Network:", network.name, "chainId", chainId);
  console.log("Token:", tokenAddr);
  console.log("Creation block:", fromBlock);
  console.log("Creation tx:", creation.txHash);
  console.log("Latest block:", latest);
  console.log("");

  const Myntis = await ethers.getContractFactory("Myntis");
  const token = Myntis.attach(tokenAddr);
  const iface = token.interface;

  // ERC-20 Transfer topic (always present)
  const TRANSFER = ethers.id("Transfer(address,address,uint256)");

  // Myntis-specific events we care about
  const topics = [
    TRANSFER,
    iface.getEvent("RoleGranted").topicHash,
    iface.getEvent("RoleRevoked").topicHash,
    iface.getEvent("GlobalSupplyRegistryUpdated").topicHash,
    iface.getEvent("ContractURIUpdated").topicHash,
    iface.getEvent("BalanceMigrated").topicHash,
    iface.getEvent("MigrationCompleted").topicHash,
    iface.getEvent("EmissionsMinted").topicHash,
    iface.getEvent("ImmediateMinted").topicHash,
    iface.getEvent("BurnFeeUpdated").topicHash,
    iface.getEvent("FeeRecipientUpdated").topicHash,
  ].filter(Boolean) as string[];

  const ranges = chunkRange(fromBlock, toBlock, 50_000);
  console.log(`Scanning logs in ${ranges.length} chunks...`);

  const allLogs: ethers.Log[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const [a, b] = ranges[i];
    // fetch each topic separately to avoid provider limits with OR-topics
    for (const t of topics) {
      const logs = await provider.getLogs({
        address: tokenAddr,
        topics: [t],
        fromBlock: a,
        toBlock: b,
      });
      allLogs.push(...logs);
    }
    if (i === ranges.length - 1 || (i + 1) % 2 === 0) {
      console.log(`  chunk ${i + 1}/${ranges.length} accumulatedLogs=${allLogs.length}`);
    }
  }

  // Deduplicate logs (since multiple topics scans can overlap only if a log matches multiple topics, which it can't)
  allLogs.sort((x, y) => (x.blockNumber - y.blockNumber) || (x.logIndex - y.logIndex));

  type Row = {
    blockNumber: number;
    txHash: string;
    event: string;
    summary: string;
  };

  const rows: Row[] = [];
  const txs = new Set<string>();

  for (const log of allLogs) {
    txs.add(log.transactionHash);
    if (log.topics[0] === TRANSFER) {
      const parsed = iface.parseLog(log);
      const from = parsed.args[0] as string;
      const to = parsed.args[1] as string;
      const amount = parsed.args[2] as bigint;
      const summary = `from=${from} to=${to} amount=${ethers.formatEther(amount)} MYNT`;
      rows.push({ blockNumber: log.blockNumber, txHash: log.transactionHash, event: "Transfer", summary });
      continue;
    }
    try {
      const parsed = iface.parseLog(log);
      const name = parsed.name;
      let summary = "";
      switch (name) {
        case "RoleGranted":
          summary = `role=${parsed.args.role} account=${parsed.args.account} sender=${parsed.args.sender}`;
          break;
        case "RoleRevoked":
          summary = `role=${parsed.args.role} account=${parsed.args.account} sender=${parsed.args.sender}`;
          break;
        case "GlobalSupplyRegistryUpdated":
          summary = `previous=${parsed.args.previousRegistry} new=${parsed.args.newRegistry}`;
          break;
        case "ContractURIUpdated":
          summary = `old=${parsed.args.oldURI} new=${parsed.args.newURI}`;
          break;
        case "BalanceMigrated":
          summary = `recipient=${parsed.args.recipient} amount=${ethers.formatEther(parsed.args.amount)} MYNT`;
          break;
        case "MigrationCompleted":
          summary = `totalMigrated=${ethers.formatEther(parsed.args.totalMigrated)} MYNT`;
          break;
        case "EmissionsMinted":
          summary = `to=${parsed.args.to} amount=${ethers.formatEther(parsed.args.amount)} totalEmissions=${ethers.formatEther(parsed.args.totalEmissions)} MYNT`;
          break;
        case "ImmediateMinted":
          summary = `to=${parsed.args.to} amount=${ethers.formatEther(parsed.args.amount)} totalImmediate=${ethers.formatEther(parsed.args.totalImmediate)} MYNT`;
          break;
        case "BurnFeeUpdated":
          summary = `oldFee=${parsed.args.oldFee} newFee=${parsed.args.newFee}`;
          break;
        case "FeeRecipientUpdated":
          summary = `old=${parsed.args.oldRecipient} new=${parsed.args.newRecipient}`;
          break;
        default:
          summary = parsed.args ? JSON.stringify(parsed.args) : "";
      }
      rows.push({ blockNumber: log.blockNumber, txHash: log.transactionHash, event: name, summary });
    } catch {
      // ignore
    }
  }

  console.log("");
  console.log("Unique txs touching token:", txs.size);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.event] = (acc[r.event] || 0) + 1;
    return acc;
  }, {});
  console.log("Event counts:", counts);
  console.log("");

  // Fetch tx senders for clarity (small set in practice)
  const txList = Array.from(txs.values());
  const txFrom: Record<string, string> = {};
  for (const h of txList) {
    const tx = await provider.getTransaction(h);
    if (tx?.from) txFrom[h] = tx.from;
  }

  // Print chronologically
  for (const r of rows) {
    const from = txFrom[r.txHash] ? ` fromTxSender=${txFrom[r.txHash]}` : "";
    console.log(`[${r.blockNumber}] ${r.event} tx=${r.txHash}${from}`);
    console.log(`  ${r.summary}`);
  }

  console.log("");
  console.log("Current on-chain headline state:");
  console.log("  owner:", await token.owner());
  console.log("  totalSupply:", ethers.formatEther(await token.totalSupply()), "MYNT");
  console.log("  contractURI:", await token.contractURI());
  console.log("  globalSupplyRegistry:", await token.globalSupplyRegistry());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
