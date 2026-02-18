#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT_JSON = path.join(ROOT, "deployments", "contract-registry-latest.json");
const OUTPUT_JSON = path.join(ROOT, "deployments", "contract-registry-enriched-latest.json");
const OUTPUT_CSV = path.join(ROOT, "deployments", "contract-registry-enriched-latest.csv");

const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const ETHERSCAN_KEY = process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "";

const NETWORK_CONFIG = {
  "base-mainnet": {
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org"
  },
  "base-sepolia": {
    chainId: 84532,
    rpc:
      process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.RPC_URL ||
      process.env.NEXT_PUBLIC_HUB_RPC_URL ||
      "https://sepolia.base.org"
  },
  "ethereum-sepolia": {
    chainId: 11155111,
    rpc: process.env.ETH_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SPOKE_RPC_URL || "https://ethereum-sepolia.publicnode.com"
  },
  sepolia: {
    chainId: 11155111,
    rpc: process.env.ETH_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SPOKE_RPC_URL || "https://ethereum-sepolia.publicnode.com"
  },
  "arbitrum-sepolia": {
    chainId: 421614,
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc"
  },
  "optimism-sepolia": {
    chainId: 11155420,
    rpc: process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io"
  },
  "zksync-sepolia": {
    chainId: 300,
    rpc: process.env.ZKSYNC_SEPOLIA_RPC_URL || "https://sepolia.era.zksync.dev"
  }
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

async function getCreationData(chainId, addresses) {
  if (!ETHERSCAN_KEY || addresses.length === 0) return new Map();
  const out = new Map();

  for (const group of chunk(addresses, 5)) {
    const url =
      `${ETHERSCAN_API_BASE}?chainid=${chainId}` +
      `&module=contract&action=getcontractcreation` +
      `&contractaddresses=${group.join(",")}` +
      `&apikey=${ETHERSCAN_KEY}`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = await resp.json();
      if (String(data.status) !== "1" || !Array.isArray(data.result)) continue;
      for (const row of data.result) {
        if (!row || !row.contractAddress) continue;
        out.set(row.contractAddress.toLowerCase(), {
          creator: row.contractCreator || null,
          creationTxHash: row.txHash || null
        });
      }
    } catch {
      // Best-effort enrichment only
    }
  }
  return out;
}

async function hasCode(rpcUrl, address) {
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address, "latest"]
      })
    });
    const data = await resp.json();
    return typeof data.result === "string" && data.result !== "0x";
  } catch {
    return null;
  }
}

async function main() {
  const raw = fs.readFileSync(INPUT_JSON, "utf8");
  const parsed = JSON.parse(raw);
  const contracts = Array.isArray(parsed.contracts) ? parsed.contracts : [];

  const instances = [];
  for (const c of contracts) {
    const networks = Array.isArray(c.networks) && c.networks.length > 0 ? c.networks : ["unknown"];
    for (const network of networks) {
      instances.push({
        address: c.address,
        normalizedAddress: c.normalizedAddress || String(c.address).toLowerCase(),
        network,
        trackedStatus: c.trackedStatus || "other",
        inDeployments: !!c.inDeployments,
        inOpenZeppelin: !!c.inOpenZeppelin,
        files: c.files || [],
        keys: c.keys || [],
        creator: null,
        creationTxHash: null,
        hasCode: null
      });
    }
  }

  const byNetwork = new Map();
  for (const row of instances) {
    if (!byNetwork.has(row.network)) byNetwork.set(row.network, []);
    byNetwork.get(row.network).push(row);
  }

  for (const [network, rows] of byNetwork.entries()) {
    const cfg = NETWORK_CONFIG[network];
    if (!cfg) continue;

    const uniqueAddresses = [...new Set(rows.map((r) => r.normalizedAddress))];
    const creationMap = await getCreationData(cfg.chainId, uniqueAddresses);

    for (const r of rows) {
      const creation = creationMap.get(r.normalizedAddress);
      if (creation) {
        r.creator = creation.creator;
        r.creationTxHash = creation.creationTxHash;
      }
    }

    const codeMap = new Map();
    await Promise.all(
      uniqueAddresses.map(async (addr) => {
        const code = await hasCode(cfg.rpc, addr);
        codeMap.set(addr, code);
      })
    );
    for (const r of rows) {
      r.hasCode = codeMap.get(r.normalizedAddress) ?? null;
    }
  }

  instances.sort((a, b) => {
    if (a.network !== b.network) return a.network.localeCompare(b.network);
    return a.normalizedAddress.localeCompare(b.normalizedAddress);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceRegistry: path.relative(ROOT, INPUT_JSON),
    totalInstances: instances.length,
    totalUniqueAddresses: new Set(instances.map((r) => r.normalizedAddress)).size,
    withCreationData: instances.filter((r) => r.creationTxHash).length,
    withCode: instances.filter((r) => r.hasCode === true).length,
    withoutCode: instances.filter((r) => r.hasCode === false).length,
    rpcUnknown: instances.filter((r) => r.hasCode === null).length
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ summary, instances }, null, 2) + "\n", "utf8");

  const headers = [
    "network",
    "address",
    "normalizedAddress",
    "trackedStatus",
    "inDeployments",
    "inOpenZeppelin",
    "hasCode",
    "creator",
    "creationTxHash",
    "files",
    "keys"
  ];
  const lines = [headers.join(",")];
  for (const row of instances) {
    lines.push(
      [
        row.network,
        row.address,
        row.normalizedAddress,
        row.trackedStatus,
        row.inDeployments,
        row.inOpenZeppelin,
        row.hasCode,
        row.creator || "",
        row.creationTxHash || "",
        row.files.join("|"),
        row.keys.join("|")
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(OUTPUT_CSV, lines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
