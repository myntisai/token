import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with various option formats...\n");
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Clear enforced options first
  console.log("Clearing enforced options...");
  try {
    await hub.setEnforcedOptions([{
      eid: ETH_SEPOLIA_EID,
      msgType: 1,
      options: "0x"
    }]);
  } catch (e) {
    console.log("Clear failed, continuing...");
  }
  
  const sendParamBase = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: ethers.parseEther("100"),
    minAmountLD: ethers.parseEther("100"),
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  // Try different option formats
  const optionFormats = [
    { name: "Empty", options: "0x" },
    { name: "Type 3 only", options: "0x0003" },
    { name: "Type 1 with 200k gas", options: "0x000100030d40" },  // Legacy type 1
    { name: "Type 2 with 200k gas", options: "0x000200030d40" },  // Legacy type 2
  ];
  
  for (const format of optionFormats) {
    console.log(`\nTrying ${format.name}: ${format.options}`);
    try {
      const sendParam = { ...sendParamBase, extraOptions: format.options };
      const [fee] = await hub.quoteSend(sendParam, false);
      console.log(`  ✅ Works! Fee: ${ethers.formatEther(fee.nativeFee)} ETH`);
    } catch (e: any) {
      console.log(`  ❌ Failed: ${e.message?.slice(0, 50)}...`);
    }
  }
  
  // Try using just combined options approach
  console.log("\n\nTrying to get combined options...");
  try {
    const combined = await hub.combineOptions(ETH_SEPOLIA_EID, 1, "0x");
    console.log("Combined options:", combined);
  } catch (e: any) {
    console.log("combineOptions error:", e.message);
  }
}

main().catch(console.error);
