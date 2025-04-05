import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying MyntisBridge on Ethereum with account: ${deployer.address}`);

  // Get required addresses from environment variables for Ethereum deployment
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA;
  const merkleDistributorAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS_ETHEREUM_SEPOLIA;
  const lzEndpointAddress = process.env.ETH_LZ_ENDPOINT_ADDRESS;

  if (!myntisTokenAddress || !merkleDistributorAddress || !lzEndpointAddress) {
    throw new Error("Please set MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA, MERKLE_DISTRIBUTOR_ADDRESS_ETHEREUM_SEPOLIA, and ETH_LZ_ENDPOINT_ADDRESS in your .env file");
  }

  console.log("MyntisToken Address:", myntisTokenAddress);
  console.log("MerkleDistributor Address:", merkleDistributorAddress);
  console.log("LayerZero Endpoint Address:", lzEndpointAddress);

  // Attach to existing contracts
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken");
  const myntisToken = MyntisTokenFactory.attach(myntisTokenAddress) as any;

  const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = MerkleDistributorFactory.attach(merkleDistributorAddress) as any;

  // Deploy MyntisBridge
  console.log("Deploying MyntisBridge...");
  const MyntisBridgeFactory = await ethers.getContractFactory("MyntisBridge");
  const myntisBridge = await MyntisBridgeFactory.deploy(
    lzEndpointAddress,
    deployer.address,
    myntisTokenAddress,
    merkleDistributorAddress
  ) as any;

  await myntisBridge.waitForDeployment();
  const myntisBridgeAddress = await myntisBridge.getAddress();
  console.log("MyntisBridge deployed at:", myntisBridgeAddress);

  // Grant roles to the bridge
  console.log("Granting MINTER_ROLE to MyntisBridge...");
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const mintTx = await myntisToken.grantRole(MINTER_ROLE, myntisBridgeAddress);
  await mintTx.wait();
  console.log("MINTER_ROLE granted to MyntisBridge");

  console.log("Granting BURNER_ROLE to MyntisBridge...");
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const burnTx = await myntisToken.grantRole(BURNER_ROLE, myntisBridgeAddress);
  await burnTx.wait();
  console.log("BURNER_ROLE granted to MyntisBridge");

  // Configure MerkleDistributor to recognize the bridge
  console.log("Setting bridge address in MerkleDistributor...");
  const setTx = await merkleDistributor.setBridgeContract(myntisBridgeAddress);
  await setTx.wait();
  console.log("Bridge address set in MerkleDistributor");

  // Update the .env file with the new ETH bridge address
  const envPath = path.resolve(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  if (envContent.includes("ETH_BRIDGE_ADDRESS=")) {
    envContent = envContent.replace(/ETH_BRIDGE_ADDRESS=.*/, `ETH_BRIDGE_ADDRESS=${myntisBridgeAddress}`);
  } else {
    envContent += `\nETH_BRIDGE_ADDRESS=${myntisBridgeAddress}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env file with bridge address");

  // Output deployed addresses
  console.log("\n=== Deployed Ethereum Addresses ===");
  console.log("MyntisToken:", myntisTokenAddress);
  console.log("MerkleDistributor:", merkleDistributorAddress);
  console.log("MyntisBridge:", myntisBridgeAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });