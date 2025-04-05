// scripts/simulate-bridge.ts
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();

  // Retrieve the bridge address from the environment
  const bridgeAddress = process.env.MYNTIS_BRIDGE_LOCAL_ADDRESS;
  console.log("Bridge address from .env:", bridgeAddress);
  if (!bridgeAddress) {
    throw new Error("MYNTIS_BRIDGE_LOCAL_ADDRESS is not defined in .env");
  }

  // Attach to the deployed MyntisBridge contract using getContractAt
  const bridge = await ethers.getContractAt("MyntisBridge", bridgeAddress);

  // Diagnostic: log all available function signatures from the contract's interface
  console.log("All available contract function signatures:");
  console.log(Object.keys(bridge.interface.getFunction("bridgeMYNT")));

  // Simulation parameters:
  const dstChainId = 40161;
  const amountToBridge = ethers.parseEther("10");
  const fee = ethers.parseEther("0.02");

  console.log("Simulating bridgeMYNT call...");
  console.log(`Destination chain id: ${dstChainId}`);
  console.log(`Amount to bridge: ${ethers.formatEther(amountToBridge)} MYNT`);
  console.log(`Fee: ${ethers.formatEther(fee)} ETH`);

  try {
   bridge.bridgeMYNT(
      dstChainId,
      amountToBridge,
      signer.address,
      false, // not a provider reward
      { value: fee, gasLimit: 500000 }
    );
    console.log("Simulation succeeded: the bridgeMYNT call would have succeeded.");
  } catch (error: any) {
    console.error("Simulation failed with error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
