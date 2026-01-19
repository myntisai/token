import { ethers } from "hardhat";

// Chain EIDs
const BASE_SEPOLIA_EID = 40245;
const ETH_SEPOLIA_EID = 40161;

// Contract addresses - UPDATE THESE after spoke deployment
const HUB_MYNTIS = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const SPOKE_MYNTIS = process.env.ETH_SEPOLIA_MYNTIS_SPOKE || "";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log("================================================================================");
  console.log("LAYERZERO PEER CONFIGURATION");
  console.log("================================================================================");
  console.log(`Network: ${network.chainId === 84532n ? "Base Sepolia (Hub)" : "Ethereum Sepolia (Spoke)"}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log();
  
  if (!SPOKE_MYNTIS) {
    console.error("❌ Set ETH_SEPOLIA_MYNTIS_SPOKE environment variable first!");
    console.log("   Run: ETH_SEPOLIA_MYNTIS_SPOKE=0x... npx hardhat run ...");
    process.exit(1);
  }
  
  // Get OFT interface
  const oftABI = [
    "function setPeer(uint32 _eid, bytes32 _peer) external",
    "function peers(uint32 _eid) external view returns (bytes32)",
    "function setEnforcedOptions(tuple(uint32 eid, uint16 msgType, bytes options)[] _enforcedOptions) external",
    "function owner() external view returns (address)"
  ];
  
  if (network.chainId === 84532n) {
    // On Base Sepolia - configure hub to accept spoke
    console.log("📌 Configuring Hub (Base Sepolia) to peer with Spoke (Ethereum Sepolia)...");
    
    const hub = new ethers.Contract(HUB_MYNTIS, oftABI, deployer);
    
    // Convert spoke address to bytes32
    const spokePeerBytes32 = ethers.zeroPadValue(SPOKE_MYNTIS, 32);
    
    // Check current peer
    const currentPeer = await hub.peers(ETH_SEPOLIA_EID);
    console.log(`Current peer for EID ${ETH_SEPOLIA_EID}: ${currentPeer}`);
    
    if (currentPeer === spokePeerBytes32) {
      console.log("✅ Peer already configured correctly!");
    } else {
      console.log(`Setting peer to: ${SPOKE_MYNTIS}`);
      const tx = await hub.setPeer(ETH_SEPOLIA_EID, spokePeerBytes32);
      await tx.wait();
      console.log(`✅ Hub peer set! TX: ${tx.hash}`);
    }
    
    console.log("\n⚠️ NEXT: Run this script on Ethereum Sepolia to configure spoke!");
    console.log(`   npx hardhat run scripts/configure-lz-peers.ts --network ethereum-sepolia`);
    
  } else if (network.chainId === 11155111n) {
    // On Ethereum Sepolia - configure spoke to accept hub
    console.log("📌 Configuring Spoke (Ethereum Sepolia) to peer with Hub (Base Sepolia)...");
    
    const spoke = new ethers.Contract(SPOKE_MYNTIS, oftABI, deployer);
    
    // Convert hub address to bytes32
    const hubPeerBytes32 = ethers.zeroPadValue(HUB_MYNTIS, 32);
    
    // Check current peer
    const currentPeer = await spoke.peers(BASE_SEPOLIA_EID);
    console.log(`Current peer for EID ${BASE_SEPOLIA_EID}: ${currentPeer}`);
    
    if (currentPeer === hubPeerBytes32) {
      console.log("✅ Peer already configured correctly!");
    } else {
      console.log(`Setting peer to: ${HUB_MYNTIS}`);
      const tx = await spoke.setPeer(BASE_SEPOLIA_EID, hubPeerBytes32);
      await tx.wait();
      console.log(`✅ Spoke peer set! TX: ${tx.hash}`);
    }
    
    console.log("\n✅ LayerZero peering complete!");
    console.log("   Hub (Base Sepolia) <-> Spoke (Ethereum Sepolia)");
    
  } else {
    console.error(`❌ Unknown network: ${network.chainId}`);
    console.log("   Run on either base-sepolia or ethereum-sepolia");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Configuration failed:", error);
    process.exit(1);
  });
