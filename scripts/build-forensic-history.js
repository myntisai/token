#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env.dev") });
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const ROOT = path.resolve(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
const REGISTRY_ENRICHED = path.join(DEPLOYMENTS_DIR, "contract-registry-enriched-latest.json");
const OUT_JSON = path.join(DEPLOYMENTS_DIR, "forensic-contract-history-latest.json");
const OUT_MD = path.join(DEPLOYMENTS_DIR, "forensic-contract-history-latest.md");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const RPC_BY_NETWORK = {
  "base-mainnet": process.env.BASE_RPC_URL || "https://mainnet.base.org",
  "base-sepolia":
    process.env.BASE_SEPOLIA_RPC_URL ||
    process.env.RPC_URL ||
    process.env.NEXT_PUBLIC_HUB_RPC_URL ||
    "https://sepolia.base.org",
  "ethereum-sepolia":
    process.env.ETH_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SPOKE_RPC_URL || "https://ethereum-sepolia.publicnode.com",
  sepolia:
    process.env.ETH_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SPOKE_RPC_URL || "https://ethereum-sepolia.publicnode.com",
  "arbitrum-sepolia": process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
  "optimism-sepolia": process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io",
  "zksync-sepolia": process.env.ZKSYNC_SEPOLIA_RPC_URL || "https://sepolia.era.zksync.dev"
};

const METHOD_FRAGMENTS = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function token() view returns (address)",
  "function globalSupplyRegistry() view returns (address)",
  "function stakingContract() view returns (address)",
  "function emissionsContract() view returns (address)",
  "function liquidStakingVault() view returns (address)",
  "function zkMerkleDistributor() view returns (address)",
  "function treasury() view returns (address)",
  "function slashRecipient() view returns (address)",
  "function batchVerifier() view returns (address)",
  "function startTime() view returns (uint256)",
  "function lastRewardTime() view returns (uint256)",
  "function mintedEmissions() view returns (uint256)",
  "function accountedEmissions() view returns (uint256)",
  "function accRewardPerShare() view returns (uint256)",
  "function getTotalStaked() view returns (uint256)",
  "function getProviderPoolStaked() view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function verifierUpdateDelay() view returns (uint256)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

function toPlain(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = toPlain(val);
    return out;
  }
  return v;
}

function walk(value, pathParts, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => walk(item, pathParts.concat(String(idx)), visitor));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => walk(v, pathParts.concat(k), visitor));
    return;
  }
  visitor(value, pathParts);
}

function normalizeAddress(address) {
  return String(address).toLowerCase();
}

function redactRpcUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").map((p) => {
      if (!p) return p;
      if (/^[A-Za-z0-9\-_]{12,}$/.test(p)) return "<redacted>";
      return p;
    });
    u.pathname = parts.join("/");
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "configured";
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`timeout:${label}`));
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

function safeDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function listDeploymentFiles() {
  return fs
    .readdirSync(DEPLOYMENTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.startsWith("contract-registry"))
    .filter((f) => !f.startsWith("forensic-contract-history"))
    .map((f) => path.join(DEPLOYMENTS_DIR, f))
    .sort();
}

function parseDeploymentTimeline() {
  const files = listDeploymentFiles();
  const events = [];

  for (const fullPath of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch {
      continue;
    }

    const addresses = [];
    walk(data, [], (value, keyPath) => {
      if (typeof value === "string" && ADDRESS_RE.test(value)) {
        addresses.push({
          key: keyPath.join("."),
          address: value,
          normalizedAddress: normalizeAddress(value)
        });
      }
    });

    const stat = fs.statSync(fullPath);
    const timestamp =
      safeDate(data.timestamp) ||
      safeDate(data.generatedAt) ||
      stat.mtime.toISOString();

    events.push({
      file: path.relative(ROOT, fullPath),
      network: data.network || "unknown",
      chainId: data.chainId || null,
      timestamp,
      deployer: ADDRESS_RE.test(data.deployer || "") ? data.deployer : null,
      addressCount: addresses.length,
      addresses
    });
  }

  events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return events;
}

async function tryCall(provider, address, iface, method, args = []) {
  try {
    const data = iface.encodeFunctionData(method, args);
    const raw = await withTimeout(provider.call({ to: address, data }), 3500, method);
    const decoded = iface.decodeFunctionResult(method, raw);
    const value = decoded.length === 1 ? decoded[0] : decoded;
    return { ok: true, value: toPlain(value) };
  } catch {
    return { ok: false };
  }
}

function parseAddressFromSlot(raw) {
  if (!raw || raw === "0x") return null;
  const cleaned = raw.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const addr = `0x${cleaned.slice(24)}`;
  if (/^0x0{40}$/.test(addr)) return null;
  return ethers.getAddress(addr);
}

async function getProxySlots(provider, address) {
  try {
    const [implRaw, adminRaw, beaconRaw] = await Promise.all([
      withTimeout(provider.getStorage(address, EIP1967_IMPLEMENTATION_SLOT), 5000, "implSlot"),
      withTimeout(provider.getStorage(address, EIP1967_ADMIN_SLOT), 5000, "adminSlot"),
      withTimeout(provider.getStorage(address, EIP1967_BEACON_SLOT), 5000, "beaconSlot")
    ]);
    return {
      implementation: parseAddressFromSlot(implRaw),
      admin: parseAddressFromSlot(adminRaw),
      beacon: parseAddressFromSlot(beaconRaw)
    };
  } catch {
    return {
      implementation: null,
      admin: null,
      beacon: null
    };
  }
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function probeTokenContracts(provider, codeAddresses) {
  const iface = new ethers.Interface(ERC20_ABI);
  const tokenCandidates = [];
  for (const addr of codeAddresses) {
    try {
      const [symbolRes, decimalsRes, totalSupplyRes] = await Promise.all([
        tryCall(provider, addr, iface, "symbol"),
        tryCall(provider, addr, iface, "decimals"),
        tryCall(provider, addr, iface, "totalSupply")
      ]);
      if (symbolRes.ok && decimalsRes.ok && totalSupplyRes.ok) {
        tokenCandidates.push({
          address: ethers.getAddress(addr),
          symbol: String(symbolRes.value),
          decimals: Number(decimalsRes.value)
        });
      }
    } catch {
      // not ERC20-like
    }
  }
  return tokenCandidates;
}

async function buildNetworkSnapshot(network, rows) {
  const rpc = RPC_BY_NETWORK[network];
  if (!rpc) {
    return {
      network,
      rpc: null,
      chainId: null,
      error: "No RPC configured",
      tokenContracts: [],
      addresses: []
    };
  }

  const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: false });
  let chainId = null;
  try {
    chainId = Number((await withTimeout(provider.getNetwork(), 5000, "getNetwork")).chainId);
  } catch {
    // continue best effort
  }

  const addresses = uniq(rows.map((r) => r.normalizedAddress));
  const codeMap = new Map();
  await Promise.all(
    addresses.map(async (a) => {
      try {
        const code = await withTimeout(provider.getCode(a), 5000, "getCode");
        codeMap.set(a, code !== "0x");
      } catch {
        codeMap.set(a, null);
      }
    })
  );

  const codeAddresses = addresses.filter((a) => codeMap.get(a) === true);
  const tokenContracts = await probeTokenContracts(provider, codeAddresses);
  const erc20Iface = new ethers.Interface(ERC20_ABI);

  const iface = new ethers.Interface(METHOD_FRAGMENTS);
  const methodNames = METHOD_FRAGMENTS.map((frag) => {
    const m = frag.match(/function\s+([A-Za-z0-9_]+)\(/);
    return m ? m[1] : null;
  }).filter(Boolean);
  const snapshots = [];

  for (const address of addresses) {
    const checksumAddress = ethers.getAddress(address);
    const hasCode = codeMap.get(address);

    let nativeBalanceWei = null;
    try {
      nativeBalanceWei = (await withTimeout(provider.getBalance(address), 5000, "getBalance")).toString();
    } catch {
      nativeBalanceWei = null;
    }

    const tokenBalances = (
      await Promise.all(
        tokenContracts.map(async (token) => {
          try {
            const balRes = await tryCall(provider, token.address, erc20Iface, "balanceOf", [address]);
            if (!balRes.ok) return null;
            return {
              token: token.address,
              symbol: token.symbol,
              decimals: token.decimals,
              balance: balRes.value.toString()
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const state = {};
    const proxy = { implementation: null, admin: null, beacon: null };

    if (hasCode === true) {
      const results = await Promise.all(
        methodNames.map(async (method) => ({ method, res: await tryCall(provider, address, iface, method) }))
      );
      for (const { method, res } of results) {
        if (res.ok) state[method] = res.value;
      }

      const slots = await getProxySlots(provider, address);
      proxy.implementation = slots.implementation;
      proxy.admin = slots.admin;
      proxy.beacon = slots.beacon;
    }

    snapshots.push({
      address: checksumAddress,
      normalizedAddress: address,
      hasCode,
      nativeBalanceWei,
      tokenBalances,
      state,
      proxy
    });
  }

  return {
    network,
    rpc: redactRpcUrl(rpc),
    chainId,
    tokenContracts: tokenContracts.map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals })),
    addresses: snapshots
  };
}

function mapAddressHistory(timeline) {
  const map = new Map();
  for (const ev of timeline) {
    for (const item of ev.addresses) {
      const key = `${ev.network}:${item.normalizedAddress}`;
      const cur = map.get(key) || {
        network: ev.network,
        address: item.address,
        normalizedAddress: item.normalizedAddress,
        firstSeenAt: ev.timestamp,
        lastSeenAt: ev.timestamp,
        seenInFiles: [],
        seenKeys: []
      };
      if (ev.timestamp < cur.firstSeenAt) cur.firstSeenAt = ev.timestamp;
      if (ev.timestamp > cur.lastSeenAt) cur.lastSeenAt = ev.timestamp;
      cur.seenInFiles.push(ev.file);
      cur.seenKeys.push(`${ev.file}:${item.key}`);
      map.set(key, cur);
    }
  }
  for (const v of map.values()) {
    v.seenInFiles = uniq(v.seenInFiles).sort();
    v.seenKeys = uniq(v.seenKeys).sort();
  }
  return map;
}

async function main() {
  if (!fs.existsSync(REGISTRY_ENRICHED)) {
    throw new Error(`Missing ${REGISTRY_ENRICHED}. Run enrich-contract-registry.js first.`);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_ENRICHED, "utf8"));
  const instances = Array.isArray(registry.instances) ? registry.instances : [];
  const timeline = parseDeploymentTimeline();
  const addressHistory = mapAddressHistory(timeline);

  const rowsByNetwork = new Map();
  for (const row of instances) {
    if (!rowsByNetwork.has(row.network)) rowsByNetwork.set(row.network, []);
    rowsByNetwork.get(row.network).push(row);
  }

  const networkSnapshots = {};
  for (const [network, rows] of rowsByNetwork.entries()) {
    if (network === "unknown") continue;
    networkSnapshots[network] = await buildNetworkSnapshot(network, rows);
  }

  const contracts = instances.map((row) => {
    const historyKey = `${row.network}:${row.normalizedAddress}`;
    const h = addressHistory.get(historyKey) || null;
    const net = networkSnapshots[row.network];
    const live = net
      ? net.addresses.find((a) => a.normalizedAddress === row.normalizedAddress) || null
      : null;
    return {
      network: row.network,
      address: row.address,
      normalizedAddress: row.normalizedAddress,
      trackedStatus: row.trackedStatus,
      inDeployments: row.inDeployments,
      inOpenZeppelin: row.inOpenZeppelin,
      files: row.files,
      keys: row.keys,
      creator: row.creator,
      creationTxHash: row.creationTxHash,
      firstSeenAt: h ? h.firstSeenAt : null,
      lastSeenAt: h ? h.lastSeenAt : null,
      seenInFiles: h ? h.seenInFiles : [],
      live: live
    };
  });

  contracts.sort((a, b) => {
    if (a.network !== b.network) return a.network.localeCompare(b.network);
    return a.normalizedAddress.localeCompare(b.normalizedAddress);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    timelineEvents: timeline.length,
    totalContractInstances: contracts.length,
    totalUniqueAddresses: uniq(contracts.map((c) => c.normalizedAddress)).length,
    networkCount: Object.keys(networkSnapshots).length,
    withLiveSnapshot: contracts.filter((c) => !!c.live).length,
    unknownNetworkInstances: contracts.filter((c) => c.network === "unknown").length
  };

  const out = {
    summary,
    timeline,
    networks: networkSnapshots,
    contracts
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n", "utf8");

  const lines = [];
  lines.push("# Forensic Contract History");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Timeline events: ${summary.timelineEvents}`);
  lines.push(`- Contract instances: ${summary.totalContractInstances}`);
  lines.push(`- Unique addresses: ${summary.totalUniqueAddresses}`);
  lines.push(`- Networks with live snapshot: ${summary.networkCount}`);
  lines.push(`- Unknown-network instances: ${summary.unknownNetworkInstances}`);
  lines.push("");
  lines.push("## Networks");
  lines.push("");
  for (const [network, snap] of Object.entries(networkSnapshots)) {
    lines.push(`### ${network}`);
    lines.push(`- RPC: ${snap.rpc}`);
    lines.push(`- ChainId: ${snap.chainId ?? "unknown"}`);
    lines.push(`- Addresses analyzed: ${snap.addresses.length}`);
    lines.push(`- Token contracts detected: ${snap.tokenContracts.length}`);
    if (snap.tokenContracts.length > 0) {
      lines.push(`- Tokens: ${snap.tokenContracts.map((t) => `${t.symbol}(${t.address})`).join(", ")}`);
    }
    lines.push("");
  }
  lines.push("## Timeline Files");
  lines.push("");
  for (const ev of timeline) {
    lines.push(`- ${ev.timestamp} | ${ev.network} | ${ev.file} | addresses=${ev.addressCount}`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `live.nativeBalanceWei` is current native balance, not historical-at-deploy balance.");
  lines.push("- `live.tokenBalances` contains current balance for detected token contracts on each network.");
  lines.push("- `live.state` contains best-effort reads for common protocol methods.");
  lines.push("- Unknown-network entries are preserved from artifacts but not live-queried.");
  lines.push("");

  fs.writeFileSync(OUT_MD, lines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
