import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { assertEndpointMatchesNetwork, getLzEndpointV2 } from "./layerzero";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Deploy MyntisOFTSpoke on non-hub chains
 * 
 * These are simple OFT tokens that:
 * - Can send/receive via LayerZero V2 OFT standard
 * - No external minting (only cross-chain)
 * - Compatible with MyntisOFT Hub on Base
 */

// LayerZero V2 Endpoint (selected by network; can be overridden with LZ_ENDPOINT env var)
const LZ_ENDPOINT_V2 = getLzEndpointV2(network.name);

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

// Hub chain EID (Base Sepolia)
const HUB_CHAIN_EID = 40245;

interface DeploymentResult {
  network: string;
  chainId: number;
  layerZeroEid: number;
  hubChainEid: number;
  contracts: {
    myntisOFTSpoke: string;
  };
  deployer: string;
  timestamp: string;
}

async function main() {
  console.log("🚀 Deploying MyntisOFTSpoke (LayerZero V2 OFT Standard)\n");
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`📍 Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);
  
  if (balance < ethers.parseEther("0.01")) {
    console.error("❌ Insufficient balance. Need at least 0.01 ETH");
    process.exit(1);
  }

  // Get network info
  const network = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK || "ethereum-sepolia";
  const chainId = Number(network.chainId);
  const layerZeroEid = CHAIN_EIDS[networkName];
  
  if (!layerZeroEid) {
    console.error(`❌ Unknown network: ${networkName}`);
    console.error("   Supported networks:", Object.keys(CHAIN_EIDS).join(", "));
    process.exit(1);
  }
  
  if (networkName === "base-sepolia") {
    console.error("❌ This script is for spoke chains only.");
    console.error("   Use deploy-oft-v2-hub.ts for Base Sepolia.");
    process.exit(1);
  }
  
  console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);
  console.log(`🔗 LayerZero EID: ${layerZeroEid}`);
  console.log(`🏠 Hub Chain EID: ${HUB_CHAIN_EID} (Base Sepolia)`);
  console.log(`📡 LayerZero Endpoint: ${LZ_ENDPOINT_V2}\n`);
  assertEndpointMatchesNetwork(networkName, LZ_ENDPOINT_V2);

  // Deploy MyntisOFTSpoke
  console.log("📝 Deploying MyntisOFTSpoke...");
  
  const MyntisOFTSpoke = await ethers.getContractFactory("MyntisOFTSpoke");
  const myntisOFTSpoke = await MyntisOFTSpoke.deploy(
    LZ_ENDPOINT_V2,
    deployer.address,  // delegate (admin)
    HUB_CHAIN_EID,     // hub chain EID
    layerZeroEid       // local chain EID
  );
  
  await myntisOFTSpoke.waitForDeployment();
  const spokeAddress = await myntisOFTSpoke.getAddress();
  console.log(`✅ MyntisOFTSpoke deployed: ${spokeAddress}\n`);

  // Get contract info
  console.log("📊 Contract Info:");
  try {
    const info = await myntisOFTSpoke.getContractInfo();
    console.log(`   Name: ${info.name_}`);
    console.log(`   Symbol: ${info.symbol_}`);
    console.log(`   Total Supply: ${ethers.formatEther(info.totalSupply_)} MYNT`);
    console.log(`   Hub Chain EID: ${info.hubEid_}`);
    console.log(`   Local Chain EID: ${info.localEid_}`);
    console.log(`   Paused: ${info.paused_}\n`);
  } catch (error: any) {
    console.log("   ⚠️  getContractInfo failed:", error?.shortMessage || error?.message || error);
  }

  // Save deployment info
  const deploymentDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  
  const deploymentResult: DeploymentResult = {
    network: networkName,
    chainId,
    layerZeroEid,
    hubChainEid: HUB_CHAIN_EID,
    contracts: {
      myntisOFTSpoke: spokeAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  
  const deploymentFile = path.join(deploymentDir, `${networkName}-oft-v2-spoke.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentResult, null, 2));
  console.log(`💾 Deployment saved to: ${deploymentFile}\n`);

  // Summary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT SUMMARY                      ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Network:           ${networkName}`);
  console.log(`Chain ID:          ${chainId}`);
  console.log(`LayerZero EID:     ${layerZeroEid}`);
  console.log(`Hub Chain EID:     ${HUB_CHAIN_EID}`);
  console.log(`MyntisOFTSpoke:    ${spokeAddress}`);
  console.log(`Deployer:          ${deployer.address}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("📋 Next Steps:");
  console.log("1. Deploy on more spoke chains if needed:");
  console.log("   npx hardhat run scripts/deploy-oft-v2-spoke.ts --network arbitrum-sepolia");
  console.log("   npx hardhat run scripts/deploy-oft-v2-spoke.ts --network optimism-sepolia");
  console.log("\n2. After all deployments, configure peers from hub:");
  console.log("   npx hardhat run scripts/configure-oft-v2-peers.ts --network base-sepolia");
  console.log("\n3. Verify contract:");
  console.log(`   npx hardhat verify --network ${networkName} ${spokeAddress} ${LZ_ENDPOINT_V2} ${deployer.address} ${HUB_CHAIN_EID} ${layerZeroEid}`);
  
  return deploymentResult;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
