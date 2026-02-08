import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const ARB_SPOKE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");
const HUB_EID = 40245;

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const arb = JSON.parse(fs.readFileSync(ARB_SPOKE_DEPLOYMENT, "utf8"));

  const hubAddr = base.myntis as string;
  const spokeAddr = arb.contracts?.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  const bal = await spoke.balanceOf(signer.address);
  const supply = await spoke.totalSupply();
  const peer = await spoke.peers(HUB_EID);

  console.log("Deployer:", signer.address);
  console.log("Spoke:", spokeAddr);
  console.log("Balance:", ethers.formatEther(bal), "MYNT");
  console.log("Supply:", ethers.formatEther(supply), "MYNT");
  console.log("Peer(HUB_EID):", peer);
  console.log("Expected:", ethers.zeroPadValue(hubAddr, 32));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
