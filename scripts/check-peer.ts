import { ethers } from "hardhat";

async function main() {
  const hubAddr = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
  const hub = await ethers.getContractAt("MyntisOFT", hubAddr);
  
  // Check if contract has peers function
  console.log("Checking hub peer storage...");
  
  // OFT uses a different peer structure - let's check the OApp base
  try {
    const peer = await hub.peers(40161);
    console.log("Peer for EID 40161:", peer);
  } catch (e) {
    console.log("Error calling peers():", e.message);
  }
  
  // Try to set peer again and check tx
  const peerBytes32 = ethers.zeroPadValue("0x0042d3E3eEd282e0896e655C2bAAA3cBE2d9AEB8", 32);
  console.log("\nSetting peer with bytes32:", peerBytes32);
  
  const tx = await hub.setPeer(40161, peerBytes32);
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Tx confirmed, gas used:", receipt.gasUsed.toString());
  
  // Check again
  const peerAfter = await hub.peers(40161);
  console.log("Peer after setting:", peerAfter);
}

main().catch(console.error);
