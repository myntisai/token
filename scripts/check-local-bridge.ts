// scripts/check-remote-bridge.ts
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  // Define the chain ID you want to check.
  // You can update this value as needed.
  const chainIdToCheck = 40161;

  // Retrieve the deployed bridge address from your .env file
  const bridgeAddress = process.env.MYNTIS_BRIDGE_LOCAL_ADDRESS;
  if (!bridgeAddress) {
    console.error("Missing MYNTIS_BRIDGE_LOCAL_ADDRESS in .env");
    return;
  }
  console.log("MyntisBridge address:", bridgeAddress);

  // Attach to the deployed MyntisBridge contract
  const bridge = await ethers.getContractAt("MyntisBridge", bridgeAddress);

  // Query the remote bridge address for the specified chain ID
  const remoteBridge = await bridge.remoteBridgeAddresses(chainIdToCheck);
  console.log(`Remote bridge address for chain ID ${chainIdToCheck}:`, remoteBridge);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
