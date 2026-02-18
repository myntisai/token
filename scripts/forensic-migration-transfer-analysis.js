#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env.dev") });

const ROOT = path.resolve(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
const DOCS_DIR = path.join(ROOT, "docs", "deployment");

const OUT_JSON = path.join(DEPLOYMENTS_DIR, "forensic-migration-transfer-analysis.json");
const OUT_MD = path.join(DOCS_DIR, "FORENSIC_MIGRATION_TRANSFER_ANALYSIS.md");

const MAINNET_DEPLOYMENT_LATEST = path.join(DEPLOYMENTS_DIR, "deployment-base-mainnet-latest.json");
const MAINNET_FROZEN = path.join(DEPLOYMENTS_DIR, "FROZEN_MAINNET_ADDRESSES.md");
const MAINNET_HISTORY_SNAPSHOTS = path.join(DEPLOYMENTS_DIR, "historical-snapshots-mainnet-core.json");
const BASE_SEPOLIA_HISTORY = path.join(DEPLOYMENTS_DIR, "base-sepolia-deployment-history.json");
const BASE_SEPOLIA_SCAN = path.join(DEPLOYMENTS_DIR, "base-sepolia-blockscout-deployer-scan-0904-89.json");
const MIGRATION_SCOPE = path.join(DEPLOYMENTS_DIR, "MIGRATION_SCOPE_DISCLOSURE.md");
const SNAPSHOT_37378124 = path.join(ROOT, "migrations", "base-sepolia-holders-snapshot-37378124.json");

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const NETWORKS = {
  "base-sepolia": {
    chainId: 84532,
    rpc:
      process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.RPC_URL ||
      process.env.NEXT_PUBLIC_HUB_RPC_URL ||
      "https://base-sepolia-rpc.publicnode.com"
  },
  "base-mainnet": {
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org"
  }
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalize(addr) {
  return String(addr).toLowerCase();
}

function uniq(arr) {
  return [...new Set(arr)];
}

function isAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || ""));
}

function addMapBigInt(map, key, val) {
  map.set(key, (map.get(key) || 0n) + val);
}

function toSortedEntries(map, limit = null) {
  const rows = [...map.entries()].sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));
  return limit == null ? rows : rows.slice(0, limit);
}

function fmtUnits(v, decimals = 18) {
  try {
    return ethers.formatUnits(v, decimals);
  } catch {
    return String(v);
  }
}

function toSerializable(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toSerializable(v);
    return out;
  }
  return value;
}

function pick(value, fallback) {
  return value == null ? fallback : value;
}

function redactRpcUrl(url) {
  if (!url) return url;
  // Redact common API key patterns while preserving provider host visibility.
  return String(url)
    .replace(/(\/v2\/)[^/?#]+/i, "$1<redacted>")
    .replace(/([?&](?:apiKey|apikey|key|token)=)[^&]+/gi, "$1<redacted>");
}

function parseFrozenMainnetAddresses(file) {
  const txt = fs.readFileSync(file, "utf8");
  const lines = txt.split(/\r?\n/);
  let section = "";
  const out = { active: {}, legacy: {} };
  for (const line of lines) {
    if (/^##\s+Active/i.test(line)) {
      section = "active";
      continue;
    }
    if (/^##\s+Legacy/i.test(line)) {
      section = "legacy";
      continue;
    }
    const m = line.match(/^\-\s+([A-Za-z0-9_]+):\s+`(0x[a-fA-F0-9]{40})`/);
    if (!m || !section) continue;
    out[section][m[1]] = ethers.getAddress(m[2]);
  }
  return out;
}

function loadCreationBlockMapFromSepoliaScan(file) {
  if (!fs.existsSync(file)) return new Map();
  const parsed = readJson(file);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const out = new Map();
  for (const r of rows) {
    const addr = normalize(r.contractAddressLower || r.contractAddress || "");
    const block = Number(r.blockNumber || 0);
    if (!isAddress(addr) || !Number.isFinite(block) || block <= 0) continue;
    if (!out.has(addr)) out.set(addr, block);
  }
  return out;
}

async function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`timeout:${label}`));
    }, ms);
    Promise.resolve(promise)
      .then((v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function findCreationBlockByCode(provider, address, latestBlock) {
  async function hasCodeAt(block) {
    const code = await withTimeout(provider.getCode(address, block), 10000, "getCode");
    return code && code !== "0x";
  }
  if (!(await hasCodeAt(latestBlock))) return null;
  let lo = 0;
  let hi = latestBlock;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasCodeAt(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

async function fetchLogsChunked(provider, filter, fromBlock, toBlock, step = 40000, label = "logs") {
  const out = [];
  if (fromBlock > toBlock) return out;
  const totalChunks = Math.ceil((toBlock - fromBlock + 1) / (step + 1));
  let chunkIndex = 0;
  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const to = Math.min(toBlock, from + step);
    chunkIndex += 1;
    if (totalChunks <= 10 || chunkIndex === 1 || chunkIndex === totalChunks || chunkIndex % 10 === 0) {
      console.log(`[${label}] chunk ${chunkIndex}/${totalChunks} blocks ${from}-${to}`);
    }
    let part;
    try {
      part = await withTimeout(
        provider.getLogs({
          ...filter,
          fromBlock: from,
          toBlock: to
        }),
        20000,
        "getLogs"
      );
    } catch (error) {
      const msg = String(error?.shortMessage || error?.message || error);
      const rangeIssue = /maximum block range|block range|result set|response size|too many results/i.test(msg);
      if (rangeIssue && step > 1000) {
        const mid = Math.floor((from + to) / 2);
        const nextStep = Math.max(1000, Math.floor(step / 2));
        console.log(`[${label}] shrinking range ${from}-${to} to step ${nextStep} due to RPC limits`);
        const left = await fetchLogsChunked(provider, filter, from, mid, nextStep, `${label}:retry-L`);
        const right = await fetchLogsChunked(provider, filter, mid + 1, to, nextStep, `${label}:retry-R`);
        out.push(...left, ...right);
        continue;
      }
      throw error;
    }
    out.push(...part);
  }
  return out;
}

async function resolveTokenMeta(provider, tokenAddress) {
  const token = new ethers.Contract(
    tokenAddress,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ],
    provider
  );
  let symbol = "UNKNOWN";
  let decimals = 18;
  let totalSupply = 0n;
  try {
    symbol = await token.symbol();
  } catch {}
  try {
    decimals = Number(await token.decimals());
  } catch {}
  try {
    totalSupply = BigInt(await token.totalSupply());
  } catch {}
  return { symbol, decimals, totalSupply };
}

function parseTransferLog(log) {
  const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
  const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);
  const value = BigInt(log.data);
  return { from, to, value };
}

function toPreview(entries, decimals, limit = 10) {
  return entries.slice(0, limit).map(([address, value]) => ({
    address,
    value: value.toString(),
    valueFmt: fmtUnits(value, decimals)
  }));
}

async function scanTokenTransfers(provider, tokenAddress, fromBlock, toBlock, trackedAddresses) {
  const tracked = new Set(trackedAddresses.map((a) => normalize(a)));
  const logs = await fetchLogsChunked(
    provider,
    { address: tokenAddress, topics: [TRANSFER_TOPIC] },
    fromBlock,
    toBlock,
    40000,
    `transfer:${tokenAddress.slice(0, 10)}`
  );

  const mintByRecipient = new Map();
  const burnBySender = new Map();
  const sentByAddress = new Map();
  const recvByAddress = new Map();
  const systemIn = new Map();
  const systemOut = new Map();
  const systemMatrix = new Map(); // key: from->to

  let transferCount = 0;
  let mintCount = 0;
  let burnCount = 0;
  let mintTotal = 0n;
  let burnTotal = 0n;
  let volumeTotal = 0n;

  for (const log of logs) {
    const { from, to, value } = parseTransferLog(log);
    const fromN = normalize(from);
    const toN = normalize(to);
    transferCount += 1;
    volumeTotal += value;

    addMapBigInt(sentByAddress, fromN, value);
    addMapBigInt(recvByAddress, toN, value);

    const isMint = fromN === ZERO;
    const isBurn = toN === ZERO || toN === DEAD;
    if (isMint) {
      mintCount += 1;
      mintTotal += value;
      addMapBigInt(mintByRecipient, toN, value);
    }
    if (isBurn) {
      burnCount += 1;
      burnTotal += value;
      addMapBigInt(burnBySender, fromN, value);
    }

    if (tracked.has(fromN)) addMapBigInt(systemOut, fromN, value);
    if (tracked.has(toN)) addMapBigInt(systemIn, toN, value);
    if (tracked.has(fromN) && tracked.has(toN)) {
      const key = `${fromN}->${toN}`;
      addMapBigInt(systemMatrix, key, value);
    }
  }

  const { symbol, decimals, totalSupply } = await resolveTokenMeta(provider, tokenAddress);
  const balanceByTracked = {};
  const token = new ethers.Contract(tokenAddress, ["function balanceOf(address) view returns (uint256)"], provider);
  const batchSize = 10;
  for (let i = 0; i < trackedAddresses.length; i += batchSize) {
    const batch = trackedAddresses.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((addr) => withTimeout(token.balanceOf(addr), 8000, "balanceOf"))
    );
    for (let j = 0; j < batch.length; j += 1) {
      const res = settled[j];
      if (res.status !== "fulfilled") continue;
      const bal = BigInt(res.value);
      balanceByTracked[normalize(batch[j])] = {
        value: bal.toString(),
        valueFmt: fmtUnits(bal, decimals)
      };
    }
  }

  return {
    tokenAddress: ethers.getAddress(tokenAddress),
    fromBlock,
    toBlock,
    symbol,
    decimals,
    totalSupply: totalSupply.toString(),
    totalSupplyFmt: fmtUnits(totalSupply, decimals),
    transferCount,
    volumeTotal: volumeTotal.toString(),
    volumeTotalFmt: fmtUnits(volumeTotal, decimals),
    mintCount,
    mintTotal: mintTotal.toString(),
    mintTotalFmt: fmtUnits(mintTotal, decimals),
    burnCount,
    burnTotal: burnTotal.toString(),
    burnTotalFmt: fmtUnits(burnTotal, decimals),
    topMintRecipients: toPreview(toSortedEntries(mintByRecipient), decimals, 20),
    topBurnSenders: toPreview(toSortedEntries(burnBySender), decimals, 20),
    topSenders: toPreview(toSortedEntries(sentByAddress), decimals, 20),
    topReceivers: toPreview(toSortedEntries(recvByAddress), decimals, 20),
    systemFlowIn: toPreview(toSortedEntries(systemIn), decimals, 50),
    systemFlowOut: toPreview(toSortedEntries(systemOut), decimals, 50),
    systemMatrix: toPreview(toSortedEntries(systemMatrix), decimals, 100),
    currentBalancesTracked: balanceByTracked
  };
}

async function scanMyntisEvents(provider, tokenAddress, fromBlock, toBlock) {
  const iface = new ethers.Interface([
    "event BalanceMigrated(address indexed recipient,uint256 amount)",
    "event MigrationCompleted(uint256 totalMigrated)",
    "event EmissionsMinted(address indexed to,uint256 amount,uint256 totalEmissions)",
    "event ImmediateMinted(address indexed to,uint256 amount,uint256 totalImmediate)"
  ]);

  const evs = {
    BalanceMigrated: iface.getEvent("BalanceMigrated").topicHash,
    MigrationCompleted: iface.getEvent("MigrationCompleted").topicHash,
    EmissionsMinted: iface.getEvent("EmissionsMinted").topicHash,
    ImmediateMinted: iface.getEvent("ImmediateMinted").topicHash
  };

  const out = {
    balanceMigrated: {
      events: 0,
      recipients: 0,
      total: 0n,
      txHashes: []
    },
    migrationCompleted: {
      events: 0,
      totals: []
    },
    emissionsMinted: {
      events: 0,
      total: 0n
    },
    immediateMinted: {
      events: 0,
      total: 0n
    }
  };

  const recipientSet = new Set();
  const txSet = new Set();

  const logsBalanceMigrated = await fetchLogsChunked(
    provider,
    { address: tokenAddress, topics: [evs.BalanceMigrated] },
    fromBlock,
    toBlock,
    40000,
    `BalanceMigrated:${tokenAddress.slice(0, 10)}`
  );
  for (const log of logsBalanceMigrated) {
    const p = iface.parseLog(log);
    const recipient = normalize(p.args.recipient);
    const amount = BigInt(p.args.amount);
    recipientSet.add(recipient);
    txSet.add(log.transactionHash);
    out.balanceMigrated.events += 1;
    out.balanceMigrated.total += amount;
  }
  out.balanceMigrated.recipients = recipientSet.size;
  out.balanceMigrated.txHashes = [...txSet];

  const logsMigrationCompleted = await fetchLogsChunked(
    provider,
    { address: tokenAddress, topics: [evs.MigrationCompleted] },
    fromBlock,
    toBlock,
    40000,
    `MigrationCompleted:${tokenAddress.slice(0, 10)}`
  );
  for (const log of logsMigrationCompleted) {
    const p = iface.parseLog(log);
    out.migrationCompleted.events += 1;
    out.migrationCompleted.totals.push(BigInt(p.args.totalMigrated));
  }

  const logsEmissionsMinted = await fetchLogsChunked(
    provider,
    { address: tokenAddress, topics: [evs.EmissionsMinted] },
    fromBlock,
    toBlock,
    40000,
    `EmissionsMinted:${tokenAddress.slice(0, 10)}`
  );
  for (const log of logsEmissionsMinted) {
    const p = iface.parseLog(log);
    out.emissionsMinted.events += 1;
    out.emissionsMinted.total += BigInt(p.args.amount);
  }

  const logsImmediateMinted = await fetchLogsChunked(
    provider,
    { address: tokenAddress, topics: [evs.ImmediateMinted] },
    fromBlock,
    toBlock,
    40000,
    `ImmediateMinted:${tokenAddress.slice(0, 10)}`
  );
  for (const log of logsImmediateMinted) {
    const p = iface.parseLog(log);
    out.immediateMinted.events += 1;
    out.immediateMinted.total += BigInt(p.args.amount);
  }

  return toSerializable(out);
}

function collectBaseSepoliaAddressesAndTokens() {
  const history = readJson(BASE_SEPOLIA_HISTORY);
  const events = Array.isArray(history.events) ? history.events : [];
  const roles = ["myntis", "emissions", "staking", "distributor", "vault", "registry"];
  const tracked = [];
  const tokens = [];
  for (const evt of events) {
    for (const role of roles) {
      const addr = evt[role];
      if (isAddress(addr)) tracked.push(ethers.getAddress(addr));
    }
    if (isAddress(evt.myntis)) tokens.push(ethers.getAddress(evt.myntis));
  }
  return {
    trackedAddresses: uniq(tracked.map((a) => normalize(a))).map((a) => ethers.getAddress(a)),
    tokenAddresses: uniq(tokens.map((a) => normalize(a))).map((a) => ethers.getAddress(a))
  };
}

function collectBaseMainnetAddressesAndTokens() {
  const latest = readJson(MAINNET_DEPLOYMENT_LATEST);
  const frozen = parseFrozenMainnetAddresses(MAINNET_FROZEN);
  const snapshots = readJson(MAINNET_HISTORY_SNAPSHOTS);

  const tracked = [];
  const tokens = [];

  if (isAddress(latest.myntis)) tokens.push(ethers.getAddress(latest.myntis));
  if (isAddress(latest.dualPoolStaking)) tracked.push(ethers.getAddress(latest.dualPoolStaking));
  if (isAddress(latest.emissionsContract)) tracked.push(ethers.getAddress(latest.emissionsContract));
  if (isAddress(latest.zkMerkleDistributor)) tracked.push(ethers.getAddress(latest.zkMerkleDistributor));
  if (isAddress(latest.liquidStakingVault)) tracked.push(ethers.getAddress(latest.liquidStakingVault));
  if (isAddress(latest.globalSupplyRegistry)) tracked.push(ethers.getAddress(latest.globalSupplyRegistry));
  if (isAddress(latest.deployer)) tracked.push(ethers.getAddress(latest.deployer));

  for (const section of ["active", "legacy"]) {
    const s = frozen[section] || {};
    for (const v of Object.values(s)) {
      if (isAddress(v)) tracked.push(ethers.getAddress(v));
    }
  }

  const roles = snapshots.roles || {};
  for (const roleEntries of Object.values(roles)) {
    const arr = Array.isArray(roleEntries) ? roleEntries : [];
    for (const row of arr) {
      if (isAddress(row.address)) tracked.push(ethers.getAddress(row.address));
      const tokenAtCreation = pick(row?.snapshots?.creation?.data?.token, null);
      const tokenAtLatest = pick(row?.snapshots?.latest?.data?.token, null);
      if (isAddress(tokenAtCreation)) tokens.push(ethers.getAddress(tokenAtCreation));
      if (isAddress(tokenAtLatest)) tokens.push(ethers.getAddress(tokenAtLatest));
    }
  }

  return {
    trackedAddresses: uniq(tracked.map((a) => normalize(a))).map((a) => ethers.getAddress(a)),
    tokenAddresses: uniq(tokens.map((a) => normalize(a))).map((a) => ethers.getAddress(a))
  };
}

function computeSnapshotInferences(snapshotPath) {
  const snap = readJson(snapshotPath);
  const recipients = Array.isArray(snap.recipients) ? snap.recipients : [];
  const values = recipients.map((r) => BigInt(r.amount || "0")).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const total = values.reduce((a, b) => a + b, 0n);
  const min = values.length ? values[0] : 0n;
  const max = values.length ? values[values.length - 1] : 0n;
  const median = values.length ? values[Math.floor(values.length / 2)] : 0n;
  const floorTotal = min * BigInt(values.length);
  const aboveFloor = total > floorTotal ? total - floorTotal : 0n;
  let band40to50 = 0;
  const lo = 40000n * 10n ** 18n;
  const hi = 50000n * 10n ** 18n;
  for (const v of values) {
    if (v >= lo && v <= hi) band40to50 += 1;
  }
  return {
    snapshotFile: path.relative(ROOT, snapshotPath),
    recipients: values.length,
    total: total.toString(),
    min: min.toString(),
    median: median.toString(),
    max: max.toString(),
    floorTotal: floorTotal.toString(),
    aboveFloor: aboveFloor.toString(),
    recipients40kTo50k: band40to50,
    totalFmt: fmtUnits(total, 18),
    minFmt: fmtUnits(min, 18),
    medianFmt: fmtUnits(median, 18),
    maxFmt: fmtUnits(max, 18),
    floorTotalFmt: fmtUnits(floorTotal, 18),
    aboveFloorFmt: fmtUnits(aboveFloor, 18)
  };
}

function readMigrationScopeDidNotMigrate(file) {
  const txt = fs.readFileSync(file, "utf8");
  const lines = txt.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+What Was Not Fully Migrated/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (inSection) {
      const m = line.match(/^\-\s+(.*)$/);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Forensic Migration Transfer Analysis");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");

  const both = [report.networks["base-sepolia"], report.networks["base-mainnet"]];
  for (const n of both) {
    lines.push(`## ${n.network}`);
    lines.push("");
    lines.push(`- RPC: \`${n.rpc}\``);
    lines.push(`- Latest block: \`${n.latestBlock}\``);
    lines.push(`- Tokens analyzed: **${n.tokenAnalyses.length}**`);
    lines.push(`- Tracked core addresses: **${n.trackedAddresses.length}**`);
    lines.push("");

    for (const token of n.tokenAnalyses) {
      lines.push(`### Token ${token.tokenAddress} (${token.symbol})`);
      lines.push("");
      lines.push(`- Block range: \`${token.fromBlock} -> ${token.toBlock}\``);
      lines.push(`- Total transfers: **${token.transferCount}**`);
      lines.push(`- Minted via Transfer(from=0): **${token.mintTotalFmt}** (${token.mintCount} events)`);
      lines.push(`- Burned via Transfer(to=0/0xdead): **${token.burnTotalFmt}** (${token.burnCount} events)`);
      lines.push(`- Aggregate transfer volume: **${token.volumeTotalFmt}**`);
      lines.push(`- Current totalSupply: **${token.totalSupplyFmt}**`);
      if (token.myntisEvents) {
        lines.push(`- BalanceMigrated events: **${token.myntisEvents.balanceMigrated.events}**`);
        lines.push(`- BalanceMigrated recipients: **${token.myntisEvents.balanceMigrated.recipients}**`);
        lines.push(`- BalanceMigrated total: **${fmtUnits(BigInt(token.myntisEvents.balanceMigrated.total), token.decimals)}**`);
        lines.push(`- ImmediateMinted total: **${fmtUnits(BigInt(token.myntisEvents.immediateMinted.total), token.decimals)}**`);
        lines.push(`- EmissionsMinted total: **${fmtUnits(BigInt(token.myntisEvents.emissionsMinted.total), token.decimals)}**`);
      }
      lines.push("");
    }
  }

  const mig = report.migrationAnalysis;
  lines.push("## Migration Findings");
  lines.push("");
  lines.push(`- Snapshot recipients: **${mig.snapshotInference.recipients}**`);
  lines.push(`- Snapshot total: **${mig.snapshotInference.totalFmt} MYNT**`);
  lines.push(`- Snapshot min recipient: **${mig.snapshotInference.minFmt} MYNT**`);
  lines.push(`- Min*recipients floor: **${mig.snapshotInference.floorTotalFmt} MYNT**`);
  lines.push(`- Above-floor remainder: **${mig.snapshotInference.aboveFloorFmt} MYNT**`);
  lines.push(`- Recipients in 40k-50k band: **${mig.snapshotInference.recipients40kTo50k}**`);
  lines.push("");
  lines.push("### Migrated");
  lines.push("");
  for (const item of mig.didMigrate) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### Not Fully Migrated");
  lines.push("");
  for (const item of mig.didNotMigrate) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## Evidence Files");
  lines.push("");
  lines.push("- `deployments/forensic-migration-transfer-analysis.json`");
  lines.push("- `deployments/MIGRATION_SCOPE_DISCLOSURE.md`");
  lines.push("- `migrations/base-sepolia-holders-snapshot-37378124.json`");
  lines.push("");
  return lines.join("\n") + "\n";
}

async function analyzeNetwork(networkKey, addressesAndTokens, creationBlockMap) {
  const cfg = NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: false });
  const latestBlock = await withTimeout(provider.getBlockNumber(), 10000, `${networkKey}:latestBlock`);

  const tokenAnalyses = [];
  for (const tokenAddress of addressesAndTokens.tokenAddresses) {
    const tokenNorm = normalize(tokenAddress);
    let fromBlock = creationBlockMap.get(tokenNorm) || null;
    if (!fromBlock) {
      fromBlock = await findCreationBlockByCode(provider, tokenAddress, latestBlock);
    }
    if (!fromBlock) fromBlock = Math.max(0, latestBlock - 2_000_000);

    console.log(`[${networkKey}] scanning token ${tokenAddress} from block ${fromBlock}`);
    const transferStats = await scanTokenTransfers(
      provider,
      tokenAddress,
      fromBlock,
      latestBlock,
      addressesAndTokens.trackedAddresses
    );

    let myntisEvents = null;
    try {
      myntisEvents = await scanMyntisEvents(provider, tokenAddress, fromBlock, latestBlock);
    } catch {
      myntisEvents = null;
    }

    tokenAnalyses.push({
      ...transferStats,
      myntisEvents
    });
  }

  return {
    network: networkKey,
    rpc: redactRpcUrl(cfg.rpc),
    latestBlock,
    trackedAddresses: addressesAndTokens.trackedAddresses.map((a) => normalize(a)).sort(),
    tokenAnalyses
  };
}

async function main() {
  if (!fs.existsSync(BASE_SEPOLIA_HISTORY)) {
    throw new Error(`Missing ${BASE_SEPOLIA_HISTORY}`);
  }
  if (!fs.existsSync(MAINNET_DEPLOYMENT_LATEST)) {
    throw new Error(`Missing ${MAINNET_DEPLOYMENT_LATEST}`);
  }
  if (!fs.existsSync(SNAPSHOT_37378124)) {
    throw new Error(`Missing ${SNAPSHOT_37378124}`);
  }
  if (!fs.existsSync(MIGRATION_SCOPE)) {
    throw new Error(`Missing ${MIGRATION_SCOPE}`);
  }

  const sepoliaConfig = collectBaseSepoliaAddressesAndTokens();
  const mainnetConfig = collectBaseMainnetAddressesAndTokens();
  const sepoliaCreationBlocks = loadCreationBlockMapFromSepoliaScan(BASE_SEPOLIA_SCAN);

  const sepolia = await analyzeNetwork("base-sepolia", sepoliaConfig, sepoliaCreationBlocks);
  const mainnet = await analyzeNetwork("base-mainnet", mainnetConfig, new Map());

  const snapshotInference = computeSnapshotInferences(SNAPSHOT_37378124);
  const mainnetPrimaryToken = mainnet.tokenAnalyses.find(
    (t) => normalize(t.tokenAddress) === normalize(readJson(MAINNET_DEPLOYMENT_LATEST).myntis || "")
  );

  const didMigrate = [
    "Holder balances via Myntis.migrateMint on Base mainnet (captured as BalanceMigrated events where present).",
    "One-time holder airdrop/migration snapshot from Base Sepolia holders into Base mainnet holder balances.",
    "Mainnet token minting allocations tracked through ImmediateMinted and EmissionsMinted events."
  ];

  const didNotMigrate = readMigrationScopeDidNotMigrate(MIGRATION_SCOPE);

  const report = {
    generatedAt: new Date().toISOString(),
    networks: {
      "base-sepolia": sepolia,
      "base-mainnet": mainnet
    },
    migrationAnalysis: {
      snapshotInference,
      mainnetPrimaryTokenBalanceMigrated: mainnetPrimaryToken?.myntisEvents?.balanceMigrated || null,
      didMigrate,
      didNotMigrate
    }
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(toSerializable(report), null, 2) + "\n", "utf8");
  fs.writeFileSync(OUT_MD, buildMarkdown(toSerializable(report)), "utf8");

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
