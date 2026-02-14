#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
const FORENSIC_PATH = path.join(DEPLOYMENTS_DIR, "forensic-contract-history-latest.json");
const MAINNET_LATEST_PATH = path.join(DEPLOYMENTS_DIR, "deployment-base-mainnet-latest.json");

const ACTIVE_OUT = path.join(DEPLOYMENTS_DIR, "active-contracts-mainnet.json");
const LEGACY_OUT = path.join(DEPLOYMENTS_DIR, "legacy-contracts.json");
const RULES_OUT = path.join(DEPLOYMENTS_DIR, "address-selection-rules.md");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalize(addr) {
  return String(addr).toLowerCase();
}

function hasContractCode(contractRow) {
  return !!(contractRow && contractRow.live && contractRow.live.hasCode === true);
}

function main() {
  if (!fs.existsSync(FORENSIC_PATH)) {
    throw new Error(`Missing file: ${FORENSIC_PATH}`);
  }
  if (!fs.existsSync(MAINNET_LATEST_PATH)) {
    throw new Error(`Missing file: ${MAINNET_LATEST_PATH}`);
  }

  const forensic = readJson(FORENSIC_PATH);
  const mainnetLatest = readJson(MAINNET_LATEST_PATH);
  const contracts = Array.isArray(forensic.contracts) ? forensic.contracts : [];

  const activeLabels = [
    "myntis",
    "myntisImplementation",
    "emissionsContract",
    "dualPoolStaking",
    "dualPoolStakingImplementation",
    "groth16Verifier",
    "zkMerkleDistributor",
    "zkMerkleDistributorImplementation",
    "globalSupplyRegistry",
    "liquidStakingVault",
    "liquidStakingVaultImplementation"
  ];

  const activeSet = new Set();
  const activeContracts = [];

  for (const label of activeLabels) {
    const address = mainnetLatest[label];
    if (!ADDRESS_RE.test(String(address || ""))) continue;
    const normalizedAddress = normalize(address);
    activeSet.add(normalizedAddress);
    const row = contracts.find(
      (c) => c.network === "base-mainnet" && normalize(c.address) === normalizedAddress
    );

    activeContracts.push({
      key: label,
      address,
      normalizedAddress,
      foundInForensic: !!row,
      hasCode: hasContractCode(row),
      firstSeenAt: row ? row.firstSeenAt : null,
      creationTxHash: row ? row.creationTxHash : null,
      trackedStatus: row ? row.trackedStatus : null,
      seenInFiles: row ? row.seenInFiles : [],
      liveStateKeys: row && row.live && row.live.state ? Object.keys(row.live.state).sort() : []
    });
  }

  const possibleAuxKeys = ["deployer"];
  const roles = {};
  for (const k of possibleAuxKeys) {
    if (ADDRESS_RE.test(String(mainnetLatest[k] || ""))) roles[k] = mainnetLatest[k];
  }

  const legacy = contracts
    .filter((c) => !activeSet.has(normalize(c.address)))
    .map((c) => ({
      network: c.network,
      address: c.address,
      normalizedAddress: c.normalizedAddress,
      trackedStatus: c.trackedStatus,
      hasCode: c.live ? c.live.hasCode : null,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      files: c.files,
      keys: c.keys
    }))
    .sort((a, b) => {
      if (a.network !== b.network) return a.network.localeCompare(b.network);
      return a.normalizedAddress.localeCompare(b.normalizedAddress);
    });

  const legacySummary = legacy.reduce((acc, item) => {
    acc.total += 1;
    if (!acc.byNetwork[item.network]) acc.byNetwork[item.network] = 0;
    acc.byNetwork[item.network] += 1;
    if (item.hasCode === true) acc.liveContracts += 1;
    if (item.hasCode === false) acc.eoaOrTombstone += 1;
    if (item.hasCode === null) acc.unknownSnapshot += 1;
    return acc;
  }, { total: 0, liveContracts: 0, eoaOrTombstone: 0, unknownSnapshot: 0, byNetwork: {} });

  const active = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      forensic: path.relative(ROOT, FORENSIC_PATH),
      mainnetLatest: path.relative(ROOT, MAINNET_LATEST_PATH)
    },
    chain: {
      network: "base-mainnet",
      chainId: mainnetLatest.chainId
    },
    roles,
    deploymentTimestamp: mainnetLatest.timestamp || null,
    contracts: activeContracts
  };

  fs.writeFileSync(ACTIVE_OUT, JSON.stringify(active, null, 2) + "\n", "utf8");

  fs.writeFileSync(
    LEGACY_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        excludes: {
          network: "base-mainnet",
          activeAddresses: [...activeSet].sort()
        },
        summary: legacySummary,
        contracts: legacy
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const md = [];
  md.push("# Address Selection Rules");
  md.push("");
  md.push("## Canonical Sources");
  md.push("");
  md.push("- Active mainnet source: `deployments/active-contracts-mainnet.json`");
  md.push("- Legacy source: `deployments/legacy-contracts.json`");
  md.push("- Historical evidence: `deployments/forensic-contract-history-latest.json`");
  md.push("");
  md.push("## Rules");
  md.push("");
  md.push("1. On Base mainnet (`chainId=8453`), only use addresses listed in `active-contracts-mainnet.json`.");
  md.push("2. Never auto-select an address from `legacy-contracts.json` for production transactions.");
  md.push("3. If an active address changes, update `deployment-base-mainnet-latest.json` first, then regenerate these files.");
  md.push("4. Any address with `hasCode=false` must be treated as non-contract and blocked in backend/frontend config.");
  md.push("5. Keep testnet and unknown-network addresses isolated from production config.");
  md.push("");
  md.push("## Regeneration");
  md.push("");
  md.push("```bash");
  md.push("cd token");
  md.push("node scripts/generate-active-contract-sets.js");
  md.push("```");
  md.push("");
  md.push("## Notes");
  md.push("");
  md.push("- These files represent current policy, not immutable chain history.");
  md.push("- Chain history remains in the forensic file.");
  md.push("");

  fs.writeFileSync(RULES_OUT, md.join("\n"), "utf8");

  console.log(`Wrote ${ACTIVE_OUT}`);
  console.log(`Wrote ${LEGACY_OUT}`);
  console.log(`Wrote ${RULES_OUT}`);
  console.log(
    JSON.stringify(
      {
        activeContracts: active.contracts.length,
        legacyContracts: legacySummary.total,
        legacyByNetwork: legacySummary.byNetwork
      },
      null,
      2
    )
  );
}

main();
