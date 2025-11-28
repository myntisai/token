import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🌉 Bridging MYNT: Base Sepolia → Ethereum Sepolia\n");
  console.log("Deployer:", deployer.address);
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check balance
  const balance = await hub.balanceOf(deployer.address);
  console.log("Current MYNT balance:", ethers.formatEther(balance));
  
  // Amount to bridge
  const amountToBridge = ethers.parseEther("100");
  console.log("Amount to bridge:", ethers.formatEther(amountToBridge), "MYNT");
  
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: amountToBridge,
    minAmountLD: amountToBridge,
    extraOptions: "0x0003", // TYPE_3 minimal options
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  // Quote fee
  console.log("\nQuoting fee...");
  const fee = await hub.quoteSend.staticCall(sendParam, false);
  console.log("Native fee:", ethers.formatEther(fee[0]), "ETH");
  
  // Check ETH balance
  const ethBalance = await ethers.provider.getBalance(deployer.address);
  console.log("ETH balance:", ethers.formatEther(ethBalance), "ETH");
  
  if (ethBalance < fee[0]) {
    console.log("❌ Insufficient ETH");
    return;
  }
  
  // Send!
  console.log("\n🚀 Sending bridge transaction...");
  const tx = await hub.send(
    sendParam,
    { nativeFee: fee[0], lzTokenFee: 0n },
    deployer.address,
    { value: fee[0] }
  );
  
  console.log("Tx hash:", tx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("✅ Confirmed!");
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Block:", receipt.blockNumber);
  
  // Check new balance
  const newBalance = await hub.balanceOf(deployer.address);
  console.log("\nNew MYNT balance:", ethers.formatEther(newBalance));
  console.log("Tokens burned:", ethers.formatEther(balance - newBalance), "MYNT");
  
  console.log("\n📡 Track message on LayerZero Scan:");
  console.log("https://testnet.layerzeroscan.com/tx/" + tx.hash);
  console.log("\n⏳ Tokens should arrive on Ethereum Sepolia in 1-5 minutes!");
}

main().catch(console.error);
