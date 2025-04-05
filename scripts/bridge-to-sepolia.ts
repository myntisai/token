import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Starting bridge from Base to Ethereum Sepolia...");
  
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);
  
  // Contract addresses from .env with safety checks
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS;
  
  if (!myntisTokenAddress || !bridgeAddress) {
    console.error("Missing contract addresses in .env file");
    return;
  }
  
  // Get destination EID from environment or use correct default
  const sepoliaEid = process.env.ETHEREUM_SEPOLIA_EID ? 
    parseInt(process.env.ETHEREUM_SEPOLIA_EID) : 40161;
  
  // Convert to uint16 chain ID for contract interaction
  const sepoliaChainId = sepoliaEid & 0xFFFF;
  
  console.log(`Using LayerZero Endpoint ID (EID) for Ethereum Sepolia: ${sepoliaEid}`);
  console.log(`Using contract chain ID (uint16): ${sepoliaChainId}`);
  
  // Amount to bridge
  const amountToBridge = ethers.parseEther("10");
  
  console.log("Loading contracts on Base...");
  
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
  
  // Check token allowance for the bridge contract
  const currentAllowance = await myntisToken.allowance(signer.address, bridgeAddress);
  console.log(`Current allowance: ${ethers.formatEther(currentAllowance)} MYNT`);

  if (currentAllowance < amountToBridge) {
    console.log("Allowance is insufficient. Approving tokens for bridging...");
    const approveTx = await myntisToken.approve(bridgeAddress, amountToBridge);
    console.log(`Approve transaction submitted: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval confirmed.");
  }
  
  // Check if bridge is allowed to burn tokens
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const hasBurnerRole = await myntisToken.hasRole(BURNER_ROLE, bridgeAddress);
  
  if (!hasBurnerRole) {
    console.log("Warning: Bridge doesn't have BURNER_ROLE. This transaction may fail.");
  }
  
  // CRITICAL: Check if remote bridge is configured using uint16 chainId
  const remoteBridge = await bridge.remoteBridgeAddresses(sepoliaChainId);
  console.log(`Remote bridge address for Sepolia: ${remoteBridge}`);
  
  // Check if the remote bridge address is empty
  const isZeroAddress = remoteBridge === ethers.ZeroHash;
  if (isZeroAddress) {
    console.error("ERROR: Remote bridge address is not configured. Transaction will fail.");
    console.log("\nTry running these configuration commands first:");
    console.log("npx hardhat run scripts/configure-base-bridge.ts --network base");
    console.log("npx hardhat run scripts/configure-sepolia-bridge.ts --network sepolia");
    return;
  }
  
  try {
    console.log("Estimating LayerZero fee...");
    // This is a simplified approach - in production you'd want to use the bridge's fee estimation
    const estimatedFee = ethers.parseEther("0.04");
    
    console.log(`Bridging ${ethers.formatEther(amountToBridge)} MYNT to Ethereum Sepolia...`);
    console.log(`Using fee: ${ethers.formatEther(estimatedFee)} ETH`);
    
    // Execute bridge transaction with uint16 chainId
    const bridgeTx = await bridge.bridgeMYNT(
      sepoliaChainId,
      amountToBridge,
      signer.address, // recipient is the same as sender
      false, // not a provider reward
      { value: estimatedFee, gasLimit: 1000000 }
    );
    
    console.log(`Bridge transaction submitted: ${bridgeTx.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await bridgeTx.wait();
    if (receipt) {
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      console.log("MYNT tokens have been sent to Ethereum Sepolia. This cross-chain transaction may take a few minutes to complete.");
      
      // Display emitted events from the transaction receipt
      console.log("Emitted events:");
      receipt.events?.forEach((event, idx) => {
        if (event.event) {
          console.log(`Event ${idx + 1}: ${event.event}`);
          console.log(`Arguments: ${JSON.stringify(event.args)}`);
        } else {
          console.log(`Event ${idx + 1}:`, event);
        }
      });
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
