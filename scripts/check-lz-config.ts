import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const ETH_SEPOLIA_EID = 40161;

const ENDPOINT_ABI = [
  "function delegates(address) view returns (address)",
  "function getSendLibrary(address sender, uint32 dstEid) view returns (address lib)",
  "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
  "function isSendLibrary(address sender, uint32 dstEid, address lib) view returns (bool)",
  "function isDefaultSendLibrary(address sender, uint32 dstEid) view returns (bool)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking LayerZero Config for OApp...\n");
  
  const endpoint = new ethers.Contract(LZ_ENDPOINT, ENDPOINT_ABI, deployer);
  
  // Check send library
  console.log("1. Send Library:");
  try {
    const sendLib = await endpoint.getSendLibrary(HUB_ADDRESS, ETH_SEPOLIA_EID);
    console.log("   Library:", sendLib);
    
    const isDefault = await endpoint.isDefaultSendLibrary(HUB_ADDRESS, ETH_SEPOLIA_EID);
    console.log("   Using default:", isDefault);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check receive library
  console.log("\n2. Receive Library:");
  try {
    const [recvLib, isDefault] = await endpoint.getReceiveLibrary(HUB_ADDRESS, ETH_SEPOLIA_EID);
    console.log("   Library:", recvLib);
    console.log("   Using default:", isDefault);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check delegate
  console.log("\n3. Delegate:");
  try {
    const delegate = await endpoint.delegates(HUB_ADDRESS);
    console.log("   Delegate:", delegate);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Now let's try calling quote directly on the endpoint with simpler params
  console.log("\n4. Testing endpoint quote...");
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Get the peer
  const peer = await hub.peers(ETH_SEPOLIA_EID);
  console.log("   Peer:", peer);
  
  // Try building a minimal message
  // OFT message format: (sendTo, amountSD)
  // amountSD = amountLD / 10^(localDecimals - sharedDecimals) = amountLD / 10^12
  const amountLD = ethers.parseEther("100");
  const amountSD = amountLD / 10n**12n; // 100 * 10^6
  
  console.log("   Amount LD:", amountLD.toString());
  console.log("   Amount SD:", amountSD.toString());
  
  // Build OFT message
  const message = ethers.solidityPacked(
    ["bytes32", "uint64"],
    [ethers.zeroPadValue(deployer.address, 32), amountSD]
  );
  console.log("   Message:", message);
  console.log("   Message length:", (message.length - 2) / 2, "bytes");
}

main().catch(console.error);
