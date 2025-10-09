import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
    console.log("🚀 Deploying Myntis Spoke Chain Contracts...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Hub chain configuration (Base Sepolia)
    const HUB_CHAIN_ID = 84532; // Base Sepolia
    const HUB_TOKEN_ADDRESS = "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773";
    const HUB_GLOBAL_NULLIFIER = "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1";
    const HUB_MERKLE_DISTRIBUTOR = "0xbBe0A7517c0Dd93e508248AA4e1bcAd9AaB7F0FB";
    
    // LayerZero endpoint addresses
    const LZ_ENDPOINTS: { [key: number]: string } = {
        84532: "0x6EDCE65403992e310A62460808c4b910D972f10f", // Base Sepolia
        11155111: "0x6EDCE65403992e310A62460808c4b910D972f10f", // Ethereum Sepolia
        421614: "0x6EDCE65403992e310A62460808c4b910D972f10f", // Arbitrum Sepolia
    };

    const currentChainId = (await ethers.provider.getNetwork()).chainId;
    const lzEndpoint = LZ_ENDPOINTS[currentChainId];
    
    if (!lzEndpoint) {
        throw new Error(`LayerZero endpoint not configured for chain ${currentChainId}`);
    }

    console.log(`\n📋 Chain Configuration:`);
    console.log(`Current Chain ID: ${currentChainId}`);
    console.log(`LayerZero Endpoint: ${lzEndpoint}`);
    console.log(`Hub Chain ID: ${HUB_CHAIN_ID}`);
    console.log(`Hub Token: ${HUB_TOKEN_ADDRESS}`);
    console.log(`Hub Global Nullifier: ${HUB_GLOBAL_NULLIFIER}`);

    // 1. Deploy MyntisSpoke Token
    console.log("\n1️⃣ Deploying MyntisSpoke Token...");
    const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
    const spokeToken = await MyntisSpoke.deploy(
        "Myntis Spoke", // name
        "MYNTS", // symbol (different from hub)
        HUB_CHAIN_ID,
        HUB_TOKEN_ADDRESS,
        deployer.address // admin
    );
    await spokeToken.deployed();
    console.log(`✅ MyntisSpoke deployed to: ${spokeToken.address}`);

    // 2. Deploy SpokeDistributor
    console.log("\n2️⃣ Deploying SpokeDistributor...");
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
        HUB_CHAIN_ID,
        HUB_GLOBAL_NULLIFIER,
        spokeToken.address,
        deployer.address // admin
    );
    await spokeDistributor.deployed();
    console.log(`✅ SpokeDistributor deployed to: ${spokeDistributor.address}`);

    // 3. Deploy HubSpokeBridge
    console.log("\n3️⃣ Deploying HubSpokeBridge...");
    const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
    const bridge = await HubSpokeBridge.deploy(
        lzEndpoint,
        deployer.address, // owner
        spokeToken.address,
        spokeDistributor.address,
        HUB_GLOBAL_NULLIFIER,
        HUB_CHAIN_ID,
        false // isHub = false for spoke chains
    );
    await bridge.deployed();
    console.log(`✅ HubSpokeBridge deployed to: ${bridge.address}`);

    // 4. Configure roles and permissions
    console.log("\n4️⃣ Configuring roles and permissions...");
    
    // Grant bridge role to bridge contract
    await spokeToken.setBridgeRole(bridge.address, true);
    console.log(`✅ Bridge role granted to HubSpokeBridge`);

    // Grant bridge role to spoke distributor
    await bridge.setBridgeRole(spokeDistributor.address, true);
    console.log(`✅ Bridge role granted to SpokeDistributor`);

    // 5. Verify deployments
    console.log("\n5️⃣ Verifying deployments...");
    
    const tokenInfo = await spokeToken.getContractInfo();
    console.log(`Token Info:`, {
        name: tokenInfo.name_,
        symbol: tokenInfo.symbol_,
        totalSupply: tokenInfo.totalSupply_.toString(),
        hubChainId: tokenInfo.hubChainId_,
        hubTokenAddress: tokenInfo.hubTokenAddress_,
        paused: tokenInfo.paused_
    });

    const distributorInfo = await spokeDistributor.getHubInfo();
    console.log(`Distributor Hub Info:`, {
        chainId: distributorInfo.chainId,
        globalNullifier: distributorInfo.globalNullifier
    });

    const bridgeInfo = await bridge.getContractInfo();
    console.log(`Bridge Info:`, {
        token: bridgeInfo.token_,
        merkleDistributor: bridgeInfo.merkleDistributor_,
        globalNullifier: bridgeInfo.globalNullifier_,
        hubChainId: bridgeInfo.hubChainId_,
        isHub: bridgeInfo.isHub_,
        isHubChain: bridgeInfo.isHubChain
    });

    // 6. Save deployment info
    const deploymentInfo = {
        chainId: currentChainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            MyntisSpoke: spokeToken.address,
            SpokeDistributor: spokeDistributor.address,
            HubSpokeBridge: bridge.address
        },
        configuration: {
            hubChainId: HUB_CHAIN_ID,
            hubTokenAddress: HUB_TOKEN_ADDRESS,
            hubGlobalNullifier: HUB_GLOBAL_NULLIFIER,
            hubMerkleDistributor: HUB_MERKLE_DISTRIBUTOR,
            lzEndpoint: lzEndpoint
        }
    };

    console.log("\n📄 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    console.log("\n🎉 Spoke chain deployment completed successfully!");
    console.log("\n📋 Next Steps:");
    console.log("1. Configure LayerZero peers between hub and spoke");
    console.log("2. Register spoke contracts in hub GlobalNullifier");
    console.log("3. Test cross-chain token transfers");
    console.log("4. Test cross-chain reward distribution");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
