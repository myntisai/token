import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy MyntisSpokeOFT on Ethereum Sepolia
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
const HUB_MYNTIS = "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55";

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
    // STEP 1: Deploy MyntisSpokeOFT Implementation
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 1: Deploying MyntisSpokeOFT Implementation");
    console.log("=".repeat(80));

    const SpokeFactory = await ethers.getContractFactory("MyntisSpokeOFT");
    const spokeImpl = await SpokeFactory.deploy();
    await spokeImpl.waitForDeployment();
    const spokeImplAddress = await spokeImpl.getAddress();
    console.log(`  Implementation: ${spokeImplAddress}`);

    // ============================================================
    // STEP 2: Deploy Proxy with Initialize
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 2: Deploying Proxy");
    console.log("=".repeat(80));

    // Encode initialize call
    const initData = SpokeFactory.interface.encodeFunctionData("initialize", [
        "Myntis",               // _name
        "MYNT",                 // _symbol
        deployer.address,       // _delegate
        LZ_CONFIG.baseSepolia.eid, // _hubChainId (LayerZero EID, not chain ID)
        HUB_MYNTIS,             // _hubToken
        LZ_CONFIG.ethSepolia.endpoint  // _endpoint
    ]);

    const SimpleProxyFactory = await ethers.getContractFactory("SimpleProxy");
    const proxy = await SimpleProxyFactory.deploy(spokeImplAddress, initData);
    await proxy.waitForDeployment();
    const spokeAddress = await proxy.getAddress();
    console.log(`  Proxy: ${spokeAddress}`);

    // Attach spoke interface
    const spoke = SpokeFactory.attach(spokeAddress);

    // Verify initialization
    const [hubChainId, hubToken, currentChainId] = await spoke.getCrossChainInfo();
    console.log(`\n  Verification:`);
    console.log(`    Hub Chain EID: ${hubChainId}`);
    console.log(`    Hub Token: ${hubToken}`);
    console.log(`    Current Chain ID: ${currentChainId}`);

    // ============================================================
    // STEP 3: Set Peer (Hub -> Spoke)
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
        spoke: spokeAddress,
        spokeImpl: spokeImplAddress,
        hub: HUB_MYNTIS,
        hubEid: LZ_CONFIG.baseSepolia.eid,
        spokeEid: LZ_CONFIG.ethSepolia.eid,
        network: "ethereum-sepolia",
        chainId,
        endpoint: LZ_CONFIG.ethSepolia.endpoint,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nSpoke Contract: ${result.spoke}`);
    console.log(`Implementation: ${result.spokeImpl}`);
    console.log(`Hub Contract:   ${result.hub}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `ethereum-sepolia-spoke-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved to: ${deploymentFile}`);

    const latestFile = path.join(deploymentDir, `ethereum-sepolia-spoke-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

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
   MYNTIS_SPOKE_ETH_SEPOLIA=${result.spoke}
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
