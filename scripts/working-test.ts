import { ethers } from "hardhat";

const HUB_ADDRESS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing quoteSend properly...\n");
  
  const hub = await ethers.getContractAt("Myntis", HUB_ADDRESS);
  
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: ethers.parseEther("100"),
    minAmountLD: ethers.parseEther("100"),
    extraOptions: "0x0003", // Just TYPE_3
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("SendParam:", sendParam);
  
  // quoteSend returns MessagingFee struct, not a tuple
  console.log("\nCalling quoteSend...");
  try {
    const result = await hub.quoteSend.staticCall(sendParam, false);
    console.log("Raw result:", result);
    console.log("Type:", typeof result);
    
    if (result && result.nativeFee !== undefined) {
      console.log("Native fee:", ethers.formatEther(result.nativeFee), "ETH");
      console.log("LZ token fee:", ethers.formatEther(result.lzTokenFee), "LZ");
    }
  } catch (e: any) {
    console.log("Error:", e.message);
    
    // Try with different options
    console.log("\nTrying with enforced options...");
    const combined = await hub.combineOptions(ETH_SEPOLIA_EID, 1, "0x");
    console.log("Combined:", combined);
    
    const sendParam2 = { ...sendParam, extraOptions: combined };
    try {
      const result2 = await hub.quoteSend.staticCall(sendParam2, false);
      console.log("Result with combined:", result2);
    } catch (e2: any) {
      console.log("Still error:", e2.message);
    }
  }
}

main().catch(console.error);
