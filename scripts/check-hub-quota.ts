import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const gsrAddr = (deployment.globalSupplyRegistry || deployment?.contracts?.globalSupplyRegistry) as string;
  if (!gsrAddr || !ethers.isAddress(gsrAddr)) {
    throw new Error(`Missing/invalid globalSupplyRegistry in ${BASE_DEPLOYMENT}`);
  }

  const eid = process.env.SPOKE_EID ? Number(process.env.SPOKE_EID) : 40231; // arb-sepolia
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("Invalid SPOKE_EID");

  const [signer] = await ethers.getSigners();
  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", gsrAddr);

  console.log("=== HUB QUOTA STATE ===");
  console.log("Hub GSR:", gsrAddr);
  console.log("Signer:", signer.address);
  console.log("Spoke EID:", eid);

  const peer = await gsr.peers(eid);
  const receiver = await gsr.quotaReceivers(eid);
  const quota = await gsr.chainQuota(eid);
  const reserved = await gsr.totalReservedQuota();
  const total = await gsr.totalCrossChainSupply();
  const cap = await gsr.globalCap();

  console.log("peer:", peer);
  console.log("quotaReceiver:", receiver);
  console.log("chainQuota:", ethers.formatEther(quota), "MYNT");
  console.log("totalReservedQuota:", ethers.formatEther(reserved), "MYNT");
  console.log("totalCrossChainSupply:", ethers.formatEther(total), "MYNT");
  console.log("globalCap:", ethers.formatEther(cap), "MYNT");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
