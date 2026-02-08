import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy MyntisOFTSpoke on Ethereum Sepolia
 * 
 * Hub: Base Sepolia (chainId: 84532, LZ EID: 40245)
 * Spoke: Ethereum Sepolia (chainId: 11155111, LZ EID: 40161)
 */

// LayerZero V2 Configuration
const LZ_CONFIG = {
    baseSepolia: {
        chainId: 84532,
        eid: 40245,
        endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
    },
    ethSepolia: {
        chainId: 11155111,
        eid: 40161,
        endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
    }
};

// Hub contract (Base Sepolia)
// NOTE: Keep in sync with deployments/deployment-base-sepolia-latest.json
const HUB_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";

async function main() {
    console.log("=".repeat(80));
    console.log("DEPLOY MYNTIS SPOKE OFT - ETHEREUM SEPOLIA");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);

    if (chainId !== LZ_CONFIG.ethSepolia.chainId) {
        throw new Error(`Expected Ethereum Sepolia (${LZ_CONFIG.ethSepolia.chainId}), got ${chainId}`);
    }

    // ============================================================
    // STEP 1: Deploy MyntisOFTSpoke
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 1: Deploying MyntisOFTSpoke");
    console.log("=".repeat(80));

    const SpokeFactory = await ethers.getContractFactory("MyntisOFTSpoke");
    const spoke = await SpokeFactory.deploy(
        LZ_CONFIG.ethSepolia.endpoint,
        deployer.address,
        LZ_CONFIG.baseSepolia.eid,
        LZ_CONFIG.ethSepolia.eid
    );
    await spoke.waitForDeployment();
    const spokeAddress = await spoke.getAddress();
    console.log(`  Spoke: ${spokeAddress}`);

    // ============================================================
    // STEP 2: Set Peer (Hub -> Spoke)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 3: Setting Peer to Hub (Base Sepolia)");
    console.log("=".repeat(80));

    // Convert hub address to bytes32
    const hubPeerBytes32 = ethers.zeroPadValue(HUB_MYNTIS, 32);
    console.log(`  Hub peer (bytes32): ${hubPeerBytes32}`);

    await (await spoke.setPeer(LZ_CONFIG.baseSepolia.eid, hubPeerBytes32)).wait();
    console.log(`  Peer set for Hub (EID: ${LZ_CONFIG.baseSepolia.eid})`);

    // Verify peer
    const setPeer = await spoke.peers(LZ_CONFIG.baseSepolia.eid);
    console.log(`  Verified peer: ${setPeer}`);

    // ============================================================
    // SAVE RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE!");
    console.log("=".repeat(80));

    const result = {
        network: "ethereum-sepolia",
        chainId,
        layerZeroEid: LZ_CONFIG.ethSepolia.eid,
        hubChainEid: LZ_CONFIG.baseSepolia.eid,
        contracts: {
            myntisOFTSpoke: spokeAddress
        },
        hub: HUB_MYNTIS,
        endpoint: LZ_CONFIG.ethSepolia.endpoint,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nSpoke Contract: ${result.spoke}`);
    console.log(`Hub Contract:   ${result.hub}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `ethereum-sepolia-oft-v2-spoke.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved to: ${deploymentFile}`);

    console.log(`\n${"=".repeat(80)}`);
    console.log("NEXT STEPS:");
    console.log("=".repeat(80));
    console.log(`
1. Set peer on Hub (Base Sepolia) to point to this spoke:
   
   npx hardhat run scripts/set-hub-peer.ts --network base-sepolia
   
   This will call: myntis.setPeer(${LZ_CONFIG.ethSepolia.eid}, "${ethers.zeroPadValue(spokeAddress, 32)}")

2. Test bridging:
   - Bridge from Hub to Spoke
   - Bridge from Spoke to Hub

3. Add to .env.prod:
   MYNTIS_SPOKE_ETH_SEPOLIA=${result.contracts.myntisOFTSpoke}
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
