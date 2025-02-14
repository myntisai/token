import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables (ensure your .env contains L2 addresses)
dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  // Grab admin, provider, and user accounts.
  const [admin, provider, user] = await ethers.getSigners();
  console.log("Admin:", admin.address);
  console.log("Provider:", provider.address);
  console.log("User:", user.address);

  // Get deployed contract addresses from .env
  const l2TokenAddress = process.env.L2_MYNTIS_TOKEN_ADDRESS;
  const l2BridgeAddress = process.env.L2_BRIDGE_ADDRESS;
  const l2MerkleDistributorAddress = process.env.L2_MERKLE_DISTRIBUTOR_ADDRESS;

  if (!l2TokenAddress || !l2BridgeAddress || !l2MerkleDistributorAddress) {
    throw new Error("Please set L2_MYNTIS_TOKEN_ADDRESS, L2_BRIDGE_ADDRESS, and L2_MERKLE_DISTRIBUTOR_ADDRESS in your .env file");
  }

  console.log("L2 MyntisToken Address:", l2TokenAddress);
  console.log("L2 Bridge Address:", l2BridgeAddress);
  console.log("L2 MerkleDistributor Address:", l2MerkleDistributorAddress);

  // Attach to the deployed L2 contracts.
  // Use a type-cast (or generated types) so that TS knows about your contract-specific methods.
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", admin);
  const l2Token = MyntisTokenFactory.attach(l2TokenAddress) as any;
  
  const MyntisBridgeL2Factory = await ethers.getContractFactory("MyntisBridgeL2", admin);
  const l2Bridge = MyntisBridgeL2Factory.attach(l2BridgeAddress) as any;
  
  const L2MerkleDistributorFactory = await ethers.getContractFactory("L2MerkleDistributor", admin);
  const l2MerkleDistributor = L2MerkleDistributorFactory.attach(l2MerkleDistributorAddress) as any;

  // Define deposit amount (100 tokens with 18 decimals)
  const depositAmount = ethers.parseEther("100");
  const depositId = 1;

  // -------------------------------------------
  // L2 Bridging & Merkle Distribution Flow
  // -------------------------------------------
  
  // 1. Complete deposit on L2 (operator/admin calls completeDeposit).
  console.log("Completing deposit on L2...");
  const depositTx = await l2Bridge.connect(admin).completeDeposit(provider.address, depositAmount, depositId);
  await depositTx.wait();
  console.log(`Deposit complete: ${ethers.formatEther(depositAmount)} tokens minted to provider ${provider.address} with depositId ${depositId}`);

  // 2. Provider notifies reward to the L2MerkleDistributor.
  console.log("Provider notifying reward to L2MerkleDistributor...");
  const notifyTx = await l2MerkleDistributor.connect(provider).notifyReward(provider.address, depositAmount);
  await notifyTx.wait();
  console.log("Reward notification complete.");

  // 3. Provider transfers tokens from their wallet to the distributor
  //    so that L2MerkleDistributor can later transfer tokens during claims.
  console.log("Transferring tokens from provider to L2MerkleDistributor...");
  const transferTx = await l2Token.connect(provider).transfer(l2MerkleDistributorAddress, depositAmount);
  await transferTx.wait();
  console.log("Transfer complete.");

  // Verify the distributor's reward balance for the provider.
  const currentBalance = await l2MerkleDistributor.providerBalance(provider.address);
  console.log("Current provider balance on L2MerkleDistributor:", ethers.formatEther(currentBalance));

  // (OPTIONAL) Additional steps: submitting a Merkle root and processing claims.
  console.log("L2 Bridging flow complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in L2 Bridging flow:", error);
    process.exit(1);
  });