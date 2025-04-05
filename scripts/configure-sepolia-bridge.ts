// token/scripts/configure-sepolia-bridge.ts
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Configuring remote bridge address on Sepolia for LayerZero communication...");
  
  // Get signer (must be the bridge owner)
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);
  
  // Bridge addresses
  const baseBridgeAddress = process.env.MYNT_BRIDGE_ADDRESS;
  const sepoliaBridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA;
  
  if (!baseBridgeAddress || !sepoliaBridgeAddress) {
    console.error("Missing bridge addresses in .env file");
    return;
  }
  
  // Correct LayerZero v2 EIDs
  const baseEid = 40245;   // Base Sepolia EID
  const sepoliaEid = 40161; // Ethereum Sepolia EID
  
  // Convert to uint16 chain IDs for contract interaction
  const baseChainId = baseEid & 0xFFFF;
  const sepoliaChainId = sepoliaEid & 0xFFFF;
  
  console.log(`Using Base Sepolia EID: ${baseEid} (Chain ID: ${baseChainId})`);
  console.log(`Using Ethereum Sepolia EID: ${sepoliaEid} (Chain ID: ${sepoliaChainId})`);
  
  // Convert Ethereum address to bytes32 format for LayerZero
  function addressToBytes32(address: any): string {
    return ethers.zeroPadValue(address, 32);
  }
  
  // Configure on Sepolia
  console.log("\nConfiguring remote bridge on Sepolia...");
  try {
    const sepoliaBridge = await ethers.getContractAt("MyntisBridge", sepoliaBridgeAddress);
    
    // Check if already configured - use the uint16 chain ID
    const currentRemote = await sepoliaBridge.remoteBridgeAddresses(baseChainId);
    
    if (currentRemote !== ethers.ZeroHash) {
      console.log(`Remote bridge already configured on Sepolia for Base: ${currentRemote}`);
    } else {
      const baseBridgeBytes32 = addressToBytes32(baseBridgeAddress);
      console.log(`Setting Base bridge (${baseBridgeAddress}) on Sepolia bridge...`);
      
      // Use uint16 chain ID
      const tx = await sepoliaBridge.updateRemoteBridge(baseChainId, baseBridgeBytes32);
      console.log(`Transaction submitted: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      if (receipt) {
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        console.log("Remote bridge successfully configured on Sepolia!");
      } else {
        console.log("Transaction was submitted but receipt is not available");
      }
    }
  } catch (error: any) {
    console.error(`Error configuring Sepolia bridge: ${error.message}`);
    if (error.data) console.error(`Error data: ${error.data}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });