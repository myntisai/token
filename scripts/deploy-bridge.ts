// token/scripts/deploy-bridge.ts
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MyntisBridge with account:", deployer.address);
  
  // Get required addresses from environment variables
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const merkleDistributorAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS;
  const lzEndpointAddress = process.env.BASE_LZ_ENDPOINT_ADDRESS;
  
  if (!myntisTokenAddress || !merkleDistributorAddress || !lzEndpointAddress) {
    throw new Error("Please set MYNTIS_TOKEN_ADDRESS, MERKLE_DISTRIBUTOR_ADDRESS, and BASE_LZ_ENDPOINT_ADDRESS in your .env file");
  }
  
  console.log("MyntisToken Address:", myntisTokenAddress);
  console.log("MerkleDistributor Address:", merkleDistributorAddress);
  console.log("LayerZero Endpoint Address:", lzEndpointAddress);
  
  // Attach to existing contracts - using "as any" to fix TypeScript issues
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
  console.log("Granting MINTER_ROLE to the bridge...");
  // You can either hard-code the role hash or get it directly from the contract
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const mintTx = await myntisToken.grantRole(MINTER_ROLE, myntisBridgeAddress);
  await mintTx.wait();
  console.log("MINTER_ROLE granted to the bridge");
  
  console.log("Granting BURNER_ROLE to the bridge...");
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const burnTx = await myntisToken.grantRole(BURNER_ROLE, myntisBridgeAddress);
  await burnTx.wait();
  console.log("BURNER_ROLE granted to the bridge");
  
  // Configure MerkleDistributor to recognize the bridge
  console.log("Setting bridge address in MerkleDistributor...");
  const setTx = await merkleDistributor.setBridgeContract(myntisBridgeAddress);
  await setTx.wait();
  console.log("Bridge address set in MerkleDistributor");
  
  // Update .env file with the new bridge address
  const envPath = path.resolve(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Add or update the MYNT_BRIDGE_ADDRESS
  if (envContent.includes('MYNT_BRIDGE_ADDRESS=')) {
    envContent = envContent.replace(
      /MYNT_BRIDGE_ADDRESS=.*/,
      `MYNT_BRIDGE_ADDRESS=${myntisBridgeAddress}`
    );
  } else {
    envContent += `\nMYNT_BRIDGE_ADDRESS=${myntisBridgeAddress}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env file with bridge address");
  
  // Output addresses for verification
  console.log("\n=== Deployed Addresses ===");
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