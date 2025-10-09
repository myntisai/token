// token/scripts/deploy-sepolia-bridge.ts (Example, adjust filename if needed)
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MyntisBridge on Sepolia with account:", deployer.address);

  // Get required addresses from environment variables for Sepolia
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA;
  const merkleDistributorAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS_ETHEREUM_SEPOLIA;
  const lzEndpointAddress = process.env.ETH_LZ_ENDPOINT_ADDRESS; // Sepolia LZ endpoint

  if (!myntisTokenAddress || !merkleDistributorAddress || !lzEndpointAddress) {
    throw new Error("Please set MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA, MERKLE_DISTRIBUTOR_ADDRESS_ETHEREUM_SEPOLIA, and ETH_LZ_ENDPOINT_ADDRESS in your .env file");
  }

  console.log("Sepolia MyntisToken Address:", myntisTokenAddress);
  console.log("Sepolia MerkleDistributor Address:", merkleDistributorAddress);
  console.log("Sepolia LayerZero Endpoint Address:", lzEndpointAddress);

  // Deploy MyntisBridge
  console.log("Deploying MyntisBridge...");
  const MyntisBridgeFactory = await ethers.getContractFactory("MyntisBridge");
  const myntisBridge = await MyntisBridgeFactory.deploy(
    lzEndpointAddress,
    deployer.address,
    myntisTokenAddress,
    merkleDistributorAddress
  );

  await myntisBridge.waitForDeployment();
  const myntisBridgeAddress = await myntisBridge.getAddress();
  console.log("MyntisBridge deployed on Sepolia at:", myntisBridgeAddress);

  // Load attached contracts AFTER deployment
  const myntisToken = await ethers.getContractAt("MyntisToken", myntisTokenAddress);
  const merkleDistributor = await ethers.getContractAt("MerkleDistributor", merkleDistributorAddress);

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

  // Configure MerkleDistributor
   try {
      console.log("Setting bridge address in MerkleDistributor...");
      const setTx = await merkleDistributor.setBridgeContract(myntisBridgeAddress);
      await setTx.wait();
      console.log("Bridge address set in MerkleDistributor.");
  } catch (e: any) {
       console.warn(`Could not set bridge in MerkleDistributor (maybe function doesn't exist or already set?): ${e.message}`);
  }


  // Update .env file
  const envPath = path.resolve(__dirname, '../../.env'); // Adjust path
  let envContent = "";
   if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
  }

  const envVar = 'MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA'; // Use the correct variable name
  const newEntry = `${envVar}=${myntisBridgeAddress}`;

  if (envContent.includes(`${envVar}=`)) {
    envContent = envContent.replace(new RegExp(`${envVar}=.*`), newEntry);
    console.log(`Updated ${envVar} in .env file.`);
  } else {
    envContent += `\n${newEntry}\n`;
     console.log(`Added ${envVar} to .env file.`);
  }
  fs.writeFileSync(envPath, envContent);

  console.log("\n=== Deployed Sepolia Addresses ===");
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