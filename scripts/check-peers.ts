import { ethers } from "hardhat";

const HUB_MYNTIS = "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55";
const SPOKE_ETH_SEPOLIA = "0xdB59bb54c01aBe6DF427a7994AeDD986083D18D4";
const ETH_SEPOLIA_EID = 40161;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Checking peers on Base Sepolia...\n");
    
    const Myntis = await ethers.getContractFactory("Myntis");
    const hub = Myntis.attach(HUB_MYNTIS);
    
    // Check peers mapping from OAppCore
    const peer = await hub.peers(ETH_SEPOLIA_EID);
    console.log(`Peer for ETH Sepolia (EID ${ETH_SEPOLIA_EID}): ${peer}`);
    
    const expectedPeer = ethers.zeroPadValue(SPOKE_ETH_SEPOLIA, 32);
    console.log(`Expected: ${expectedPeer}`);
    console.log(`Match: ${peer.toLowerCase() === expectedPeer.toLowerCase() ? '✅' : '❌'}`);
    
    // Try to get owner
    const owner = await hub.owner();
    console.log(`\nHub owner: ${owner}`);
    console.log(`Deployer:  ${deployer.address}`);
    console.log(`Is owner: ${owner.toLowerCase() === deployer.address.toLowerCase() ? '✅' : '❌'}`);
}

main().catch(console.error);
