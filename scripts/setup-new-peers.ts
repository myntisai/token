import { ethers } from "hardhat";

const HUB_NEW = "0xE1eFd4598Cb371035F78dD3eb4151A7498F9dEa4";
const SPOKE_NEW = "0x6d059168ae5250c8637b7EFc3343F5509BB0118B";
const BASE_SEPOLIA_EID = 40245;
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  console.log("Setting up peers for NEW contracts...");
  console.log("Network Chain ID:", chainId);
  
  if (chainId === 84532) {
    // Base Sepolia - Hub
    console.log("\n📍 Configuring NEW Hub...");
    const hub = await ethers.getContractAt("MyntisOFT", HUB_NEW);
    
    // Set peer
    const peerBytes32 = ethers.zeroPadValue(SPOKE_NEW, 32);
    console.log("Setting peer for EID", ETH_SEPOLIA_EID);
    const tx = await hub.setPeer(ETH_SEPOLIA_EID, peerBytes32);
    await tx.wait();
    console.log("✅ Peer set!");
    
    // Set delegate
    console.log("Setting delegate...");
    const delTx = await hub.setDelegate(deployer.address);
    await delTx.wait();
    console.log("✅ Delegate set!");
    
    // Set enforced options
    console.log("Setting enforced options...");
    const options = "0x00030100210100000000000000000000000000030d4000000000000000000000000000000000";
    const enforcedParams = [{ eid: ETH_SEPOLIA_EID, msgType: 1, options: options }];
    const optTx = await hub.setEnforcedOptions(enforcedParams);
    await optTx.wait();
    console.log("✅ Enforced options set!");
    
    // Mint test tokens
    console.log("Minting test tokens...");
    const mintTx = await hub.mintImmediate(deployer.address, ethers.parseEther("10000"));
    await mintTx.wait();
    console.log("✅ 10,000 MYNT minted!");
    
  } else if (chainId === 11155111) {
    // Ethereum Sepolia - Spoke
    console.log("\n📍 Configuring NEW Spoke...");
    const spoke = await ethers.getContractAt("MyntisOFTSpoke", SPOKE_NEW);
    
    const peerBytes32 = ethers.zeroPadValue(HUB_NEW, 32);
    console.log("Setting peer for EID", BASE_SEPOLIA_EID);
    const tx = await spoke.setPeer(BASE_SEPOLIA_EID, peerBytes32);
    await tx.wait();
    console.log("✅ Peer set!");
  }
  
  console.log("\n✅ Configuration complete!");
}

main().catch(console.error);
