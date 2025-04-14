// token/scripts/deploy-base-bridge.ts (Example, adjust filename if needed)
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();


async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MyntisBridge on Base with account:", deployer.address);

  // Get required addresses from environment variables
  // Use specific variable names for clarity if deploying multiple instances
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS; // Base token address
  const merkleDistributorAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS; // Base distributor address
  const lzEndpointAddress = process.env.BASE_LZ_ENDPOINT_ADDRESS; // Base LZ endpoint

  if (!myntisTokenAddress || !merkleDistributorAddress || !lzEndpointAddress) {
    throw new Error("Please set MYNTIS_TOKEN_ADDRESS, MERKLE_DISTRIBUTOR_ADDRESS, and BASE_LZ_ENDPOINT_ADDRESS in your .env file");
  }

  console.log("Base MyntisToken Address:", myntisTokenAddress);
  console.log("Base MerkleDistributor Address:", merkleDistributorAddress);
  console.log("Base LayerZero Endpoint Address:", lzEndpointAddress);

  // Deploy MyntisBridge
  console.log("Deploying MyntisBridge...");
  const MyntisBridgeFactory = await ethers.getContractFactory("MyntisBridge");
  const myntisBridge = await MyntisBridgeFactory.deploy(
    lzEndpointAddress,
    deployer.address, // Owner of the bridge contract
    myntisTokenAddress,
    merkleDistributorAddress
  );

  await myntisBridge.waitForDeployment();
  const myntisBridgeAddress = await myntisBridge.getAddress();
  console.log("MyntisBridge deployed on Base at:", myntisBridgeAddress);

  // Load attached contracts AFTER deployment to grant roles
  const myntisToken = await ethers.getContractAt("MyntisToken", myntisTokenAddress); // Use Interface
  const merkleDistributor = await ethers.getContractAt("MerkleDistributor", merkleDistributorAddress); // Use Interface


  // Grant roles to the bridge
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  if(!(await myntisToken.hasRole(MINTER_ROLE, myntisBridgeAddress))) {
      console.log("Granting MINTER_ROLE to the bridge...");
      const mintTx = await myntisToken.grantRole(MINTER_ROLE, myntisBridgeAddress);
      await mintTx.wait();
      console.log("MINTER_ROLE granted to the bridge.");
  } else {
      console.log("Bridge already has MINTER_ROLE.");
  }

  if(!(await myntisToken.hasRole(BURNER_ROLE, myntisBridgeAddress))) {
      console.log("Granting BURNER_ROLE to the bridge...");
      const burnTx = await myntisToken.grantRole(BURNER_ROLE, myntisBridgeAddress);
      await burnTx.wait();
      console.log("BURNER_ROLE granted to the bridge.");
  } else {
      console.log("Bridge already has BURNER_ROLE.");
  }


  // Configure MerkleDistributor to recognize the bridge
  // Add a check if this function exists and if it's already set if possible
  try {
      console.log("Setting bridge address in MerkleDistributor...");
      const setTx = await merkleDistributor.setBridgeContract(myntisBridgeAddress);
      await setTx.wait();
      console.log("Bridge address set in MerkleDistributor.");
  } catch (e: any) {
      console.warn(`Could not set bridge in MerkleDistributor (maybe function doesn't exist or already set?): ${e.message}`);
  }


  // Update .env file with the new bridge address
  const envPath = path.resolve(__dirname, '../../.env'); // Adjust path as necessary
  let envContent = "";
  if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
  }

  const envVar = 'MYNT_BRIDGE_ADDRESS'; // Use the correct variable name for Base bridge
  const newEntry = `${envVar}=${myntisBridgeAddress}`;

  if (envContent.includes(`${envVar}=`)) {
    envContent = envContent.replace(new RegExp(`${envVar}=.*`), newEntry);
    console.log(`Updated ${envVar} in .env file.`);
  } else {
    envContent += `\n${newEntry}\n`;
    console.log(`Added ${envVar} to .env file.`);
  }

  fs.writeFileSync(envPath, envContent);


  console.log("\n=== Deployed Base Addresses ===");
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