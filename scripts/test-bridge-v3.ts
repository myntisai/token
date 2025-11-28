import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const ETH_SEPOLIA_EID = 40161;

// LayerZero V2 Options encoding
// Format from @layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol
function encodeOptions(gasLimit: bigint, value: bigint = 0n): string {
  // Type 3 executor options for lzReceive
  // newOptions() = 0x
  // addExecutorLzReceiveOption(gas, value) adds:
  //   0x0003 (WORKER_ID for executor = 1, option type = 3)
  //   + len(gas + value) as uint16
  //   + gas as uint128
  //   + value as uint128
  
  // Simpler format - just use type 1 for basic gas
  // Type 1: just gas limit
  // 0x00 + 0x03 + 0x01 + gas(16 bytes)
  
  const gasHex = gasLimit.toString(16).padStart(32, '0');
  
  // Try with no options first (let LZ use defaults)
  return "0x";
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🌉 Testing OFT Bridge (No Custom Options)\n");
  console.log("Deployer:", deployer.address);
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  const balance = await hub.balanceOf(deployer.address);
  console.log("Hub MYNT balance:", ethers.formatEther(balance));
  
  const amountToBridge = ethers.parseEther("100");
  console.log("Amount to bridge:", ethers.formatEther(amountToBridge), "MYNT");
  
  // First, let's check quoteOFT to see limits
  console.log("\nChecking OFT limits...");
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: amountToBridge,
    minAmountLD: amountToBridge,
    extraOptions: "0x",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  try {
    const [limit, fees, receipt] = await hub.quoteOFT(sendParam);
    console.log("Min amount:", ethers.formatEther(limit.minAmountLD));
    console.log("Max amount:", ethers.formatEther(limit.maxAmountLD));
    console.log("Amount sent:", ethers.formatEther(receipt.amountSentLD));
    console.log("Amount received:", ethers.formatEther(receipt.amountReceivedLD));
  } catch (e: any) {
    console.log("quoteOFT error:", e.message);
  }
  
  // Try quoteSend with empty options
  console.log("\nTrying quoteSend...");
  try {
    const [fee] = await hub.quoteSend(sendParam, false);
    console.log("Fee quoted:", ethers.formatEther(fee.nativeFee), "ETH");
  } catch (e: any) {
    console.log("quoteSend error:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }
}

main().catch(console.error);
