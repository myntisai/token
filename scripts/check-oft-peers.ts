import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// LayerZero V2 Endpoint IDs (EIDs) - Load from environment variables
const LAYERZERO_EIDS: { [key: string]: number } = {
  "base-sepolia": process.env.LZ_EID_BASE_SEPOLIA ? parseInt(process.env.LZ_EID_BASE_SEPOLIA) : 40245,
  "ethereum-sepolia": process.env.LZ_EID_ETHEREUM_SEPOLIA ? parseInt(process.env.LZ_EID_ETHEREUM_SEPOLIA) : 40161,
};

async function checkPeers() {
  console.log("🔍 Checking OFT Peer Configuration...\n");

  const [deployer] = await ethers.getSigners();
  
  // Load deployments
  const baseDeployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/base-sepolia-full-stack.json"), "utf-8")
  );
  const ethDeployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/ethereum-sepolia-oft-standard.json"), "utf-8")
  );

  const baseOFTAddress = baseDeployment.myntisOFT;
  const ethOFTAddress = ethDeployment.contracts.myntisOFT;

  const MyntisOFT = await ethers.getContractFactory("contracts/MyntisOFT.sol:MyntisOFT");
  const baseOFT = MyntisOFT.attach(baseOFTAddress);
  const ethOFT = MyntisOFT.attach(ethOFTAddress);

  console.log(`Base Sepolia OFT: ${baseOFTAddress}`);
  console.log(`Ethereum Sepolia OFT: ${ethOFTAddress}\n`);

  // Check Base Sepolia -> Ethereum Sepolia
  const ethEid = LAYERZERO_EIDS["ethereum-sepolia"];
  const peerFromBase = await baseOFT.peers(ethEid);
  console.log(`Base Sepolia -> Ethereum Sepolia (EID ${ethEid}):`);
  console.log(`   Peer: ${peerFromBase}`);
  console.log(`   Expected: ${ethers.zeroPadValue(ethOFTAddress, 32)}`);
  console.log(`   Match: ${peerFromBase.toLowerCase() === ethers.zeroPadValue(ethOFTAddress, 32).toLowerCase()}\n`);

  // Check Ethereum Sepolia -> Base Sepolia
  const baseEid = LAYERZERO_EIDS["base-sepolia"];
  const peerFromEth = await ethOFT.peers(baseEid);
  console.log(`Ethereum Sepolia -> Base Sepolia (EID ${baseEid}):`);
  console.log(`   Peer: ${peerFromEth}`);
  console.log(`   Expected: ${ethers.zeroPadValue(baseOFTAddress, 32)}`);
  console.log(`   Match: ${peerFromEth.toLowerCase() === ethers.zeroPadValue(baseOFTAddress, 32).toLowerCase()}\n`);
}

checkPeers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

