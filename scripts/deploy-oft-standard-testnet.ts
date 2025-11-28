// TODO: Update this script to use Myntis.sol (upgradeable) instead of deleted MyntisOFT.sol
// Myntis uses UUPS proxy pattern - see deploy-oft-hub.ts for reference
import { ethers } from "hardhat";
import { Contract } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface OFTDeploymentResult {
  myntisOFT: Contract;
  network: string;
  chainId: number;
  deployer: string;
  timestamp: string;
}

// LayerZero V2 Endpoint IDs (EIDs) - Load from environment variables
const LAYERZERO_EIDS: { [key: string]: number } = {
  "base-sepolia": process.env.LZ_EID_BASE_SEPOLIA ? parseInt(process.env.LZ_EID_BASE_SEPOLIA) : 40245,
  "ethereum-sepolia": process.env.LZ_EID_ETHEREUM_SEPOLIA ? parseInt(process.env.LZ_EID_ETHEREUM_SEPOLIA) : 40161,
  "arbitrum-sepolia": process.env.LZ_EID_ARBITRUM_SEPOLIA ? parseInt(process.env.LZ_EID_ARBITRUM_SEPOLIA) : 40120,
  "optimism-sepolia": process.env.LZ_EID_OPTIMISM_SEPOLIA ? parseInt(process.env.LZ_EID_OPTIMISM_SEPOLIA) : 40232,
  "polygon-mumbai": process.env.LZ_EID_POLYGON_MUMBAI ? parseInt(process.env.LZ_EID_POLYGON_MUMBAI) : 40109,
};

// LayerZero V2 Endpoint addresses - Load from environment variables
const LAYERZERO_ENDPOINT = process.env.LZ_ENDPOINT_HUB || process.env.LZ_ENDPOINT_SPOKE || "0x6EDCE65403992e310A62460808c4b910D972f10f";

async function deployOFTStandard(networkName: string): Promise<OFTDeploymentResult> {
  console.log(`🚀 Deploying MyntisOFT (Standard OFT) on ${networkName}...\n`);

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available. Make sure PRIVATE_KEY is set in .env");
  }
  const deployer = signers[0];
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`LayerZero Endpoint: ${LAYERZERO_ENDPOINT}`);
  console.log(`LayerZero EID: ${LAYERZERO_EIDS[networkName] || "NOT CONFIGURED"}\n`);

  if (!LAYERZERO_EIDS[networkName]) {
    throw new Error(`LayerZero EID not configured for ${networkName}`);
  }

  // Deploy MyntisOFT (Standard OFT)
  console.log("📝 Deploying MyntisOFT (Standard OFT)...");
  const MyntisOFTFactory = await ethers.getContractFactory("contracts/MyntisOFT.sol:MyntisOFT");
  
  const myntisOFT = await MyntisOFTFactory.deploy(
    "Myntis",
    "MYNT",
    LAYERZERO_ENDPOINT,
    deployer.address // owner/admin
  );
  
  await myntisOFT.waitForDeployment();
  const myntisOFTAddress = await myntisOFT.getAddress();
  console.log(`✅ MyntisOFT deployed to: ${myntisOFTAddress}`);

  // Grant roles
  console.log("\n🔐 Configuring roles...");
  const MINTER_ROLE = await myntisOFT.MINTER_ROLE();
  const BURNER_ROLE = await myntisOFT.BURNER_ROLE();
  const ADMIN_ROLE = await myntisOFT.ADMIN_ROLE();

  // Deployer already has ADMIN_ROLE from constructor
  // Grant MINTER_ROLE and BURNER_ROLE to deployer for testing
  await myntisOFT.grantRole(MINTER_ROLE, deployer.address);
  await myntisOFT.grantRole(BURNER_ROLE, deployer.address);
  console.log(`✅ Roles granted to ${deployer.address}`);

  // Configure initial settings
  console.log("\n⚙️ Configuring initial settings...");
  
  // Set cap (1 billion tokens)
  const cap = ethers.parseEther("1000000000");
  await myntisOFT.updateCap(cap);
  console.log(`✅ Cap set to: ${ethers.formatEther(cap)} MYNT`);

  // Note: Max supply is set in constructor, no need to update separately
  const maxSupply = await myntisOFT.maxSupply();
  console.log(`✅ Max supply: ${ethers.formatEther(maxSupply)} MYNT`);

  // Set fee recipient
  await myntisOFT.updateFeeRecipient(deployer.address);
  console.log(`✅ Fee recipient set to: ${deployer.address}`);

  // Mint some initial tokens for testing
  console.log("\n💰 Minting initial test tokens...");
  const initialMint = ethers.parseEther("1000000"); // 1M tokens
  await myntisOFT.mint(deployer.address, initialMint);
  console.log(`✅ Minted ${ethers.formatEther(initialMint)} MYNT to ${deployer.address}`);

  // Display deployment summary
  console.log("\n📊 Deployment Summary:");
  console.log("====================");
  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`LayerZero EID: ${LAYERZERO_EIDS[networkName]}`);
  console.log(`MyntisOFT: ${myntisOFTAddress}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Cap: ${ethers.formatEther(cap)} MYNT`);
  console.log(`Initial Supply: ${ethers.formatEther(initialMint)} MYNT`);

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    chainId: chainId,
    layerZeroEid: LAYERZERO_EIDS[networkName],
    layerZeroEndpoint: LAYERZERO_ENDPOINT,
    contracts: {
      myntisOFT: myntisOFTAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    cap: cap.toString(),
    maxSupply: maxSupply.toString(),
  };

  const deploymentFile = path.join(__dirname, `../deployments/${networkName}-oft-standard.json`);
  const deploymentDir = path.dirname(deploymentFile);
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✅ Deployment info saved to: ${deploymentFile}`);

  return {
    myntisOFT,
    network: networkName,
    chainId,
    deployer: deployer.address,
    timestamp: deploymentInfo.timestamp,
  };
}

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "base-sepolia";
  
  try {
    const result = await deployOFTStandard(networkName);
    console.log("\n✅ Deployment completed successfully!");
    console.log(`MyntisOFT address: ${await result.myntisOFT.getAddress()}`);
  } catch (error: any) {
    console.error("\n❌ Deployment failed:", error.message);
    if (error.transaction) {
      console.error("Transaction:", error.transaction);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

