// scripts/check-remote-bridge.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  // Hardcoded chain ID; change this value as needed
  const chainId = 40245;

  // Get the bridge contract address from the environment variables
  const bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA;
  if (!bridgeAddress) {
    console.error("Bridge address not set in .env file (MYNT_BRIDGE_ADDRESS)");
    process.exit(1);
  }

  // Load the deployed bridge contract; ensure "MyntisBridge" matches your contract name
  const bridge = await ethers.getContractAt("MyntisBridge", bridgeAddress);

  // Retrieve the remote bridge address for the provided chain ID
  const remoteBridgeAddress = await bridge.remoteBridgeAddresses(chainId);
  console.log(`Remote bridge address for chain ID ${chainId}: ${remoteBridgeAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
