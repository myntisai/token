#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env.dev") });
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const ROOT = path.resolve(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");

const MAINNET_LATEST_FILE = path.join(DEPLOYMENTS_DIR, "deployment-base-mainnet-latest.json");
const FORENSIC_FILE = path.join(DEPLOYMENTS_DIR, "forensic-contract-history-latest.json");

const OUT_SNAPSHOTS = path.join(DEPLOYMENTS_DIR, "historical-snapshots-mainnet-core.json");
const OUT_CANDIDATES = path.join(DEPLOYMENTS_DIR, "compensation-candidates-mainnet.json");
const OUT_PLAN = path.join(DEPLOYMENTS_DIR, "compensation-migration-plan.md");
const OUT_FROZEN = path.join(DEPLOYMENTS_DIR, "FROZEN_MAINNET_ADDRESSES.md");

const TARGET_ROLES = ["emissionsContract", "dualPoolStaking", "zkMerkleDistributor"];
const MAINNET_CHAIN_ID = 8453;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalize(addr) {
  return String(addr).toLowerCase();
}

function uniq(arr) {
  return [...new Set(arr)];
}

function bn(val) {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(val);
  if (typeof val === "string") return BigInt(val);
  return 0n;
}

function fmt(bi, decimals = 18) {
  try {
    return ethers.formatUnits(bi, decimals);
  } catch {
    return bi.toString();
  }
}

function toStringObj(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toStringObj);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toStringObj(v);
    return out;
  }
  return value;
}

async function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`timeout:${label}`));
    }, ms);

    Promise.resolve(promise)
      .then((v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function callAt(contract, method, args, blockTag) {
  try {
    if (typeof blockTag === "number") {
      return await withTimeout(contract[method](...args, { blockTag }), 7000, method);
    }
    return await withTimeout(contract[method](...args), 7000, method);
  } catch {
    return null;
  }
}

async function getCodeAt(provider, address, blockTag) {
  try {
    return await withTimeout(provider.getCode(address, blockTag), 7000, "getCode");
  } catch {
    return "0x";
  }
}

async function findCreationBlock(provider, address, latestBlock) {
  const latestCode = await getCodeAt(provider, address, latestBlock);
  if (latestCode === "0x") return null;

  let low = 0;
  let high = latestBlock;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const code = await getCodeAt(provider, address, mid);
    if (code !== "0x") {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  const code = await getCodeAt(provider, address, low);
  return code !== "0x" ? low : null;
}

async function findCreationTxHash(provider, address, creationBlock) {
  if (creationBlock == null) return null;
  const block = await withTimeout(provider.getBlock(creationBlock), 7000, "getBlock");
  if (!block || !Array.isArray(block.transactions)) return null;

  for (const txHash of block.transactions) {
    const receipt = await withTimeout(provider.getTransactionReceipt(txHash), 7000, "getReceipt").catch(() => null);
    if (!receipt || !receipt.contractAddress) continue;
    if (normalize(receipt.contractAddress) === normalize(address)) return receipt.hash;
  }
  return null;
}

async function getLogsChunked(provider, address, topics, fromBlock, toBlock, step = 100000) {
  const logs = [];
  if (fromBlock > toBlock) return logs;
  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const to = Math.min(toBlock, from + step);
    const part = await withTimeout(
      provider.getLogs({ address, topics, fromBlock: from, toBlock: to }),
      10000,
      "getLogs"
    ).catch(() => []);
    logs.push(...part);
  }
  return logs;
}

async function discoverStakingAddresses(provider, stakingAddress, creationBlock, latestBlock) {
  const iface = new ethers.Interface([
    "event Staked(address indexed user,uint256 amount,uint8 poolType)",
    "event ProviderEmissionsAccrued(address indexed provider,uint256 amount,uint256 totalAccrued)",
    "event ProviderEmissionsWithdrawn(address indexed provider,uint256 amount)",
    "event ProviderBalanceFunded(address indexed provider,uint256 amount,address indexed distributor)"
  ]);

  const topics = [[
    iface.getEvent("Staked").topicHash,
    iface.getEvent("ProviderEmissionsAccrued").topicHash,
    iface.getEvent("ProviderEmissionsWithdrawn").topicHash,
    iface.getEvent("ProviderBalanceFunded").topicHash
  ]];
  const logs = await getLogsChunked(provider, stakingAddress, topics, creationBlock, latestBlock, 100000);
  const stakers = new Set();
  const providers = new Set();
  for (const log of logs) {
    let parsed;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue;
    }
    if (!parsed) continue;
    const n = parsed.name;
    if (n === "Staked") {
      const user = parsed.args.user;
      const poolType = Number(parsed.args.poolType);
      if (ADDRESS_RE.test(user)) stakers.add(ethers.getAddress(user));
      if (poolType === 0 && ADDRESS_RE.test(user)) providers.add(ethers.getAddress(user));
    } else if (n === "ProviderEmissionsAccrued" || n === "ProviderEmissionsWithdrawn" || n === "ProviderBalanceFunded") {
      const providerAddr = parsed.args.provider;
      if (ADDRESS_RE.test(providerAddr)) providers.add(ethers.getAddress(providerAddr));
    }
  }
  return {
    stakers: [...stakers].sort(),
    providers: [...providers].sort()
  };
}

async function discoverDistributorProviders(provider, distributorAddress, creationBlock, latestBlock) {
  const iface = new ethers.Interface([
    "event ProviderBalanceUpdated(address indexed provider,uint256 newBalance)",
    "event MerkleRootSubmitted(address indexed provider,uint256 rootIndex,bytes32 root,uint256 expiry,uint256 totalClaimable,bytes32 batchHash)",
    "event ProviderSlashed(address indexed provider,uint256 amount)",
    "event RewardsClaimed(address indexed user,address indexed provider,uint256 rootIndex,uint256 amount)"
  ]);
  const topics = [[
    iface.getEvent("ProviderBalanceUpdated").topicHash,
    iface.getEvent("MerkleRootSubmitted").topicHash,
    iface.getEvent("ProviderSlashed").topicHash,
    iface.getEvent("RewardsClaimed").topicHash
  ]];
  const logs = await getLogsChunked(provider, distributorAddress, topics, creationBlock, latestBlock, 100000);
  const providers = new Set();
  for (const log of logs) {
    let parsed;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue;
    }
    if (!parsed) continue;
    const providerAddr = parsed.args.provider;
    if (ADDRESS_RE.test(providerAddr)) providers.add(ethers.getAddress(providerAddr));
  }
  return [...providers].sort();
}

async function loadTokenBalance(provider, tokenAddress, holder, blockTag) {
  if (!ADDRESS_RE.test(tokenAddress)) return 0n;
  const token = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"],
    provider
  );
  const balance = await callAt(token, "balanceOf", [holder], blockTag);
  return balance == null ? 0n : bn(balance);
}

async function snapshotEmissions(provider, address, blockTag) {
  const c = new ethers.Contract(
    address,
    [
      "function token() view returns (address)",
      "function stakingContract() view returns (address)",
      "function mintedEmissions() view returns (uint256)",
      "function accountedEmissions() view returns (uint256)",
      "function accRewardPerShare() view returns (uint256)",
      "function startTime() view returns (uint256)",
      "function lastRewardTime() view returns (uint256)",
      "function getCurrentEmissionRate() view returns (uint256)"
    ],
    provider
  );
  const token = await callAt(c, "token", [], blockTag);
  const stakingContract = await callAt(c, "stakingContract", [], blockTag);
  const mintedEmissions = bn(await callAt(c, "mintedEmissions", [], blockTag) || 0n);
  const accountedEmissions = bn(await callAt(c, "accountedEmissions", [], blockTag) || 0n);
  const accRewardPerShare = bn(await callAt(c, "accRewardPerShare", [], blockTag) || 0n);
  const startTime = bn(await callAt(c, "startTime", [], blockTag) || 0n);
  const lastRewardTime = bn(await callAt(c, "lastRewardTime", [], blockTag) || 0n);
  const emissionRate = bn(await callAt(c, "getCurrentEmissionRate", [], blockTag) || 0n);
  const tokenBalance = token ? await loadTokenBalance(provider, token, address, blockTag) : 0n;

  return {
    token,
    stakingContract,
    mintedEmissions,
    accountedEmissions,
    unmintedEmissions: accountedEmissions > mintedEmissions ? accountedEmissions - mintedEmissions : 0n,
    accRewardPerShare,
    startTime,
    lastRewardTime,
    emissionRate,
    tokenBalance
  };
}

async function snapshotStaking(provider, address, blockTag, knownAddresses) {
  const c = new ethers.Contract(
    address,
    [
      "function token() view returns (address)",
      "function emissionsContract() view returns (address)",
      "function zkMerkleDistributor() view returns (address)",
      "function liquidStakingVault() view returns (address)",
      "function treasury() view returns (address)",
      "function providerPendingRewards() view returns (uint256)",
      "function userPendingRewards() view returns (uint256)",
      "function pendingTreasuryWithdrawal() view returns (uint256)",
      "function totalProviderAccruedEmissions() view returns (uint256)",
      "function providerPool() view returns (uint256 totalStaked,uint256 accRewardPerShare,uint256 lastRewardTime,uint256 emissionShare,uint256 totalRewards)",
      "function userPool() view returns (uint256 totalStaked,uint256 accRewardPerShare,uint256 lastRewardTime,uint256 emissionShare,uint256 totalRewards)",
      "function pendingRewards(address) view returns (uint256)",
      "function providerAccruedEmissions(address) view returns (uint256)"
    ],
    provider
  );

  const token = await callAt(c, "token", [], blockTag);
  const emissionsContract = await callAt(c, "emissionsContract", [], blockTag);
  const zkMerkleDistributor = await callAt(c, "zkMerkleDistributor", [], blockTag);
  const liquidStakingVault = await callAt(c, "liquidStakingVault", [], blockTag);
  const treasury = await callAt(c, "treasury", [], blockTag);

  const providerPendingRewards = bn(await callAt(c, "providerPendingRewards", [], blockTag) || 0n);
  const userPendingRewards = bn(await callAt(c, "userPendingRewards", [], blockTag) || 0n);
  const pendingTreasuryWithdrawal = bn(await callAt(c, "pendingTreasuryWithdrawal", [], blockTag) || 0n);
  const totalProviderAccruedEmissions = bn(await callAt(c, "totalProviderAccruedEmissions", [], blockTag) || 0n);

  const providerPoolRaw = await callAt(c, "providerPool", [], blockTag);
  const userPoolRaw = await callAt(c, "userPool", [], blockTag);

  const providerPool = providerPoolRaw
    ? {
        totalStaked: bn(providerPoolRaw.totalStaked),
        accRewardPerShare: bn(providerPoolRaw.accRewardPerShare),
        lastRewardTime: bn(providerPoolRaw.lastRewardTime),
        emissionShare: bn(providerPoolRaw.emissionShare),
        totalRewards: bn(providerPoolRaw.totalRewards)
      }
    : { totalStaked: 0n, accRewardPerShare: 0n, lastRewardTime: 0n, emissionShare: 0n, totalRewards: 0n };

  const userPool = userPoolRaw
    ? {
        totalStaked: bn(userPoolRaw.totalStaked),
        accRewardPerShare: bn(userPoolRaw.accRewardPerShare),
        lastRewardTime: bn(userPoolRaw.lastRewardTime),
        emissionShare: bn(userPoolRaw.emissionShare),
        totalRewards: bn(userPoolRaw.totalRewards)
      }
    : { totalStaked: 0n, accRewardPerShare: 0n, lastRewardTime: 0n, emissionShare: 0n, totalRewards: 0n };

  const principal = providerPool.totalStaked + userPool.totalStaked;
  const tokenBalance = token ? await loadTokenBalance(provider, token, address, blockTag) : 0n;

  const perStakerPending = [];
  let knownStakersPendingTotal = 0n;
  for (const staker of knownAddresses.stakers) {
    const p = await callAt(c, "pendingRewards", [staker], blockTag);
    const pending = bn(p || 0n);
    if (pending > 0n) {
      perStakerPending.push({ address: staker, pending });
      knownStakersPendingTotal += pending;
    }
  }

  const perProviderAccrued = [];
  let knownProvidersAccruedTotal = 0n;
  for (const providerAddr of knownAddresses.providers) {
    const v = await callAt(c, "providerAccruedEmissions", [providerAddr], blockTag);
    const accrued = bn(v || 0n);
    if (accrued > 0n) {
      perProviderAccrued.push({ address: providerAddr, accrued });
      knownProvidersAccruedTotal += accrued;
    }
  }

  const rewardLiability =
    providerPendingRewards +
    userPendingRewards +
    pendingTreasuryWithdrawal +
    totalProviderAccruedEmissions +
    knownStakersPendingTotal;
  const rewardFunds = tokenBalance > principal ? tokenBalance - principal : 0n;
  const rewardGap = rewardLiability > rewardFunds ? rewardLiability - rewardFunds : 0n;
  const rewardSurplus = rewardFunds > rewardLiability ? rewardFunds - rewardLiability : 0n;

  return {
    token,
    emissionsContract,
    zkMerkleDistributor,
    liquidStakingVault,
    treasury,
    tokenBalance,
    providerPool,
    userPool,
    principal,
    providerPendingRewards,
    userPendingRewards,
    pendingTreasuryWithdrawal,
    totalProviderAccruedEmissions,
    knownStakersCount: knownAddresses.stakers.length,
    knownProvidersCount: knownAddresses.providers.length,
    knownStakersPendingTotal,
    knownProvidersAccruedTotal,
    rewardLiability,
    rewardFunds,
    rewardGap,
    rewardSurplus,
    perStakerPending,
    perProviderAccrued
  };
}

async function snapshotDistributor(provider, address, blockTag, providerAddresses) {
  const c = new ethers.Contract(
    address,
    [
      "function token() view returns (address)",
      "function stakingContract() view returns (address)",
      "function slashRecipient() view returns (address)",
      "function batchVerifier() view returns (address)",
      "function getProviderBalance(address) view returns (uint256)",
      "function getLockedBalance(address) view returns (uint256)",
      "function getEpochCount(address) view returns (uint256)",
      "function getEpochInfo(address,uint256) view returns (bytes32 root,uint256 expiry,bool closed,uint256 totalClaimable,uint256 claimedAmount,bool providerProofVerified,bytes32 batchHash)"
    ],
    provider
  );

  const token = await callAt(c, "token", [], blockTag);
  const stakingContract = await callAt(c, "stakingContract", [], blockTag);
  const slashRecipient = await callAt(c, "slashRecipient", [], blockTag);
  const batchVerifier = await callAt(c, "batchVerifier", [], blockTag);
  const tokenBalance = token ? await loadTokenBalance(provider, token, address, blockTag) : 0n;

  let totalProviderBalance = 0n;
  let totalLockedBalance = 0n;
  let totalEpochOutstanding = 0n;
  const perProvider = [];

  for (const pAddr of providerAddresses) {
    const pb = bn((await callAt(c, "getProviderBalance", [pAddr], blockTag)) || 0n);
    const lb = bn((await callAt(c, "getLockedBalance", [pAddr], blockTag)) || 0n);
    const ec = bn((await callAt(c, "getEpochCount", [pAddr], blockTag)) || 0n);
    let epochOutstanding = 0n;

    const maxEpochs = Number(ec > 2000n ? 2000n : ec);
    for (let i = 0; i < maxEpochs; i++) {
      const e = await callAt(c, "getEpochInfo", [pAddr, BigInt(i)], blockTag);
      if (!e) continue;
      const totalClaimable = bn(e.totalClaimable);
      const claimedAmount = bn(e.claimedAmount);
      if (totalClaimable > claimedAmount) {
        epochOutstanding += totalClaimable - claimedAmount;
      }
    }

    totalProviderBalance += pb;
    totalLockedBalance += lb;
    totalEpochOutstanding += epochOutstanding;

    if (pb > 0n || lb > 0n || ec > 0n) {
      perProvider.push({
        address: pAddr,
        providerBalance: pb,
        lockedBalance: lb,
        epochCount: ec,
        epochOutstanding
      });
    }
  }

  const liability = totalProviderBalance + totalLockedBalance;
  const gap = liability > tokenBalance ? liability - tokenBalance : 0n;
  const surplus = tokenBalance > liability ? tokenBalance - liability : 0n;

  return {
    token,
    stakingContract,
    slashRecipient,
    batchVerifier,
    tokenBalance,
    knownProvidersCount: providerAddresses.length,
    totalProviderBalance,
    totalLockedBalance,
    totalEpochOutstanding,
    liability,
    gap,
    surplus,
    perProvider
  };
}

function extractBaseMainnetHistory() {
  const files = fs
    .readdirSync(DEPLOYMENTS_DIR)
    .filter((f) => f.startsWith("deployment-base-mainnet") && f.endsWith(".json"))
    .sort();

  const history = [];
  for (const f of files) {
    const full = path.join(DEPLOYMENTS_DIR, f);
    const j = readJson(full);
    history.push({
      file: `deployments/${f}`,
      timestamp: j.timestamp || fs.statSync(full).mtime.toISOString(),
      chainId: j.chainId,
      values: j
    });
  }
  history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return history;
}

function buildRoleAddresses(history, mainnetLatest) {
  const byRole = {};
  for (const role of TARGET_ROLES) byRole[role] = [];

  for (const item of history) {
    for (const role of TARGET_ROLES) {
      const addr = item.values[role];
      if (!ADDRESS_RE.test(String(addr || ""))) continue;
      byRole[role].push({
        address: ethers.getAddress(addr),
        normalizedAddress: normalize(addr),
        file: item.file,
        timestamp: item.timestamp,
        isActive: normalize(addr) === normalize(mainnetLatest[role] || "")
      });
    }
  }

  for (const role of TARGET_ROLES) {
    const dedup = new Map();
    for (const row of byRole[role]) {
      if (!dedup.has(row.normalizedAddress)) {
        dedup.set(row.normalizedAddress, row);
      }
    }
    byRole[role] = [...dedup.values()];
  }
  return byRole;
}

function mapCompensationCandidates(legacyStakingCutover, legacyDistributorCutover) {
  const map = new Map();
  function add(address, category, amount) {
    if (amount <= 0n) return;
    const key = normalize(address);
    const cur = map.get(key) || {
      address: ethers.getAddress(address),
      total: 0n,
      categories: {}
    };
    cur.total += amount;
    cur.categories[category] = (cur.categories[category] || 0n) + amount;
    map.set(key, cur);
  }

  for (const row of legacyStakingCutover.perStakerPending || []) {
    add(row.address, "legacyStakingPendingRewards", bn(row.pending));
  }
  for (const row of legacyStakingCutover.perProviderAccrued || []) {
    add(row.address, "legacyStakingProviderAccrued", bn(row.accrued));
  }
  for (const row of legacyDistributorCutover.perProvider || []) {
    add(row.address, "legacyDistributorProviderBalance", bn(row.providerBalance));
    // Keep locked amounts separate for operator decision; do not include in immediate total.
  }

  const immediate = [...map.values()].sort((a, b) => normalize(a.address).localeCompare(normalize(b.address)));
  const lockedOnly = (legacyDistributorCutover.perProvider || [])
    .filter((r) => bn(r.lockedBalance) > 0n)
    .map((r) => ({ address: r.address, lockedBalance: bn(r.lockedBalance), epochCount: bn(r.epochCount) }))
    .sort((a, b) => normalize(a.address).localeCompare(normalize(b.address)));

  return {
    immediate,
    lockedOnly
  };
}

async function main() {
  if (!fs.existsSync(MAINNET_LATEST_FILE)) {
    throw new Error(`Missing ${MAINNET_LATEST_FILE}`);
  }
  if (!fs.existsSync(FORENSIC_FILE)) {
    throw new Error(`Missing ${FORENSIC_FILE}. Generate forensic snapshot first.`);
  }

  const rpc = process.env.BASE_RPC_URL;
  if (!rpc) {
    throw new Error("BASE_RPC_URL not set");
  }

  const provider = new ethers.JsonRpcProvider(rpc, MAINNET_CHAIN_ID, { staticNetwork: false });
  const latestBlock = await withTimeout(provider.getBlockNumber(), 7000, "latestBlock");
  const latest = readJson(MAINNET_LATEST_FILE);
  const history = extractBaseMainnetHistory();
  const roleAddresses = buildRoleAddresses(history, latest);

  const snapshots = {
    generatedAt: new Date().toISOString(),
    chainId: MAINNET_CHAIN_ID,
    latestBlock,
    roles: {}
  };

  const contractMeta = {};
  for (const role of TARGET_ROLES) {
    console.log(`Resolving creation metadata: ${role}`);
    const entries = [];
    for (const row of roleAddresses[role]) {
      const creationBlock = await findCreationBlock(provider, row.address, latestBlock);
      const creationTxHash = await findCreationTxHash(provider, row.address, creationBlock);
      const status = row.isActive ? "active" : "legacy";
      entries.push({
        role,
        status,
        address: row.address,
        normalizedAddress: row.normalizedAddress,
        firstSeenFile: row.file,
        firstSeenTimestamp: row.timestamp,
        creationBlock,
        creationTxHash,
        snapshots: {}
      });
    }

    entries.sort((a, b) => (a.creationBlock ?? Number.MAX_SAFE_INTEGER) - (b.creationBlock ?? Number.MAX_SAFE_INTEGER));
    snapshots.roles[role] = entries;
    for (const e of entries) contractMeta[e.normalizedAddress] = e;
  }

  for (const role of TARGET_ROLES) {
    for (const entry of snapshots.roles[role]) {
      if (entry.creationBlock == null) continue;
      console.log(`Snapshotting ${role} ${entry.status} ${entry.address}`);

      let knownStaking = { stakers: [], providers: [] };
      let knownDistributorProviders = [];
      if (role === "dualPoolStaking") {
        knownStaking = await discoverStakingAddresses(provider, entry.address, entry.creationBlock, latestBlock);
      }
      if (role === "zkMerkleDistributor") {
        knownDistributorProviders = await discoverDistributorProviders(provider, entry.address, entry.creationBlock, latestBlock);
      }

      if (role === "emissionsContract") {
        const atCreation = await snapshotEmissions(provider, entry.address, entry.creationBlock);
        const atLatest = await snapshotEmissions(provider, entry.address, latestBlock);
        entry.snapshots.creation = { block: entry.creationBlock, data: toStringObj(atCreation) };
        entry.snapshots.latest = { block: latestBlock, data: toStringObj(atLatest) };
      } else if (role === "dualPoolStaking") {
        const atCreation = await snapshotStaking(provider, entry.address, entry.creationBlock, knownStaking);
        const atLatest = await snapshotStaking(provider, entry.address, latestBlock, knownStaking);
        entry.snapshots.creation = { block: entry.creationBlock, data: toStringObj(atCreation) };
        entry.snapshots.latest = { block: latestBlock, data: toStringObj(atLatest) };
        entry.knownAddresses = knownStaking;
      } else if (role === "zkMerkleDistributor") {
        const atCreation = await snapshotDistributor(provider, entry.address, entry.creationBlock, knownDistributorProviders);
        const atLatest = await snapshotDistributor(provider, entry.address, latestBlock, knownDistributorProviders);
        entry.snapshots.creation = { block: entry.creationBlock, data: toStringObj(atCreation) };
        entry.snapshots.latest = { block: latestBlock, data: toStringObj(atLatest) };
        entry.knownProviders = knownDistributorProviders;
      }
    }
  }

  // Cutover snapshots: legacy contract state immediately before active contract creation.
  const activeByRole = {};
  const legacyByRole = {};
  for (const role of TARGET_ROLES) {
    const list = snapshots.roles[role];
    activeByRole[role] = list.find((x) => x.status === "active") || null;
    const legacyList = list.filter((x) => x.status === "legacy");
    legacyByRole[role] = legacyList.length ? legacyList[legacyList.length - 1] : null;
  }

  const cutover = {};
  for (const role of TARGET_ROLES) {
    const active = activeByRole[role];
    const legacy = legacyByRole[role];
    if (!active || !legacy || active.creationBlock == null) continue;
    const cutoverBlock = active.creationBlock - 1;
    if (cutoverBlock <= 0) continue;

    if (role === "emissionsContract") {
      const data = await snapshotEmissions(provider, legacy.address, cutoverBlock);
      cutover[role] = { block: cutoverBlock, legacyAddress: legacy.address, activeAddress: active.address, data: toStringObj(data) };
    } else if (role === "dualPoolStaking") {
      const known = legacy.knownAddresses || { stakers: [], providers: [] };
      const data = await snapshotStaking(provider, legacy.address, cutoverBlock, known);
      cutover[role] = { block: cutoverBlock, legacyAddress: legacy.address, activeAddress: active.address, data: toStringObj(data) };
    } else if (role === "zkMerkleDistributor") {
      const known = legacy.knownProviders || [];
      const data = await snapshotDistributor(provider, legacy.address, cutoverBlock, known);
      cutover[role] = { block: cutoverBlock, legacyAddress: legacy.address, activeAddress: active.address, data: toStringObj(data) };
    }
  }

  snapshots.cutover = cutover;

  // Gap model
  const stakingCutover = cutover.dualPoolStaking ? cutover.dualPoolStaking.data : null;
  const distributorCutover = cutover.zkMerkleDistributor ? cutover.zkMerkleDistributor.data : null;

  let rewardLiabilityStaking = 0n;
  let rewardFundsStaking = 0n;
  let rewardGapStaking = 0n;
  let rewardSurplusStaking = 0n;
  let distributorLiability = 0n;
  let distributorFunds = 0n;
  let distributorGap = 0n;
  let distributorSurplus = 0n;
  let distributorLocked = 0n;

  if (stakingCutover) {
    rewardLiabilityStaking = bn(stakingCutover.rewardLiability || "0");
    rewardFundsStaking = bn(stakingCutover.rewardFunds || "0");
    rewardGapStaking = bn(stakingCutover.rewardGap || "0");
    rewardSurplusStaking = bn(stakingCutover.rewardSurplus || "0");
  }

  if (distributorCutover) {
    distributorLiability = bn(distributorCutover.liability || "0");
    distributorFunds = bn(distributorCutover.tokenBalance || "0");
    distributorGap = bn(distributorCutover.gap || "0");
    distributorSurplus = bn(distributorCutover.surplus || "0");
    distributorLocked = bn(distributorCutover.totalLockedBalance || "0");
  }

  const combinedLiability = rewardLiabilityStaking + distributorLiability;
  const combinedFunds = rewardFundsStaking + distributorFunds;
  const combinedGap = combinedLiability > combinedFunds ? combinedLiability - combinedFunds : 0n;
  const combinedSurplus = combinedFunds > combinedLiability ? combinedFunds - combinedLiability : 0n;

  const candidatesRaw = mapCompensationCandidates(
    stakingCutover
      ? {
          perStakerPending: stakingCutover.perStakerPending || [],
          perProviderAccrued: stakingCutover.perProviderAccrued || []
        }
      : { perStakerPending: [], perProviderAccrued: [] },
    distributorCutover
      ? {
          perProvider: distributorCutover.perProvider || []
        }
      : { perProvider: [] }
  );

  const immediateTotal = candidatesRaw.immediate.reduce((sum, r) => sum + bn(r.total), 0n);
  const lockedOnlyTotal = candidatesRaw.lockedOnly.reduce((sum, r) => sum + bn(r.lockedBalance), 0n);

  const gapSummary = {
    rewardLiabilityStaking: rewardLiabilityStaking.toString(),
    rewardFundsStaking: rewardFundsStaking.toString(),
    rewardGapStaking: rewardGapStaking.toString(),
    rewardSurplusStaking: rewardSurplusStaking.toString(),
    distributorLiability: distributorLiability.toString(),
    distributorFunds: distributorFunds.toString(),
    distributorGap: distributorGap.toString(),
    distributorSurplus: distributorSurplus.toString(),
    distributorLocked: distributorLocked.toString(),
    combinedLiability: combinedLiability.toString(),
    combinedFunds: combinedFunds.toString(),
    combinedGap: combinedGap.toString(),
    combinedSurplus: combinedSurplus.toString(),
    immediateCandidatesTotal: immediateTotal.toString(),
    lockedOnlyCandidatesTotal: lockedOnlyTotal.toString()
  };

  snapshots.gapSummary = gapSummary;

  fs.writeFileSync(OUT_SNAPSHOTS, JSON.stringify(toStringObj(snapshots), null, 2) + "\n", "utf8");

  const candidates = {
    generatedAt: new Date().toISOString(),
    chainId: MAINNET_CHAIN_ID,
    assumptions: {
      immediateIncludes: [
        "legacy staking pendingRewards for discovered stakers",
        "legacy staking providerAccruedEmissions for discovered providers",
        "legacy distributor providerBalance"
      ],
      excludedFromImmediate: [
        "legacy distributor lockedBalance (kept as locked-epoch liability bucket)"
      ]
    },
    totals: {
      immediateTotal: immediateTotal.toString(),
      lockedOnlyTotal: lockedOnlyTotal.toString()
    },
    immediate: toStringObj(candidatesRaw.immediate),
    lockedOnly: toStringObj(candidatesRaw.lockedOnly)
  };
  fs.writeFileSync(OUT_CANDIDATES, JSON.stringify(candidates, null, 2) + "\n", "utf8");

  const lines = [];
  lines.push("# Mainnet Compensation / Migration Plan");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Chain: Base Mainnet (${MAINNET_CHAIN_ID})`);
  lines.push("");
  lines.push("## Frozen Contract Set");
  lines.push("");
  lines.push(`- Active emissions: \`${activeByRole.emissionsContract ? activeByRole.emissionsContract.address : "n/a"}\``);
  lines.push(`- Active staking: \`${activeByRole.dualPoolStaking ? activeByRole.dualPoolStaking.address : "n/a"}\``);
  lines.push(`- Active distributor: \`${activeByRole.zkMerkleDistributor ? activeByRole.zkMerkleDistributor.address : "n/a"}\``);
  lines.push(`- Legacy emissions (cutover source): \`${legacyByRole.emissionsContract ? legacyByRole.emissionsContract.address : "n/a"}\``);
  lines.push(`- Legacy staking (cutover source): \`${legacyByRole.dualPoolStaking ? legacyByRole.dualPoolStaking.address : "n/a"}\``);
  lines.push(`- Legacy distributor (cutover source): \`${legacyByRole.zkMerkleDistributor ? legacyByRole.zkMerkleDistributor.address : "n/a"}\``);
  lines.push("");
  lines.push("## Quantified Gap (Cutover Model)");
  lines.push("");
  lines.push(`- Legacy staking reward liability: **${fmt(rewardLiabilityStaking)} MYNT**`);
  lines.push(`- Legacy staking reward funds: **${fmt(rewardFundsStaking)} MYNT**`);
  lines.push(`- Legacy staking reward gap: **${fmt(rewardGapStaking)} MYNT**`);
  lines.push(`- Legacy distributor liability (provider + locked): **${fmt(distributorLiability)} MYNT**`);
  lines.push(`- Legacy distributor funds: **${fmt(distributorFunds)} MYNT**`);
  lines.push(`- Legacy distributor gap: **${fmt(distributorGap)} MYNT**`);
  lines.push(`- Combined gap (staking+distributor): **${fmt(combinedGap)} MYNT**`);
  lines.push(`- Immediate candidate total (non-locked): **${fmt(immediateTotal)} MYNT**`);
  lines.push(`- Locked-epoch liability bucket: **${fmt(lockedOnlyTotal)} MYNT**`);
  lines.push("");
  lines.push("## Single Plan (Merkle Compensation)");
  lines.push("");
  lines.push("1. Freeze legacy addresses in app/backend config; no new user actions routed to legacy staking/distributor.");
  lines.push("2. Export beneficiaries from `deployments/compensation-candidates-mainnet.json` (`immediate` bucket only).");
  lines.push("3. Fund a one-time compensation Merkle distributor with `immediateTotal + safetyBuffer` MYNT.");
  lines.push("4. Publish merkle root + proof API + claim window (recommended 90 days).");
  lines.push("5. Keep legacy distributor online for locked epochs; after closure, reconcile and run a second tiny Merkle if needed.");
  lines.push("6. Any deficit (`combinedGap`) is top-upped by multisig before opening claims.");
  lines.push("");
  lines.push("## Operational Notes");
  lines.push("");
  lines.push("- This plan treats locked epochs as a separate bucket to avoid overpaying before epoch close resolution.");
  lines.push("- If `combinedGap` is zero, compensation can be fully funded from legacy recoverable funds.");
  lines.push("- Re-run this script immediately before finalizing distribution to refresh numbers.");
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push("- `deployments/historical-snapshots-mainnet-core.json`");
  lines.push("- `deployments/compensation-candidates-mainnet.json`");
  lines.push("- `deployments/FROZEN_MAINNET_ADDRESSES.md`");
  lines.push("");

  fs.writeFileSync(OUT_PLAN, lines.join("\n") + "\n", "utf8");

  const frozen = [];
  frozen.push("# Frozen Mainnet Addresses");
  frozen.push("");
  frozen.push("Policy: these addresses are frozen for production routing; legacy set is read-only.");
  frozen.push("");
  frozen.push("## Active");
  frozen.push("");
  for (const role of TARGET_ROLES) {
    const a = activeByRole[role];
    frozen.push(`- ${role}: \`${a ? a.address : "n/a"}\``);
  }
  frozen.push("");
  frozen.push("## Legacy (Do Not Route New Actions)");
  frozen.push("");
  for (const role of TARGET_ROLES) {
    const l = legacyByRole[role];
    frozen.push(`- ${role}: \`${l ? l.address : "n/a"}\``);
  }
  frozen.push("");
  frozen.push("Generated from: `scripts/analyze-mainnet-historical-gap.js`");
  frozen.push("");
  fs.writeFileSync(OUT_FROZEN, frozen.join("\n"), "utf8");

  console.log(`Wrote ${OUT_SNAPSHOTS}`);
  console.log(`Wrote ${OUT_CANDIDATES}`);
  console.log(`Wrote ${OUT_PLAN}`);
  console.log(`Wrote ${OUT_FROZEN}`);
  console.log(JSON.stringify(gapSummary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
