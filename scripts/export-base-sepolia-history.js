#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FORENSIC_PATH = path.join(ROOT, "deployments", "forensic-contract-history-latest.json");
const OUTPUT_JSON = path.join(ROOT, "deployments", "base-sepolia-deployment-history.json");
const OUTPUT_MD = path.join(ROOT, "deployments", "BASE_SEPOLIA_DEPLOYMENT_HISTORY.md");

function pickAddress(addresses, preferredKeys) {
  for (const key of preferredKeys) {
    const match = addresses.find((a) => a.key === key && a.address);
    if (match) return match.address;
  }
  return "";
}

function shorten(addr) {
  if (!addr) return "-";
  return `\`${addr}\``;
}

function main() {
  if (!fs.existsSync(FORENSIC_PATH)) {
    throw new Error(`Missing forensic file: ${FORENSIC_PATH}`);
  }

  const forensic = JSON.parse(fs.readFileSync(FORENSIC_PATH, "utf8"));
  const timeline = Array.isArray(forensic.timeline) ? forensic.timeline : [];

  const baseEvents = timeline
    .filter((evt) => evt.network === "base-sepolia")
    .sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.file || "").localeCompare(String(b.file || ""));
    })
    .map((evt) => {
      const addresses = Array.isArray(evt.addresses) ? evt.addresses : [];
      return {
        timestamp: evt.timestamp || "",
        file: evt.file || "",
        addressCount: Number(evt.addressCount || addresses.length || 0),
        myntis: pickAddress(addresses, [
          "myntis",
          "deployment.myntis",
          "contracts.myntisOFT",
          "contracts.myntis"
        ]),
        emissions: pickAddress(addresses, [
          "emissionsContract",
          "deployment.emissionsContract"
        ]),
        staking: pickAddress(addresses, [
          "dualPoolStaking",
          "deployment.dualPoolStaking"
        ]),
        distributor: pickAddress(addresses, [
          "zkMerkleDistributor",
          "deployment.zkMerkleDistributor"
        ]),
        vault: pickAddress(addresses, [
          "liquidStakingVault",
          "deployment.liquidStakingVault"
        ]),
        registry: pickAddress(addresses, [
          "globalSupplyRegistry",
          "deployment.globalSupplyRegistry"
        ])
      };
    });

  const outJson = {
    generatedAt: new Date().toISOString(),
    source: "deployments/forensic-contract-history-latest.json",
    network: "base-sepolia",
    events: baseEvents
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(outJson, null, 2) + "\n", "utf8");

  const lines = [];
  lines.push("# Base Sepolia Deployment History");
  lines.push("");
  lines.push(`Generated: ${outJson.generatedAt}`);
  lines.push("");
  lines.push("Source: `deployments/forensic-contract-history-latest.json`");
  lines.push("");
  lines.push(
    "| UTC Timestamp | Source File | Addresses | MYNT | Emissions | Staking | ZK Distributor | Vault | Registry |"
  );
  lines.push("|---|---|---:|---|---|---|---|---|---|");
  for (const evt of baseEvents) {
    lines.push(
      `| ${evt.timestamp || "-"} | \`${evt.file || "-"}\` | ${evt.addressCount} | ${shorten(evt.myntis)} | ${shorten(evt.emissions)} | ${shorten(evt.staking)} | ${shorten(evt.distributor)} | ${shorten(evt.vault)} | ${shorten(evt.registry)} |`
    );
  }
  lines.push("");
  lines.push("Notes:");
  lines.push("- This is an artifact timeline, not an on-chain event index.");
  lines.push("- `*-latest.json` files may duplicate the most recent state for the same deployment wave.");

  fs.writeFileSync(OUTPUT_MD, lines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_MD}`);
  console.log(`Events: ${baseEvents.length}`);
}

main();
