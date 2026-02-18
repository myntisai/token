import { ethers } from "hardhat";

const HUB_ADDRESS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const ETH_SEPOLIA_EID = 40161;

// Build options using proper LayerZero V2 format
// Reference: https://docs.layerzero.network/v2/developers/evm/gas-settings/options
function buildOptions(gas: bigint, value: bigint = 0n): string {
  // TYPE_3 = 0x0003
  // Then executor option: WORKER_TYPE (1 byte) + OPTION_TYPE (1 byte) + length (2 bytes) + data
  // WORKER_TYPE = 0x01 (executor)
  // OPTION_TYPE for lzReceive = 0x01
  // data = gas (16 bytes) + value (16 bytes) = 32 bytes, so length = 0x0021 (33 bytes including option type)
  
  // Format from ExecutorOptions.sol:
  // OPTION_TYPE_LZRECEIVE = 1
  // encodeLzReceiveOption(gas, value) = abi.encodePacked(OPTION_TYPE_LZRECEIVE, gas, value)
  // addExecutorOption adds: WORKER_TYPE (01) + length (2 bytes) + option
  
  // Full format: 0x0003 (type3) + 0x01 (worker) + 0x0021 (length 33) + 0x01 (lzReceive) + gas(16) + value(16)
  
  const type3 = "0003";
  const workerType = "01"; // Executor
  const optionType = "01"; // lzReceive
  const gasHex = gas.toString(16).padStart(32, '0');
  const valueHex = value.toString(16).padStart(32, '0');
  const optionData = optionType + gasHex + valueHex; // 1 + 32 + 32 = 65 bytes = 0x0041
  const length = (optionData.length / 2).toString(16).padStart(4, '0');
  
  return "0x" + type3 + workerType + length + optionData;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing enforced options...\n");
  
  const hub = await ethers.getContractAt("Myntis", HUB_ADDRESS);
  
  // Build proper options
  const options = buildOptions(400000n);
  console.log("Options hex:", options);
  console.log("Options length:", (options.length - 2) / 2, "bytes");
  
  // Set enforced options with correct format
  const enforcedParams = [{
    eid: ETH_SEPOLIA_EID,
    msgType: 1,
    options: options
  }];
  
  console.log("\nSetting enforced options...");
  try {
    const tx = await hub.setEnforcedOptions(enforcedParams);
    await tx.wait();
    console.log("✅ Set!");
    
    // Now try quoteSend
    console.log("\nTesting quoteSend...");
    const sendParam = {
      dstEid: ETH_SEPOLIA_EID,
      to: ethers.zeroPadValue(deployer.address, 32),
      amountLD: ethers.parseEther("100"),
      minAmountLD: ethers.parseEther("100"),
      extraOptions: "0x",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const [fee] = await hub.quoteSend(sendParam, false);
    console.log("✅ Quote successful!");
    console.log("Native fee:", ethers.formatEther(fee.nativeFee), "ETH");
    
  } catch (e: any) {
    console.log("Error:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }
}

main().catch(console.error);
