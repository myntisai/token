import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const ETH_SEPOLIA_EID = 40161;

// Build enforced options using the proper encoding
// Reference: https://docs.layerzero.network/v2/developers/evm/oapp/overview#setting-enforced-options
function buildEnforcedOptions(gasLimit: number): string {
  // Option type 3 = lzReceive option
  // Format: 0x0003 + workerType (01 = executor) + gas as uint128 + value as uint128
  
  // Simpler: use raw hex encoding
  // The format is: TYPE_3 | WORKER_ID | GAS | VALUE
  const type = "0003"; // Option type 3
  const workerId = "01"; // Executor worker
  const gas = gasLimit.toString(16).padStart(32, '0');
  const value = "00000000000000000000000000000000"; // 0 value
  
  return "0x" + type + workerId + gas + value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting Enforced Options on OFT...\n");
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Build options with 200k gas
  const options = buildEnforcedOptions(200000);
  console.log("Options bytes:", options);
  
  // Check if setEnforcedOptions exists
  console.log("\nChecking for setEnforcedOptions function...");
  try {
    // For OFT V2, we need to call setEnforcedOptions
    // params: (EnforcedOptionParam[] calldata _enforcedOptions)
    // EnforcedOptionParam = { uint32 eid, uint16 msgType, bytes options }
    
    // Message types: 1 = SEND, 2 = SEND_AND_CALL
    const enforcedParams = [{
      eid: ETH_SEPOLIA_EID,
      msgType: 1, // SEND
      options: options
    }];
    
    console.log("Setting enforced options...");
    const tx = await hub.setEnforcedOptions(enforcedParams);
    await tx.wait();
    console.log("✅ Enforced options set!");
    
  } catch (e: any) {
    console.log("Error:", e.message);
    
    // Try alternate approach - check if combineOptions exists
    try {
      console.log("\nTrying to query enforced options...");
      const enforcedOpts = await hub.enforcedOptions(ETH_SEPOLIA_EID, 1);
      console.log("Current enforced options:", enforcedOpts);
    } catch (e2: any) {
      console.log("Query error:", e2.message);
    }
  }
}

main().catch(console.error);
