import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const lookback = process.env.LOOKBACK_BLOCKS ? Number(process.env.LOOKBACK_BLOCKS) : 20000;
  if (!Number.isInteger(lookback) || lookback <= 0) throw new Error("Invalid LOOKBACK_BLOCKS");

  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const gsrAddr = deployment.globalSupplyRegistry as string;
  if (!gsrAddr || !ethers.isAddress(gsrAddr)) throw new Error("Missing/invalid globalSupplyRegistry");

  const provider = ethers.provider;
  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - lookback);

  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", gsrAddr);
  const iface = gsr.interface;

  const topics = [
    iface.getEvent("QuotaGranted").topicHash,
    iface.getEvent("QuotaConsumed").topicHash,
    iface.getEvent("QuotaUpdateSkipped").topicHash,
    iface.getEvent("ChainQuotaUpdated").topicHash,
  ];

  console.log("Scanning GSR quota events...");
  console.log("  GSR:", gsrAddr);
  console.log("  fromBlock:", from);
  console.log("  toBlock:", latest);

  const logs = await provider.getLogs({
    address: gsrAddr,
    fromBlock: from,
    toBlock: latest,
    topics: [topics],
  });

  console.log("Found logs:", logs.length);

  for (const log of logs.slice(-50)) {
    const parsed = iface.parseLog(log);
    console.log(
      `${log.blockNumber} ${log.transactionHash} ${parsed?.name} ${JSON.stringify(parsed?.args, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      )}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

