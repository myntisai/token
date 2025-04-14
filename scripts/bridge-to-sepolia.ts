import { ethers as hardhatEthers } from "hardhat";
import { ethers as ethersJs, AbiCoder } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function addressToBytes32(address: string): string {
  try {
    return ethersJs.zeroPadValue(ethersJs.getAddress(address), 32);
  } catch (e: any) {
    console.error(`Invalid address format: ${address} - ${e.message}`);
    throw e;
  }
}

async function main() {
  console.log("Starting bridge from Base to Ethereum Sepolia...");

  const [signer] = await hardhatEthers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Load addresses from environment variables
  const myntisTokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const bridgeAddress = process.env.MYNT_BRIDGE_ADDRESS; // Base Bridge address
  const sepoliaBridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA; // Sepolia Bridge address

  if (!myntisTokenAddress || !bridgeAddress || !sepoliaBridgeAddress) {
    console.error("ERROR: Missing one or more required addresses in .env");
    return;
  }
  console.log(` - Base Token Address: ${myntisTokenAddress}`);
  console.log(` - Base Bridge Address: ${bridgeAddress}`);
  console.log(` - Sepolia Bridge Address: ${sepoliaBridgeAddress}`);

  // Set destination EID from env or default; derive chain ID if needed.
  const sepoliaEid = process.env.ETHEREUM_SEPOLIA_EID ? parseInt(process.env.ETHEREUM_SEPOLIA_EID) : 40161;
  const sepoliaChainId = sepoliaEid & 0xFFFF;

  console.log(`Using Destination EID (uint32): ${sepoliaEid}`);
  console.log(`Using Destination Chain ID (uint16) for bridge: ${sepoliaChainId}`);

  // Define the amount to bridge
  const amountToBridge = ethersJs.parseEther("10");  // 10 MYNT
  console.log(`Amount to bridge: ${ethersJs.formatEther(amountToBridge)} MYNT`);

  // --- Load Contracts ---
  console.log("\nLoading contracts on Base...");
  let myntisToken: any, bridge: any;

  try {
    myntisToken = await hardhatEthers.getContractAt("MyntisToken", myntisTokenAddress);
    bridge = await hardhatEthers.getContractAt("MyntisBridge", bridgeAddress);
    console.log(" - Contracts loaded successfully.");
  } catch (error: any) {
    console.error(`Error loading contracts: ${error.message}`);
    return;
  }

  // --- Pre-flight Checks ---
  console.log("\nRunning Pre-flight Checks...");
  try {
    const balance: bigint = await myntisToken.balanceOf(signer.address);
    console.log(` - MYNT balance: ${ethersJs.formatEther(balance)} MYNT`);
    if (balance < amountToBridge) {
      console.error(`ERROR: Insufficient MYNT balance. Have ${ethersJs.formatEther(balance)}, need ${ethersJs.formatEther(amountToBridge)}`);
      return;
    }

    const currentAllowance: bigint = await myntisToken.allowance(signer.address, bridgeAddress);
    console.log(` - Current allowance for bridge: ${ethersJs.formatEther(currentAllowance)} MYNT`);
    if (currentAllowance < amountToBridge) {
      console.log("Approving tokens for bridging...");
      const approveTx = await myntisToken.approve(bridgeAddress, amountToBridge);
      console.log(`Approve transaction submitted: ${approveTx.hash}`);
      await approveTx.wait(1);
      console.log("Approval confirmed.");
    }

    const BURNER_ROLE = ethersJs.keccak256(ethersJs.toUtf8Bytes("BURNER_ROLE"));
    const hasBurnerRole = await myntisToken.hasRole(BURNER_ROLE, bridgeAddress);
    console.log(` - Bridge has BURNER_ROLE: ${hasBurnerRole}`);
    if (!hasBurnerRole) {
      console.error("ERROR: Bridge contract needs BURNER_ROLE on the token contract. Grant role and retry.");
      return;
    }

    const expectedRemote = addressToBytes32(sepoliaBridgeAddress);
    const remoteBridge = await bridge.remoteBridgeAddresses(sepoliaEid);
    console.log(` - Configured remote bridge for Sepolia (EID ${sepoliaEid}): ${remoteBridge}`);
    if (remoteBridge.toLowerCase() !== expectedRemote.toLowerCase()) {
      console.error(`ERROR: Remote bridge address mismatch! Expected ${expectedRemote}, Got ${remoteBridge}`);
      return;
    }

    const configuredPeer = await bridge.peers(sepoliaEid);
    console.log(` - Configured peer for Sepolia (EID ${sepoliaEid}): ${configuredPeer}`);
    if (configuredPeer.toLowerCase() !== expectedRemote.toLowerCase()) {
      console.error(`ERROR: Peer configuration mismatch! Expected ${expectedRemote}, Got ${configuredPeer}`);
      return;
    }

    console.log("✅ Pre-flight checks passed.");
  } catch (error: any) {
    console.error("Error during Pre-flight Checks:", error.message);
    return;
  }

  // --- Use a Fixed Extra Fee for Testing ---
  // For testing purposes, simply send an extra fixed fee; here we use 0.1 ETH.
  const feeForTesting = ethersJs.parseEther("0.1");
  console.log(`Using a fixed fee for testing: ${ethersJs.formatEther(feeForTesting)} ETH`);

  // Verify that the signer has enough ETH for the fee.
  const signerEth: bigint = await hardhatEthers.provider.getBalance(signer.address);
  if (signerEth < feeForTesting) {
    console.error(`ERROR: Insufficient ETH balance for fee. Have ${ethersJs.formatEther(signerEth)} ETH, need ${ethersJs.formatEther(feeForTesting)} ETH`);
    return;
  }

  // --- Execute Bridge Transaction ---
  try {
    console.log(`\nBridging ${ethersJs.formatEther(amountToBridge)} MYNT to Ethereum Sepolia...`);
    const bridgeTx = await bridge.bridgeMYNT(
      sepoliaEid,         // Destination identifier (EID)
      amountToBridge,
      signer.address,
      false,              // isProviderReward set to false for this test
      {
        value: feeForTesting, // Fixed extra fee for testing
        gasLimit: 1500000,
      }
    );
    console.log(`Bridge transaction submitted: ${bridgeTx.hash}`);
    
    const receipt = await bridgeTx.wait(1);
    if (receipt.status === 1) {
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      console.log("LayerZero message sent. Monitor progress on LayerZero Scan (testnetscan.layerzero.network).");
    } else {
      console.error(`❌ Transaction FAILED. Tx Hash: ${bridgeTx.hash}`);
      console.log("Receipt:", receipt);
    }
  } catch (error: any) {
    console.error("❌ Error during bridging transaction:");
    console.error("Error message:", error.message);
    if (error.code) console.error("Error Code:", error.code);
    if (error.reason) console.error("Revert Reason:", error.reason);
    return;
  }
}

main()
  .then(() => {
    console.log("\nScript finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n--- Unhandled Error ---");
    console.error(error);
    process.exit(1);
  });
