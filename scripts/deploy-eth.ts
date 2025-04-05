// token/scripts/deploy-eth.ts
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying to Ethereum Sepolia with account:", deployer.address);
  
  // Get the LayerZero endpoint for Ethereum Sepolia
  const lzEndpointAddress = process.env.ETH_LZ_ENDPOINT_ADDRESS;
  
  if (!lzEndpointAddress) {
    throw new Error("Please set ETH_LZ_ENDPOINT_ADDRESS in your .env file");
  }
  
  console.log("LayerZero Endpoint Address:", lzEndpointAddress);
  
  // --------------------------
  // Deploy MyntisToken
  // --------------------------
  console.log("Deploying MyntisToken...");
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken");
  const myntisToken = (await MyntisTokenFactory.deploy(deployer.address)) as any;
  await myntisToken.waitForDeployment();
  const myntisTokenAddress = await myntisToken.getAddress();
  console.log("MyntisToken deployed at:", myntisTokenAddress);
  
  // --------------------------
  // Deploy MerkleDistributor
  // --------------------------
  console.log("Deploying MerkleDistributor...");
  const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = (await MerkleDistributorFactory.deploy(myntisTokenAddress, deployer.address)) as any;
  await merkleDistributor.waitForDeployment();
  const merkleDistributorAddress = await merkleDistributor.getAddress();
  console.log("MerkleDistributor deployed at:", merkleDistributorAddress);
  
  // --------------------------
  // Deploy MyntisBridge
  // --------------------------
  console.log("Deploying MyntisBridge...");
  const MyntisBridgeFactory = await ethers.getContractFactory("MyntisBridge");
  const myntisBridge = (await MyntisBridgeFactory.deploy(
    lzEndpointAddress,
    deployer.address,
    myntisTokenAddress,
    merkleDistributorAddress
  )) as any;
  
  await myntisBridge.waitForDeployment();
  const myntisBridgeAddress = await myntisBridge.getAddress();
  console.log("MyntisBridge deployed at:", myntisBridgeAddress);
  
  // --------------------------
  // Configure contracts
  // --------------------------
  
  // Grant MINTER_ROLE and BURNER_ROLE to the bridge
  console.log("Granting MINTER_ROLE to MyntisBridge...");
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const mintTx = await myntisToken.grantRole(MINTER_ROLE, myntisBridgeAddress);
  await mintTx.wait();
  
  console.log("Granting BURNER_ROLE to MyntisBridge...");
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const burnTx = await myntisToken.grantRole(BURNER_ROLE, myntisBridgeAddress);
  await burnTx.wait();
  
  // Configure MerkleDistributor
  console.log("Setting bridge address in MerkleDistributor...");
  const bridgeTx = await merkleDistributor.setBridgeContract(myntisBridgeAddress);
  await bridgeTx.wait();
  
  // --------------------------
  // Update .env file
  // --------------------------
  const envPath = path.resolve(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Add or update the ETH Sepolia addresses
  const envVars = {
    'ETH_MYNTIS_TOKEN_ADDRESS': myntisTokenAddress,
    'ETH_MERKLE_DISTRIBUTOR_ADDRESS': merkleDistributorAddress,
    'ETH_BRIDGE_ADDRESS': myntisBridgeAddress
  };
  
  for (const [key, value] of Object.entries(envVars)) {
    if (envContent.includes(`${key}=`)) {
      envContent = envContent.replace(
        new RegExp(`${key}=.*`),
        `${key}=${value}`
      );
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env file with Ethereum Sepolia contract addresses");
  
  // Output addresses for verification
  console.log("\n=== Ethereum Sepolia Deployed Addresses ===");
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