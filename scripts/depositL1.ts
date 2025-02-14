import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables (ensure your .env file contains the L1 addresses)
dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  // Grab provider and operator accounts.
  const [provider, operator] = await ethers.getSigners();
  console.log("Provider:", provider.address);
  console.log("Operator:", operator.address);

  // Get deployed L1 contract addresses from your .env file.
  const l1TokenAddress = process.env.L1_MYNTIS_TOKEN_ADDRESS;
  const l1BridgeAddress = process.env.L1_BRIDGE_ADDRESS;

  if (!l1TokenAddress || !l1BridgeAddress) {
    throw new Error("Please set L1_MYNTIS_TOKEN_ADDRESS and L1_BRIDGE_ADDRESS in your .env file");
  }
  console.log("L1 MyntisToken Address:", l1TokenAddress);
  console.log("L1 Bridge Address:", l1BridgeAddress);

  // Attach to deployed L1 contracts (using type assertions as needed)
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", provider);
  const l1Token = MyntisTokenFactory.attach(l1TokenAddress) as any;

  const MyntisBridgeL1Factory = await ethers.getContractFactory("MyntisBridgeL1", operator);
  const l1Bridge = MyntisBridgeL1Factory.attach(l1BridgeAddress) as any;

  // Define deposit amount (100 tokens with 18 decimals)
  const depositAmount = ethers.parseEther("100");

  // Provider approves the bridge contract to spend tokens.
  console.log("Approving tokens for deposit...");
  const approveTx = await l1Token.connect(provider).approve(l1BridgeAddress, depositAmount);
  await approveTx.wait();
  console.log("Approval complete.");

  // Mint tokens to provider if your token contract supports it.
  const mintAmount = ethers.parseEther("1000");
  const mintTx = await l1Token.mint(provider.address, mintAmount);
  await mintTx.wait();
  console.log(`Minted ${ethers.formatEther(mintAmount)} tokens to provider ${provider.address}`);

  // Provider deposits tokens into the L1 Bridge.
  console.log("Depositing tokens into L1 Bridge...");
  const depositTx = await l1Bridge.connect(provider).deposit(depositAmount);
  await depositTx.wait();
  console.log(`Deposit complete: ${ethers.formatEther(depositAmount)} tokens deposited by ${provider.address}`);

  // (Optional) You can perform further actions like checking the bridge balance.
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in L1 Deposit flow:", error);
    process.exit(1);
  });