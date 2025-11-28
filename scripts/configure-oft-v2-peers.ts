import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Configure OFT V2 Peers
 * 
 * This script sets up the peer relationships between:
 * - Hub (Base Sepolia) ↔ All Spokes
 * - Spokes ↔ Hub (required for bidirectional transfers)
 * 
 * Run from hub chain: npx hardhat run scripts/configure-oft-v2-peers.ts --network base-sepolia
 * 
 * For spoke-to-spoke transfers, you'll need to configure peers between spokes as well.
 */

// LayerZero V2 Endpoint IDs
const CHAIN_EIDS: { [key: string]: number } = {
  "base-sepolia": 40245,
  "ethereum-sepolia": 40161,
  "arbitrum-sepolia": 40231,
  "optimism-sepolia": 40232,
  "polygon-amoy": 40267,
  "bsc-testnet": 40102,
  "linea-sepolia": 40287,
  "scroll-sepolia": 40214,
};

interface Deployment {
  network: string;
  chainId: number;
  layerZeroEid: number;
  contracts: {
    myntisOFT?: string;
    myntisOFTSpoke?: string;
  };
}

async function loadDeployment(networkName: string): Promise<Deployment | null> {
  const deploymentDir = path.join(__dirname, "../deployments");
  
  // Try hub deployment first
  let deploymentFile = path.join(deploymentDir, `${networkName}-oft-v2-hub.json`);
  if (fs.existsSync(deploymentFile)) {
    return JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  }
  
  // Try spoke deployment
  deploymentFile = path.join(deploymentDir, `${networkName}-oft-v2-spoke.json`);
  if (fs.existsSync(deploymentFile)) {
    return JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  }
  
  return null;
}

async function main() {
  console.log("🔗 Configuring OFT V2 Peers\n");
  
  const [deployer] = await ethers.getSigners();
  console.log(`📍 Deployer: ${deployer.address}\n`);
  
  const currentNetwork = process.env.HARDHAT_NETWORK || "base-sepolia";
  console.log(`🌐 Current Network: ${currentNetwork}\n`);
  
  // Load current network's deployment
  const currentDeployment = await loadDeployment(currentNetwork);
  if (!currentDeployment) {
    console.error(`❌ No deployment found for ${currentNetwork}`);
    console.error("   Run deploy-oft-v2-hub.ts or deploy-oft-v2-spoke.ts first");
    process.exit(1);
  }
  
  // Determine contract address and type
  const isHub = currentNetwork === "base-sepolia";
  const contractAddress = isHub 
    ? currentDeployment.contracts.myntisOFT 
    : currentDeployment.contracts.myntisOFTSpoke;
  
  if (!contractAddress) {
    console.error(`❌ Contract address not found in deployment`);
    process.exit(1);
  }
  
  console.log(`📋 Current Contract: ${contractAddress}`);
  console.log(`   Type: ${isHub ? "Hub (MyntisOFT)" : "Spoke (MyntisOFTSpoke)"}`);
  console.log(`   EID: ${currentDeployment.layerZeroEid}\n`);
  
  // Get contract instance
  const contractName = isHub ? "MyntisOFT" : "MyntisOFTSpoke";
  const contract = await ethers.getContractAt(contractName, contractAddress);
  
  // Find all other deployments
  const targetNetworks = Object.keys(CHAIN_EIDS).filter(n => n !== currentNetwork);
  console.log("🔍 Looking for peer deployments...\n");
  
  const peersToSet: { network: string; eid: number; address: string }[] = [];
  
  for (const network of targetNetworks) {
    const deployment = await loadDeployment(network);
    if (deployment) {
      const peerAddress = deployment.contracts.myntisOFT || deployment.contracts.myntisOFTSpoke;
      if (peerAddress) {
        peersToSet.push({
          network,
          eid: CHAIN_EIDS[network],
          address: peerAddress,
        });
        console.log(`✅ Found: ${network} (EID ${CHAIN_EIDS[network]}) -> ${peerAddress}`);
      }
    } else {
      console.log(`⏳ Not deployed: ${network}`);
    }
  }
  
  if (peersToSet.length === 0) {
    console.log("\n⚠️  No peer deployments found.");
    console.log("   Deploy spokes first, then run this script again.");
    process.exit(0);
  }
  
  console.log(`\n📝 Setting ${peersToSet.length} peer(s)...\n`);
  
  for (const peer of peersToSet) {
    try {
      // Convert address to bytes32 (left-padded)
      const peerBytes32 = ethers.zeroPadValue(peer.address, 32);
      
      console.log(`Setting peer for ${peer.network}...`);
      console.log(`   EID: ${peer.eid}`);
      console.log(`   Address: ${peer.address}`);
      console.log(`   Bytes32: ${peerBytes32}`);
      
      const tx = await contract.setPeer(peer.eid, peerBytes32);
      await tx.wait();
      
      console.log(`   ✅ Peer set successfully!\n`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  // Verify peers
  console.log("🔍 Verifying peer configuration...\n");
  
  for (const peer of peersToSet) {
    try {
      const storedPeer = await contract.peers(peer.eid);
      const expectedPeer = ethers.zeroPadValue(peer.address, 32);
      
      if (storedPeer === expectedPeer) {
        console.log(`✅ ${peer.network}: Verified`);
      } else {
        console.log(`❌ ${peer.network}: Mismatch`);
        console.log(`   Expected: ${expectedPeer}`);
        console.log(`   Got: ${storedPeer}`);
      }
    } catch (error: any) {
      console.log(`⚠️  ${peer.network}: Could not verify - ${error.message}`);
    }
  }
  
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                  PEER CONFIGURATION COMPLETE               ");
  console.log("═══════════════════════════════════════════════════════════");
  
  if (isHub) {
    console.log("\n⚠️  IMPORTANT: You also need to configure peers on each SPOKE:");
    for (const peer of peersToSet) {
      console.log(`   npx hardhat run scripts/configure-oft-v2-peers.ts --network ${peer.network}`);
    }
  } else {
    console.log("\n✅ Spoke configured to communicate with hub and other deployed chains.");
  }
  
  console.log("\n📋 Test Cross-Chain Transfer:");
  console.log("   npx hardhat run scripts/test-oft-v2-transfer.ts --network base-sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Configuration failed:", error);
    process.exit(1);
  });

