import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const ETH_SEPOLIA_EID = 40161;

// Minimal endpoint interface
const ENDPOINT_ABI = [
  "function delegates(address) view returns (address)",
  "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
  "function defaultSendLibrary(uint32 dstEid) view returns (address)",
  "function defaultReceiveLibrary(uint32 srcEid) view returns (address)",
  "function quote(tuple(uint32 dstEid, bytes32 receiver, bytes message, bytes options, bool payInLzToken) params, address sender) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking LayerZero Endpoint Configuration...\n");
  
  const endpoint = new ethers.Contract(LZ_ENDPOINT, ENDPOINT_ABI, deployer);
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check delegate
  console.log("1. Checking delegate for OApp...");
  try {
    const delegate = await endpoint.delegates(HUB_ADDRESS);
    console.log("   Delegate:", delegate);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check send library
  console.log("\n2. Checking send library for EID", ETH_SEPOLIA_EID, "...");
  try {
    const sendLib = await endpoint.defaultSendLibrary(ETH_SEPOLIA_EID);
    console.log("   Send Library:", sendLib);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check receive library
  console.log("\n3. Checking receive library for EID", ETH_SEPOLIA_EID, "...");
  try {
    const recvLib = await endpoint.defaultReceiveLibrary(ETH_SEPOLIA_EID);
    console.log("   Receive Library:", recvLib);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Try direct quote from endpoint
  console.log("\n4. Trying direct quote from endpoint...");
  const peerBytes32 = await hub.peers(ETH_SEPOLIA_EID);
  const message = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256"],
    [ethers.zeroPadValue(deployer.address, 32), ethers.parseEther("100")]
  );
  
  try {
    const params = {
      dstEid: ETH_SEPOLIA_EID,
      receiver: peerBytes32,
      message: message,
      options: "0x",
      payInLzToken: false
    };
    const fee = await endpoint.quote(params, HUB_ADDRESS);
    console.log("   Fee:", ethers.formatEther(fee.nativeFee), "ETH");
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check if we need to set delegate
  console.log("\n5. Checking OApp endpoint delegate...");
  try {
    const oappEndpoint = await hub.endpoint();
    console.log("   OApp Endpoint:", oappEndpoint);
    
    // Try calling setDelegate
    console.log("\n6. Setting delegate on endpoint...");
    const setDelegateTx = await hub.setDelegate(deployer.address);
    await setDelegateTx.wait();
    console.log("   Delegate set!");
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
}

main().catch(console.error);
