import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { assertEndpointMatchesNetwork, getLzEndpointV2 } from "./layerzero";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Deploy MyntisOFT (Hub) on Base Sepolia
 * 
 * This is the canonical token with:
 * - Full minting capabilities
 * - 1B max supply (800M emissions + 200M immediate)
 * - LayerZero V2 OFT standard
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
};

interface DeploymentResult {
  network: string;
  chainId: number;
  layerZeroEid: number;
  contracts: {
    myntisOFT: string;
  };
  deployer: string;
  timestamp: string;
}

async function main() {
  console.log("🚀 Deploying MyntisOFT Hub (LayerZero V2 OFT Standard)\n");
  
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
  const networkName = process.env.HARDHAT_NETWORK || "base-sepolia";
  const chainId = Number(network.chainId);
  const layerZeroEid = CHAIN_EIDS[networkName] || 40245;
  
  console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);
  console.log(`🔗 LayerZero EID: ${layerZeroEid}`);
  console.log(`📡 LayerZero Endpoint: ${LZ_ENDPOINT_V2}\n`);
  assertEndpointMatchesNetwork(networkName, LZ_ENDPOINT_V2);

  // Deploy MyntisOFT
  console.log("📝 Deploying MyntisOFT...");
  
  const MyntisOFT = await ethers.getContractFactory("MyntisOFT");
  const myntisOFT = await MyntisOFT.deploy(
    LZ_ENDPOINT_V2,
    deployer.address  // delegate (admin)
  );
  
  await myntisOFT.waitForDeployment();
  const myntisAddress = await myntisOFT.getAddress();
  console.log(`✅ MyntisOFT deployed: ${myntisAddress}\n`);

  // Get contract info
  console.log("📊 Contract Info:");
  const info = await myntisOFT.getContractInfo();
  console.log(`   Name: ${info.name_}`);
  console.log(`   Symbol: ${info.symbol_}`);
  console.log(`   Total Supply: ${ethers.formatEther(info.totalSupply_)} MYNT`);
  console.log(`   Max Supply: ${ethers.formatEther(info.maxSupply_)} MYNT`);
  console.log(`   Emissions Minted: ${ethers.formatEther(info.emissionsMinted_)} MYNT`);
  console.log(`   Immediate Minted: ${ethers.formatEther(info.immediateMinted_)} MYNT`);
  console.log(`   Paused: ${info.paused_}\n`);

  // Test minting (from immediate allocation)
  console.log("🧪 Testing immediate mint...");
  const testMintAmount = ethers.parseEther("1000000"); // 1M tokens for testing
  
  try {
    const mintTx = await myntisOFT.mintImmediate(deployer.address, testMintAmount);
    await mintTx.wait();
    console.log(`✅ Minted ${ethers.formatEther(testMintAmount)} MYNT to deployer\n`);
    
    const newBalance = await myntisOFT.balanceOf(deployer.address);
    console.log(`   Deployer balance: ${ethers.formatEther(newBalance)} MYNT\n`);
  } catch (error: any) {
    console.log(`⚠️  Mint test failed: ${error.message}\n`);
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
    contracts: {
      myntisOFT: myntisAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  
  const deploymentFile = path.join(deploymentDir, `${networkName}-oft-v2-hub.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentResult, null, 2));
  console.log(`💾 Deployment saved to: ${deploymentFile}\n`);

  // Summary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT SUMMARY                      ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Network:          ${networkName}`);
  console.log(`Chain ID:         ${chainId}`);
  console.log(`LayerZero EID:    ${layerZeroEid}`);
  console.log(`MyntisOFT:        ${myntisAddress}`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("📋 Next Steps:");
  console.log("1. Deploy spokes on other chains:");
  console.log("   npx hardhat run scripts/deploy-oft-v2-spoke.ts --network ethereum-sepolia");
  console.log("   npx hardhat run scripts/deploy-oft-v2-spoke.ts --network arbitrum-sepolia");
  console.log("   npx hardhat run scripts/deploy-oft-v2-spoke.ts --network optimism-sepolia");
  console.log("\n2. Configure peers after all deployments:");
  console.log("   npx hardhat run scripts/configure-oft-v2-peers.ts --network base-sepolia");
  console.log("\n3. Verify contract:");
  console.log(`   npx hardhat verify --network ${networkName} ${myntisAddress} ${LZ_ENDPOINT_V2} ${deployer.address}`);
  
  return deploymentResult;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
