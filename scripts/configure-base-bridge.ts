// token/scripts/configure-base-bridge.ts
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Configuring remote bridge address on Base for LayerZero communication...");
  
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
  
  console.log(`Using Base Sepolia EID: ${baseEid}`);
  console.log(`Using Ethereum Sepolia EID: ${sepoliaEid}`);
  
  // Convert Ethereum address to bytes32 format for LayerZero
  function addressToBytes32(address: any): string {
    return ethers.zeroPadValue(address, 32);
  }
  
  // Configure on Base
  console.log("\nConfiguring remote bridge on Base...");
  try {
    const baseBridge = await ethers.getContractAt("MyntisBridge", baseBridgeAddress);
    
    // Try to check if already configured, but proceed if we can't check
    let shouldConfigure = true;
    try {
      const currentRemote = await baseBridge.remoteBridgeAddresses(sepoliaEid);
      if (currentRemote !== ethers.ZeroHash) {
        console.log(`Remote bridge already configured on Base for Sepolia: ${currentRemote}`);
        shouldConfigure = false;
      }
    } catch (checkError) {
      console.log("Couldn't check current configuration, proceeding with update...");
    }
    
    if (shouldConfigure) {
      const sepoliaBridgeBytes32 = addressToBytes32(sepoliaBridgeAddress);
      console.log(`Setting Sepolia bridge (${sepoliaBridgeAddress}) on Base bridge...`);
      
      // This will force an update even if already configured
      const tx = await baseBridge.updateRemoteBridge(sepoliaEid, sepoliaBridgeBytes32);
      console.log(`Transaction submitted: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      if (receipt) {
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        console.log("Remote bridge successfully configured on Base!");
      } else {
        console.log("Transaction was submitted but receipt is not available");
      }
    }
  } catch (error: any) {
    console.error(`Error configuring Base bridge: ${error.message}`);
    if (error.data) console.error(`Error data: ${error.data}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });