import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Checking bridge permissions...");
  
  // Get signer and network
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  console.log(`Using account: ${signer.address}`);
  console.log(`Network: ${network.name} (Chain ID: ${chainId})`);
  
  // Determine which addresses to use based on network
  let myntisTokenAddress, bridgeAddress;
  
  if (network.name === "sepolia" || chainId === 11155111) {
    // Use Sepolia addresses
    myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA;
    bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA;
    console.log("Using Sepolia contract addresses");
  } else {
    // Default to Base addresses
    myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
    bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS;
    console.log("Using Base contract addresses");
  }
  
  if (!myntisTokenAddress || !bridgeAddress) {
    console.error("Missing contract addresses in .env file");
    return;
  }
  
  console.log(`Checking roles for:`);
  console.log(`- Token: ${myntisTokenAddress}`);
  console.log(`- Bridge: ${bridgeAddress}`);
  
  // Load token contract
  const myntisToken = await ethers.getContractAt("MyntisToken", myntisTokenAddress);
  
  // Check if bridge has BURNER_ROLE
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const hasBurnerRole = await myntisToken.hasRole(BURNER_ROLE, bridgeAddress);
  
  console.log(`\nBridge has BURNER_ROLE: ${hasBurnerRole}`);
  
  // Check if bridge has MINTER_ROLE
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const hasMinterRole = await myntisToken.hasRole(MINTER_ROLE, bridgeAddress);
  
  console.log(`Bridge has MINTER_ROLE: ${hasMinterRole}`);
  
  // Check if the caller has DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdminRole = await myntisToken.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  
  console.log(`Your account has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);
  
  // If the caller has admin role and bridge doesn't have roles, provide grant command
  if (hasAdminRole && (!hasBurnerRole || !hasMinterRole)) {
    console.log("\nTo grant roles to the bridge, run:");
    console.log(`npx hardhat run scripts/grant-bridge-role.ts --network ${network.name}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });