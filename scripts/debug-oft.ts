import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Debugging OFT setup...\n");
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
  
  // Check endpoint
  console.log("1. Checking endpoint...");
  try {
    const endpoint = await hub.endpoint();
    console.log("   Endpoint:", endpoint);
    console.log("   Expected:", LZ_ENDPOINT);
    console.log("   Match:", endpoint.toLowerCase() === LZ_ENDPOINT.toLowerCase());
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check owner/delegate
  console.log("\n2. Checking owner...");
  try {
    const owner = await hub.owner();
    console.log("   Owner:", owner);
    console.log("   Deployer:", deployer.address);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check peers
  console.log("\n3. Checking peers...");
  try {
    const peer = await hub.peers(40161);
    console.log("   Peer for EID 40161:", peer);
    const isPeerSet = peer !== ethers.zeroPadValue("0x0000000000000000000000000000000000000000", 32);
    console.log("   Peer is set:", isPeerSet);
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check OFT version
  console.log("\n4. Checking OFT version...");
  try {
    const [interfaceId, version] = await hub.oftVersion();
    console.log("   Interface ID:", interfaceId);
    console.log("   Version:", version.toString());
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Check token info
  console.log("\n5. Token info...");
  console.log("   Name:", await hub.name());
  console.log("   Symbol:", await hub.symbol());
  console.log("   Decimals:", await hub.decimals());
  console.log("   Shared decimals:", await hub.sharedDecimals());
}

main().catch(console.error);
