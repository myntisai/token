import { ethers } from "hardhat";

const HUB_ADDRESS = "0xc2300D4edD794E5a61431AE0cC4922dE0771eD6E";
const SPOKE_ETH_ADDRESS = "0x0042d3E3eEd282e0896e655C2bAAA3cBE2d9AEB8";

const BASE_SEPOLIA_EID = 40245;
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  console.log("Setting up peers...");
  console.log("Network Chain ID:", chainId);
  console.log("Deployer:", deployer.address);
  
  if (chainId === 84532) {
    // On Base Sepolia - configure hub
    console.log("\n📍 Configuring Hub to know about Ethereum Spoke...");
    const hub = await ethers.getContractAt("MyntisOFT", HUB_ADDRESS);
    
    const peerBytes32 = ethers.zeroPadValue(SPOKE_ETH_ADDRESS, 32);
    console.log("Setting peer for EID", ETH_SEPOLIA_EID, "->", SPOKE_ETH_ADDRESS);
    
    const tx = await hub.setPeer(ETH_SEPOLIA_EID, peerBytes32);
    await tx.wait();
    
    console.log("✅ Hub peer set!");
    
    // Verify
    const storedPeer = await hub.peers(ETH_SEPOLIA_EID);
    console.log("Stored peer:", storedPeer);
    
  } else if (chainId === 11155111) {
    // On Ethereum Sepolia - configure spoke
    console.log("\n📍 Configuring Spoke to know about Hub...");
    const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_ETH_ADDRESS);
    
    const peerBytes32 = ethers.zeroPadValue(HUB_ADDRESS, 32);
    console.log("Setting peer for EID", BASE_SEPOLIA_EID, "->", HUB_ADDRESS);
    
    const tx = await spoke.setPeer(BASE_SEPOLIA_EID, peerBytes32);
    await tx.wait();
    
    console.log("✅ Spoke peer set!");
    
    // Verify
    const storedPeer = await spoke.peers(BASE_SEPOLIA_EID);
    console.log("Stored peer:", storedPeer);
    
  } else {
    console.log("Unknown network. Run on base-sepolia or ethereum-sepolia");
  }
}

main().catch(console.error);
