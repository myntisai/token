import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const SPOKE_ADDRESS = "0x0042d3E3eEd282e0896e655C2bAAA3cBE2d9AEB8";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Final debugging...\n");
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check enforced options
  console.log("1. Current enforced options for SEND (msgType=1):");
  try {
    const enfOpts = await hub.enforcedOptions(ETH_SEPOLIA_EID, 1);
    console.log("   ", enfOpts);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Try to get the actual options that will be used
  console.log("\n2. Combined options:");
  try {
    const combined = await hub.combineOptions(ETH_SEPOLIA_EID, 1, "0x");
    console.log("   ", combined);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check if the contract uses default options
  console.log("\n3. Testing quote with combined options directly passed:");
  try {
    const combined = await hub.combineOptions(ETH_SEPOLIA_EID, 1, "0x");
    
    const sendParam = {
      dstEid: ETH_SEPOLIA_EID,
      to: ethers.zeroPadValue(deployer.address, 32),
      amountLD: ethers.parseEther("100"),
      minAmountLD: ethers.parseEther("100"),
      extraOptions: combined, // Pass combined options directly
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const [fee] = await hub.quoteSend(sendParam, false);
    console.log("   ✅ Fee:", ethers.formatEther(fee.nativeFee), "ETH");
  } catch (e: any) {
    console.log("   Error:", e.message);
    if (e.data) {
      console.log("   Error data:", e.data);
      
      // Decode error if possible
      const selector = e.data.slice(0, 10);
      const params = "0x" + e.data.slice(10);
      console.log("   Selector:", selector);
      console.log("   Params:", params);
      
      // Known selectors
      if (selector === "0x6592671c") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint16"], params);
        console.log("   InvalidOptions, optionType:", decoded[0]);
      }
    }
  }
  
  // Try asking the send library directly
  console.log("\n4. Trying to call send library...");
  const SEND_LIB = "0xC1868e054425D378095A003EcbA3823a5D0135C9";
  const sendLibAbi = [
    "function quote(tuple(uint32 dstEid, bytes32 receiver, bytes message, bytes options, bool payInLzToken) packet, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
  ];
  
  try {
    const sendLib = new ethers.Contract(SEND_LIB, sendLibAbi, deployer);
    const packet = {
      dstEid: ETH_SEPOLIA_EID,
      receiver: await hub.peers(ETH_SEPOLIA_EID),
      message: "0x0000000000000000000000000904192498efff59e0502ae1700ecaa9b17085430000000005f5e100",
      options: "0x0003", // Just TYPE_3
      payInLzToken: false
    };
    
    const fee = await sendLib.quote(packet, false);
    console.log("   ✅ Direct quote works! Fee:", ethers.formatEther(fee.nativeFee), "ETH");
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
}

main().catch(console.error);
