import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const ETH_SEPOLIA_EID = 40161;

// Build executor options manually
// Format: 0x0003 (type) + 01 (worker type = executor) + 00030d40 (gas limit 200000 in hex) + 00 (value 0)
function buildOptions(gasLimit: number): string {
  // Option Type 3 for lzReceive
  // Type 3 format: 0x0003 + 01 (executor) + gas (32 bytes) + value (32 bytes)
  const gasHex = gasLimit.toString(16).padStart(32, '0');
  const valueHex = '0'.padStart(32, '0');
  return '0x000301' + gasHex + valueHex;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🌉 Testing OFT Bridge with Executor Options\n");
  console.log("Deployer:", deployer.address);
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check balance
  const balance = await hub.balanceOf(deployer.address);
  console.log("Hub MYNT balance:", ethers.formatEther(balance));
  
  // Amount to bridge
  const amountToBridge = ethers.parseEther("100");
  console.log("Amount to bridge:", ethers.formatEther(amountToBridge), "MYNT");
  
  // Build options with 200k gas limit
  const options = buildOptions(200000);
  console.log("Executor options:", options);
  
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: amountToBridge,
    minAmountLD: amountToBridge,
    extraOptions: options,
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("\nQuoting bridge fee...");
  
  try {
    const [fee] = await hub.quoteSend(sendParam, false);
    console.log("Native fee:", ethers.formatEther(fee.nativeFee), "ETH");
    
    const ethBalance = await ethers.provider.getBalance(deployer.address);
    console.log("ETH balance:", ethers.formatEther(ethBalance), "ETH");
    
    if (ethBalance < fee.nativeFee) {
      console.log("❌ Insufficient ETH");
      return;
    }
    
    console.log("\n🚀 Sending...");
    
    const tx = await hub.send(
      sendParam,
      { nativeFee: fee.nativeFee, lzTokenFee: 0n },
      deployer.address,
      { value: fee.nativeFee }
    );
    
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Confirmed! Gas:", receipt.gasUsed.toString());
    
    const newBalance = await hub.balanceOf(deployer.address);
    console.log("\nNew balance:", ethers.formatEther(newBalance), "MYNT");
    
    console.log("\n📡 LayerZero Scan: https://testnet.layerzeroscan.com/tx/" + tx.hash);
    
  } catch (e: any) {
    console.log("❌ Error:", e.message);
    
    // Decode error if possible
    if (e.data) {
      console.log("Error data:", e.data);
      // Try to decode known error selectors
      const selector = e.data.slice(0, 10);
      console.log("Error selector:", selector);
    }
  }
}

main().catch(console.error);
