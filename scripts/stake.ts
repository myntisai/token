import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from one directory up (adjust path if needed)
dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  // Grab the deployer/admin account
  const [admin] = await ethers.getSigners();
  console.log("Admin wallet:", admin.address);
  
  // Get deployed contract addresses from environment variables
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS;
  
  if (!tokenAddress || !stakingAddress) {
    throw new Error("Please set MYNTIS_TOKEN_ADDRESS and STAKING_CONTRACT_ADDRESS in your .env file");
  }
  
  console.log("MyntisToken Address:", tokenAddress);
  console.log("StakingContract Address:", stakingAddress);
  
  // Attach to the already-deployed MyntisToken and StakingContract contracts.
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", admin);
  const myntisToken = MyntisTokenFactory.attach(tokenAddress) as any;
  
  const StakingFactory = await ethers.getContractFactory("StakingContract", admin);
  const stakingContract = StakingFactory.attach(stakingAddress) as any;
  
  // Define the amount to mint/stake (example: 1,000,000 tokens with 18 decimals)
  const mintAmount = ethers.parseUnits("1000000", 18);
  
  // 1. Mint tokens to the admin wallet.
  console.log(`Minting ${ethers.formatEther(mintAmount)} tokens to admin wallet...`);
  const mintTx = await myntisToken.mint(admin.address, mintAmount);
  await mintTx.wait();
  console.log("Minting completed.");
  
  // 2. Approve the staking contract to spend the tokens.
  console.log("Approving the staking contract to spend tokens...");
  const approveTx = await myntisToken.approve(stakingAddress, mintAmount);
  await approveTx.wait();
  console.log("Approval complete.");
  
  // 3. Stake the tokens.
  console.log("Staking tokens in the staking contract...");
  const stakeTx = await stakingContract.registerProvider(mintAmount);
  await stakeTx.wait();
  console.log("Staking completed.");
  
  // 4. Return and print all the addresses.
  console.log("\n=== Addresses ===");
  console.log("Admin Wallet Address: ", admin.address);
  console.log("MyntisToken Contract Address: ", tokenAddress);
  console.log("StakingContract Address: ", stakingAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in mintAndStake:", error);
    process.exit(1);
  });