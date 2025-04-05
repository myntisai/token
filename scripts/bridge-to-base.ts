import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Starting bridge from Ethereum Sepolia to Base...");
  
  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);
  
  // Contract addresses from .env with safety checks
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS_ETHEREUM_SEPOLIA;
  const bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA;
  
  if (!myntisTokenAddress || !bridgeAddress) {
    console.error("Missing contract addresses in .env file");
    return;
  }
  
  // Get destination EID from environment or use correct default
  const sepoliaEid = process.env.ETHEREUM_SEPOLIA_EID ? 
    parseInt(process.env.ETHEREUM_SEPOLIA_EID) : 40161;
  
  console.log(`Using LayerZero Endpoint ID (EID) for Ethereum Sepolia: ${sepoliaEid}`);
  
  // Amount to bridge
  const amountToBridge = ethers.parseEther("5");
  
  console.log(`Loading contracts on Ethereum Sepolia...`);
  
  // Load contracts
  const myntisToken = await ethers.getContractAt("MyntisToken", myntisTokenAddress);
  const bridge = await ethers.getContractAt("MyntisBridge", bridgeAddress);
  
  // Check token balance
  const balance = await myntisToken.balanceOf(signer.address);
  console.log(`MYNT balance: ${ethers.formatEther(balance)} MYNT`);
  
  if (balance < amountToBridge) {
    console.error(`Insufficient MYNT balance. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(amountToBridge)}`);
    return;
  }
  
  // Check if bridge is allowed to burn tokens
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const hasBurnerRole = await myntisToken.hasRole(BURNER_ROLE, bridgeAddress);
  
  if (!hasBurnerRole) {
    console.log("Warning: Bridge doesn't have BURNER_ROLE. This transaction may fail.");
  }
  
  // CRITICAL: Check if remote bridge is configured
  const remoteBridge = await bridge.remoteBridgeAddresses(sepoliaEid);
  console.log(`Remote bridge address for Ethereum Sepolia: ${remoteBridge}`);
  if (remoteBridge === ethers.ZeroHash) {
    console.error("ERROR: Remote bridge address is not configured. Transaction will fail.");
    return;
  }
  
  try {
    console.log(`Estimating LayerZero fee...`);
    // This is a simplified approach - in production you'd want to use the bridge's fee estimation
    const estimatedFee = ethers.parseEther("0.02"); // Increased from previous value
    
    console.log(`Bridging ${ethers.formatEther(amountToBridge)} MYNT to Ethereum Sepolia...`);
    console.log(`Using fee: ${ethers.formatEther(estimatedFee)} ETH`);
    
    // Execute bridge transaction
    const bridgeTx = await bridge.bridgeMYNT(
      sepoliaEid,
      amountToBridge,
      signer.address, // recipient is the same as sender
      false, // not a provider reward
      { value: estimatedFee, gasLimit: 500000 }
    );
    
    console.log(`Bridge transaction submitted: ${bridgeTx.hash}`);
    console.log(`Waiting for transaction confirmation...`);
    
    const receipt = await bridgeTx.wait();
    if (receipt) {
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`MYNT tokens have been sent to Ethereum Sepolia. This cross-chain transaction may take a few minutes to complete.`);
    } else {
      console.log("Transaction was submitted but receipt is not available");
    }
    
  } catch (error: any) {
    console.error(`Error during bridging: ${error.message}`);
    if (error.data) {
      console.error(`Error data: ${error.data}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });