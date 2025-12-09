import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Set peer on Hub (Base Sepolia) to point to Spoke (Ethereum Sepolia)
 */

// LayerZero V2 Configuration
const LZ_CONFIG = {
    baseSepolia: {
        chainId: 84532,
        eid: 40245,
    },
    ethSepolia: {
        chainId: 11155111,
        eid: 40161,
    }
};

// Deployed contracts
const HUB_MYNTIS = "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55";
const SPOKE_ETH_SEPOLIA = "0xdB59bb54c01aBe6DF427a7994AeDD986083D18D4";

async function main() {
    console.log("=".repeat(80));
    console.log("SET HUB PEER - BASE SEPOLIA");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);

    if (chainId !== LZ_CONFIG.baseSepolia.chainId) {
        throw new Error(`Expected Base Sepolia (${LZ_CONFIG.baseSepolia.chainId}), got ${chainId}`);
    }

    // Get Hub contract
    const Myntis = await ethers.getContractFactory("Myntis");
    const hub = Myntis.attach(HUB_MYNTIS);

    console.log(`\nHub contract: ${HUB_MYNTIS}`);
    console.log(`Spoke contract: ${SPOKE_ETH_SEPOLIA}`);

    // Convert spoke address to bytes32
    const spokePeerBytes32 = ethers.zeroPadValue(SPOKE_ETH_SEPOLIA, 32);
    console.log(`Spoke peer (bytes32): ${spokePeerBytes32}`);

    // Set peer
    console.log(`\nSetting peer for Ethereum Sepolia (EID: ${LZ_CONFIG.ethSepolia.eid})...`);
    const tx = await hub.setPeer(LZ_CONFIG.ethSepolia.eid, spokePeerBytes32);
    console.log(`Transaction: ${tx.hash}`);
    await tx.wait();
    console.log(`Done!`);

    // Verify
    const setPeer = await hub.peers(LZ_CONFIG.ethSepolia.eid);
    console.log(`\nVerified peer: ${setPeer}`);
    console.log(`Expected:      ${spokePeerBytes32}`);
    console.log(`Match: ${setPeer.toLowerCase() === spokePeerBytes32.toLowerCase() ? '✅' : '❌'}`);

    console.log(`\n${"=".repeat(80)}`);
    console.log("CROSS-CHAIN SETUP COMPLETE!");
    console.log("=".repeat(80));
    console.log(`
Hub (Base Sepolia):     ${HUB_MYNTIS}
  -> Peer to EID ${LZ_CONFIG.ethSepolia.eid}: ${SPOKE_ETH_SEPOLIA}

Spoke (ETH Sepolia):    ${SPOKE_ETH_SEPOLIA}
  -> Peer to EID ${LZ_CONFIG.baseSepolia.eid}: ${HUB_MYNTIS}

You can now bridge tokens between Base Sepolia and Ethereum Sepolia!
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
