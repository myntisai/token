import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const EID_ARB = 40231;
const EID_ETH = 40161;

function toAddress(bytes32Hex: string): string {
  if (!bytes32Hex || bytes32Hex === ethers.ZeroHash) return ethers.ZeroAddress;
  return ethers.getAddress("0x" + bytes32Hex.slice(26));
}

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = deployment.myntis as string;
  const registryAddr = deployment.globalSupplyRegistry as string;

  const [signer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", hubAddr);
  const registry = await ethers.getContractAt("GlobalSupplyRegistry", registryAddr);

  console.log("=== BASE SEPOLIA LIVE CHECK ===");
  console.log("Signer:", signer.address);
  console.log("Hub:", hubAddr);
  console.log("Registry:", registryAddr);

  console.log("\n-- Hub --");
  console.log("Owner:", await hub.owner());
  console.log("Paused:", await hub.paused());
  console.log("BurnFee:", (await hub.burnFee()).toString());
  console.log("FeeRecipient:", await hub.feeRecipient());
  console.log("GlobalSupplyRegistry:", await hub.globalSupplyRegistry());
  console.log("Peer(ARB 40231):", await hub.peers(EID_ARB));
  console.log("Peer(ETH 40161):", await hub.peers(EID_ETH));
  try {
    const enforcedArb = await hub.enforcedOptions(EID_ARB, 1);
    const enforcedEth = await hub.enforcedOptions(EID_ETH, 1);
    console.log("EnforcedOptions(ARB,msgType=1):", enforcedArb);
    console.log("EnforcedOptions(ETH,msgType=1):", enforcedEth);
  } catch (err) {
    console.log("EnforcedOptions: not available or call failed");
  }

  console.log("\n-- Registry --");
  console.log("GlobalCap:", (await registry.globalCap()).toString());
  console.log("TotalCrossChainSupply:", (await registry.totalCrossChainSupply()).toString());
  console.log("TotalReservedQuota:", (await registry.totalReservedQuota()).toString());
  console.log("ChainSupply(base):", (await registry.chainSupply(ethers.toBigInt(84532))).toString());
  console.log("ChainSupply(arb eid):", (await registry.chainSupply(EID_ARB)).toString());
  console.log("ChainQuota(arb eid):", (await registry.chainQuota(EID_ARB)).toString());
  console.log("ChainNonce(arb eid):", (await registry.chainNonce(EID_ARB)).toString());
  const peerArb = await registry.peers(EID_ARB);
  const quotaReceiverArb = await registry.quotaReceivers(EID_ARB);
  console.log("Peer(arb eid):", peerArb, "->", toAddress(peerArb));
  console.log("QuotaReceiver(arb eid):", quotaReceiverArb, "->", toAddress(quotaReceiverArb));
  console.log("QuotaUpdateOptions length:", (await registry.quotaUpdateOptions()).length);
  console.log("QuotaUpdateRefundAddress:", await registry.quotaUpdateRefundAddress());
  try {
    const tokenRole = await registry.TOKEN_ROLE();
    const hasTokenRole = await registry.hasRole(tokenRole, hubAddr);
    console.log("Registry TOKEN_ROLE set for hub:", hasTokenRole);
  } catch {
    console.log("Registry TOKEN_ROLE check failed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
