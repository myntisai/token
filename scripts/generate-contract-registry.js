#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
const OZ_DIR = path.join(ROOT, ".openzeppelin");
const OUTPUT_JSON = path.join(DEPLOYMENTS_DIR, "contract-registry-latest.json");
const OUTPUT_CSV = path.join(DEPLOYMENTS_DIR, "contract-registry-latest.csv");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.startsWith("contract-registry"))
    .filter((f) => !f.startsWith("contract-registry-enriched"))
    .map((f) => path.join(dir, f))
    .sort();
}

function inferNetwork(fileName) {
  const f = fileName.toLowerCase();
  if (f.includes("base-mainnet")) return "base-mainnet";
  if (f.includes("base-sepolia") || f === "base-sepolia.json") return "base-sepolia";
  if (f.includes("ethereum-sepolia")) return "ethereum-sepolia";
  if (f.includes("arbitrum-sepolia")) return "arbitrum-sepolia";
  if (f.includes("optimism-sepolia")) return "optimism-sepolia";
  if (f.includes("zk")) return "zksync-sepolia";
  if (f === "sepolia.json") return "sepolia";
  return "unknown";
}

function sourceType(fullPath) {
  if (fullPath.includes(`${path.sep}deployments${path.sep}`)) return "deployment";
  if (fullPath.includes(`${path.sep}.openzeppelin${path.sep}`)) return "openzeppelin";
  return "other";
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

function normalizeAddress(addr) {
  return addr.toLowerCase();
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function generate() {
  const files = [...listJsonFiles(DEPLOYMENTS_DIR), ...listJsonFiles(OZ_DIR)];
  const registry = new Map();

  for (const filePath of files) {
    let data;
    try {
      data = loadJson(filePath);
    } catch (err) {
      console.warn(`Skipping unreadable JSON: ${filePath} (${err.message})`);
      continue;
    }

    const baseName = path.basename(filePath);
    const network = inferNetwork(baseName);
    const src = sourceType(filePath);

    walk(data, [], (val, keyPath) => {
      if (typeof val !== "string" || !ADDRESS_RE.test(val)) return;
      const normalized = normalizeAddress(val);
      const key = keyPath.join(".");
      const rec = registry.get(normalized) || {
        address: val,
        normalizedAddress: normalized,
        networks: new Set(),
        sourceTypes: new Set(),
        files: new Set(),
        keys: new Set(),
        seenCount: 0,
        inDeployments: false,
        inOpenZeppelin: false
      };

      rec.networks.add(network);
      rec.sourceTypes.add(src);
      rec.files.add(path.relative(ROOT, filePath));
      rec.keys.add(key);
      rec.seenCount += 1;
      if (src === "deployment") rec.inDeployments = true;
      if (src === "openzeppelin") rec.inOpenZeppelin = true;

      registry.set(normalized, rec);
    });
  }

  const records = [...registry.values()]
    .map((r) => ({
      address: r.address,
      normalizedAddress: r.normalizedAddress,
      networks: [...r.networks].sort(),
      sourceTypes: [...r.sourceTypes].sort(),
      files: [...r.files].sort(),
      keys: [...r.keys].sort(),
      seenCount: r.seenCount,
      inDeployments: r.inDeployments,
      inOpenZeppelin: r.inOpenZeppelin,
      trackedStatus: r.inDeployments && r.inOpenZeppelin
        ? "both"
        : r.inDeployments
          ? "deployments_only"
          : r.inOpenZeppelin
            ? "openzeppelin_only"
            : "other"
    }))
    .sort((a, b) => a.normalizedAddress.localeCompare(b.normalizedAddress));

  const summary = {
    generatedAt: new Date().toISOString(),
    totalUniqueAddresses: records.length,
    deploymentsOnly: records.filter((r) => r.trackedStatus === "deployments_only").length,
    openzeppelinOnly: records.filter((r) => r.trackedStatus === "openzeppelin_only").length,
    inBoth: records.filter((r) => r.trackedStatus === "both").length
  };

  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify({ summary, contracts: records }, null, 2) + "\n",
    "utf8"
  );

  const headers = [
    "address",
    "normalizedAddress",
    "trackedStatus",
    "inDeployments",
    "inOpenZeppelin",
    "networks",
    "sourceTypes",
    "seenCount",
    "files",
    "keys"
  ];
  const lines = [headers.join(",")];
  for (const r of records) {
    lines.push(
      [
        r.address,
        r.normalizedAddress,
        r.trackedStatus,
        r.inDeployments,
        r.inOpenZeppelin,
        r.networks.join("|"),
        r.sourceTypes.join("|"),
        r.seenCount,
        r.files.join("|"),
        r.keys.join("|")
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(OUTPUT_CSV, lines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(`Total unique addresses: ${summary.totalUniqueAddresses}`);
  console.log(`inBoth=${summary.inBoth}, deploymentsOnly=${summary.deploymentsOnly}, openzeppelinOnly=${summary.openzeppelinOnly}`);
}

generate();
