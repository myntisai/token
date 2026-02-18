import { ethers } from "hardhat";

// Manual encoding of LZ options (ExecutorLzReceiveOption with 400k gas)
// Format: 0x0003 (version) + 0x01 (type: lzReceive) + length + gas (16 bytes) + value (16 bytes)
function buildLzReceiveOption(gasLimit: bigint, nativeValue: bigint = 0n): string {
  // Option type 1 = lzReceive
  const optionType = "01";
  // Gas limit as 16 bytes hex
  const gasHex = gasLimit.toString(16).padStart(32, '0');
  // Native value as 16 bytes hex  
  const valueHex = nativeValue.toString(16).padStart(32, '0');
  // Length = 1 (type) + 16 (gas) + 16 (value) = 33 bytes = 0x0021
  return "0x0003" + optionType + gasHex + valueHex;
}

async function main() {
  const [signer] = await ethers.getSigners();
  
  const token = await ethers.getContractAt("Myntis", "0x599016bF00eE23d531223c6285C92aa0cAC278EF");
  
  const ETH_SEPOLIA_EID = 40161;
  const amountToSend = ethers.parseEther("100");
  
  console.log("=== BRIDGING 100 MYNT TO ETHEREUM SEPOLIA ===");
  console.log("From:", signer.address);
  console.log("Amount:", ethers.formatEther(amountToSend), "MYNT");
  console.log("Balance:", ethers.formatEther(await token.balanceOf(signer.address)), "MYNT");
  const peer = await token.peers(ETH_SEPOLIA_EID);
  console.log("Peer bytes32:", peer);
  
  // Build proper extraOptions with gas limit for destination chain
  const extraOptions = "0x0003";
  
  console.log("\nExtra options (hex):", extraOptions);
  
  // Prepare SendParam struct
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(signer.address, 32),
    amountLD: amountToSend,
    minAmountLD: amountToSend * 95n / 100n,
    extraOptions: extraOptions,
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("\nGetting quote...");
  let nativeFee: bigint;
  try {
    [nativeFee] = await token.quoteSend(sendParam, false);
    console.log("Native fee:", ethers.formatEther(nativeFee), "ETH");
  } catch (error: any) {
    console.error("quoteSend failed:", error?.shortMessage || error?.message || error);
    if (error?.data) {
      try {
        const decoded = token.interface.parseError(error.data);
        console.error("Decoded error:", decoded?.name, decoded?.args);
      } catch {
        // ignore decode errors
      }
    }
    throw error;
  }
  
  console.log("\nSending tokens...");
  const tx = await token.send(
    sendParam,
    { nativeFee, lzTokenFee: 0n },
    signer.address,
    { value: nativeFee }
  );
  console.log("TX:", tx.hash);
  
  const receipt = await tx.wait();
  console.log("✅ Bridge TX confirmed in block:", receipt?.blockNumber);
  
  console.log("\nBalance after:", ethers.formatEther(await token.balanceOf(signer.address)), "MYNT");
  console.log("\n🌉 Tokens bridged! Check Ethereum Sepolia in ~2 minutes.");
  console.log("   LayerZero Scan: https://layerzeroscan.com/tx/" + tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
