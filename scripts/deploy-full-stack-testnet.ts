// TODO: Update this script to use Myntis.sol (upgradeable) instead of deleted MyntisOFT.sol
// Myntis uses UUPS proxy pattern - see deploy-oft-hub.ts for reference
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

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

interface FullStackDeploymentResult {
  myntisOFT: string;
  stakingContract: string;
  stakingImplementation: string;
  emissionsContract: string;
  emissionsImplementation: string;
  merkleDistributor: string;
  network: string;
  chainId: number;
  deployer: string;
  timestamp: string;
}

async function deployFullStack(networkName: string): Promise<FullStackDeploymentResult> {
  console.log(`🚀 Deploying Full Myntis Stack on ${networkName}...\n`);

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
  console.log(`Chain ID: ${chainId}\n`);

  // Step 1: Deploy MyntisOFT (Standard OFT)
  console.log("1️⃣ Deploying MyntisOFT (Standard OFT)...");
  const MyntisOFTFactory = await ethers.getContractFactory("contracts/MyntisOFT.sol:MyntisOFT");
  
  const myntisOFT = await MyntisOFTFactory.deploy(
    "Myntis",
    "MYNT",
    LAYERZERO_ENDPOINT,
    deployer.address
  );
  
  await myntisOFT.waitForDeployment();
  const myntisOFTAddress = await myntisOFT.getAddress();
  console.log(`✅ MyntisOFT deployed to: ${myntisOFTAddress}`);

  // Configure MyntisOFT
  console.log("\n⚙️ Configuring MyntisOFT...");
  // Roles are constants, access them directly
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  
  await myntisOFT.grantRole(MINTER_ROLE, deployer.address);
  await myntisOFT.grantRole(BURNER_ROLE, deployer.address);
  
  const cap = ethers.parseEther("1000000000"); // 1B tokens
  await myntisOFT.updateCap(cap);
  await myntisOFT.updateFeeRecipient(deployer.address);
  
  // Mint initial tokens
  const initialMint = ethers.parseEther("1000000"); // 1M tokens
  await myntisOFT.mint(deployer.address, initialMint);
  console.log(`✅ MyntisOFT configured and initial tokens minted`);

  // Note: Staking, Emissions, and MerkleDistributor contracts are not in this token directory
  // They are already deployed and can be configured to use the new OFT if needed
  // For now, we'll just deploy the OFT and note that other contracts can be updated separately
  console.log("\n📝 Note: Staking, Emissions, and MerkleDistributor contracts");
  console.log("   are already deployed. They can be updated to use the new OFT");
  console.log("   address if needed. See existing deployment addresses in");
  console.log("   CONTRACT_DEPLOYMENT_HISTORY.md");
  
  const merkleDistributorAddress = "0x0000000000000000000000000000000000000000"; // Placeholder
  const stakingAddress = "0x0000000000000000000000000000000000000000"; // Placeholder
  const stakingImplementationAddress = "0x0000000000000000000000000000000000000000"; // Placeholder
  const emissionsAddress = "0x0000000000000000000000000000000000000000"; // Placeholder
  const emissionsImplementationAddress = "0x0000000000000000000000000000000000000000"; // Placeholder

  // Display deployment summary
  console.log("\n📊 Full Stack Deployment Summary:");
  console.log("==================================");
  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`\nContracts:`);
  console.log(`  MyntisOFT: ${myntisOFTAddress}`);
  console.log(`\n  Note: Other contracts (Staking, Emissions, MerkleDistributor)`);
  console.log(`  are already deployed. See CONTRACT_DEPLOYMENT_HISTORY.md for addresses.`);

  // Save deployment info
  const deploymentInfo: any = {
    myntisOFT: myntisOFTAddress,
    network: networkName,
    chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    note: "Only MyntisOFT deployed. Other contracts (Staking, Emissions, MerkleDistributor) are already deployed separately."
  };

  const deploymentFile = path.join(__dirname, `../deployments/${networkName}-full-stack.json`);
  const deploymentDir = path.dirname(deploymentFile);
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✅ Deployment info saved to: ${deploymentFile}`);

  return deploymentInfo;
}

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "base-sepolia";
  
  try {
    const result = await deployFullStack(networkName);
    console.log("\n✅ Full stack deployment completed successfully!");
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

