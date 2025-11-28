import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const SPOKE_ETH_ADDRESS = "0x0042d3E3eEd282e0896e655C2bAAA3cBE2d9AEB8";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🌉 Testing OFT Bridge: Base Sepolia → Ethereum Sepolia\n");
  console.log("Deployer:", deployer.address);
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check balance
  const balance = await hub.balanceOf(deployer.address);
  console.log("Hub MYNT balance:", ethers.formatEther(balance));
  
  // Amount to bridge
  const amountToBridge = ethers.parseEther("100"); // 100 MYNT
  console.log("Amount to bridge:", ethers.formatEther(amountToBridge), "MYNT");
  
  // Build send params
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: amountToBridge,
    minAmountLD: amountToBridge,
    extraOptions: "0x", // default options
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("\nQuoting bridge fee...");
  
  try {
    // Quote the fee
    const [fee] = await hub.quoteSend(sendParam, false);
    console.log("Native fee:", ethers.formatEther(fee.nativeFee), "ETH");
    console.log("LZ token fee:", ethers.formatEther(fee.lzTokenFee), "LZ");
    
    // Check if we have enough ETH
    const ethBalance = await ethers.provider.getBalance(deployer.address);
    console.log("ETH balance:", ethers.formatEther(ethBalance), "ETH");
    
    if (ethBalance < fee.nativeFee) {
      console.log("❌ Insufficient ETH for bridge fee");
      return;
    }
    
    console.log("\n🚀 Sending bridge transaction...");
    
    const tx = await hub.send(
      sendParam,
      { nativeFee: fee.nativeFee, lzTokenFee: 0n },
      deployer.address, // refund address
      { value: fee.nativeFee }
    );
    
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Bridge tx confirmed!");
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check new balance on hub
    const newBalance = await hub.balanceOf(deployer.address);
    console.log("\nNew Hub balance:", ethers.formatEther(newBalance), "MYNT");
    console.log("Tokens burned:", ethers.formatEther(balance - newBalance), "MYNT");
    
    console.log("\n📡 Check LayerZero Scan for message status:");
    console.log("https://testnet.layerzeroscan.com/tx/" + tx.hash);
    
    console.log("\n⏳ Tokens will appear on Ethereum Sepolia in ~1-5 minutes");
    
  } catch (e: any) {
    console.log("❌ Error:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }
}

main().catch(console.error);
