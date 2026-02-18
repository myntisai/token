import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const ARB_SPOKE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

const ARB_EID = 40231;

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const arb = JSON.parse(fs.readFileSync(ARB_SPOKE_DEPLOYMENT, "utf8"));

  const hubAddr = base.myntis as string;
  const spokeAddr = arb.contracts?.myntisOFTSpoke as string;

  if (!hubAddr || !spokeAddr) {
    throw new Error("Missing hub or spoke address in deployment files");
  }

  const [signer] = await ethers.getSigners();
  const hub = await ethers.getContractAt("Myntis", hubAddr);

  console.log("Setting hub peer for Arbitrum Sepolia...");
  console.log("Signer:", signer.address);
  console.log("Hub:", hubAddr);
  console.log("Spoke:", spokeAddr);
  console.log("EID:", ARB_EID);

  const peerBytes32 = ethers.zeroPadValue(spokeAddr, 32);
  const tx = await hub.setPeer(ARB_EID, peerBytes32);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const stored = await hub.peers(ARB_EID);
  console.log("Stored peer:", stored);
  console.log("Expected:", peerBytes32);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
