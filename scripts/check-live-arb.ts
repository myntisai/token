import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");
const HUB_EID = 40245;

const DEFAULT_SPOKE_DISTRIBUTOR = "0xc2c0653213623cb274f6675cB9f12cC384E338a7"; // legacy from history

async function main() {
  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  console.log("=== ARBITRUM SEPOLIA LIVE CHECK ===");
  console.log("Signer:", signer.address);
  console.log("Spoke:", spokeAddr);

  console.log("\n-- Spoke Token --");
  console.log("Owner:", await spoke.owner());
  console.log("Paused:", await spoke.paused());
  console.log("HubChainEid:", (await spoke.hubChainEid()).toString());
  console.log("Peer(hub 40245):", await spoke.peers(HUB_EID));
  console.log("TotalSupply:", (await spoke.totalSupply()).toString());
  console.log("Balance(deployer):", (await spoke.balanceOf(signer.address)).toString());

  try {
    const minterRole = await spoke.MINTER_ROLE();
    const hasMinter = await spoke.hasRole(minterRole, signer.address);
    console.log("Deployer has MINTER_ROLE:", hasMinter);
  } catch {
    console.log("MINTER_ROLE check failed");
  }

  const spokeDistributor = process.env.SPOKE_DISTRIBUTOR || DEFAULT_SPOKE_DISTRIBUTOR;
  const distCode = await ethers.provider.getCode(spokeDistributor);
  if (distCode === "0x") {
    console.log("\n-- SpokeDistributor --");
    console.log("No contract at", spokeDistributor);
  } else {
    console.log("\n-- SpokeDistributor --");
    console.log("Address:", spokeDistributor);
    const distributor = await ethers.getContractAt("SpokeDistributor", spokeDistributor);
    const adminRole = await distributor.DEFAULT_ADMIN_ROLE();
    const providerRole = await distributor.PROVIDER_ROLE();
    console.log("Deployer is ADMIN:", await distributor.hasRole(adminRole, signer.address));
    console.log("Deployer is PROVIDER:", await distributor.hasRole(providerRole, signer.address));
    console.log("ProviderBalance(deployer):", (await distributor.getProviderBalance(signer.address)).toString());
    console.log("LockedBalance(deployer):", (await distributor.getLockedBalance(signer.address)).toString());
  }

  const quotaReceiver = process.env.QUOTA_RECEIVER;
  if (quotaReceiver) {
    const qCode = await ethers.provider.getCode(quotaReceiver);
    console.log("\n-- SpokeQuotaReceiver --");
    if (qCode === "0x") {
      console.log("No contract at", quotaReceiver);
    } else {
      const receiver = await ethers.getContractAt("SpokeQuotaReceiver", quotaReceiver);
      console.log("Address:", quotaReceiver);
      console.log("SpokeToken:", await receiver.spokeToken());
      console.log("RegistryPeer:", await receiver.registryPeer());
      console.log("HubChainId:", (await receiver.hubChainId()).toString());
      console.log("LastQuotaNonce:", (await receiver.lastQuotaNonce()).toString());
    }
  } else {
    console.log("\n-- SpokeQuotaReceiver --");
    console.log("QUOTA_RECEIVER env not set; skipping.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
