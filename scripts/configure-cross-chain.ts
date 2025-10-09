import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
    console.log("🔗 Configuring Cross-Chain Connections...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Configuring with account:", deployer.address);

    // Hub chain configuration (Base Sepolia)
    const HUB_CHAIN_ID = 84532;
    const HUB_CONTRACTS = {
        token: "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773",
        staking: "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6",
        emissions: "0x53F6Ad26179DD689227f15924011d34469086346",
        merkleDistributor: "0xbBe0A7517c0Dd93e508248AA4e1bcAd9AaB7F0FB",
        globalNullifier: "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1",
        bridge: "0x3b03dA886B8406a85262cafa7D70B49D3C9D29A7"
    };

    // Spoke chain configurations
    const SPOKE_CHAINS: { [key: number]: { name: string; contracts: any } } = {
        11155111: { // Ethereum Sepolia
            name: "Ethereum Sepolia",
            contracts: {
                // These would be deployed addresses from deploy-spoke-chain.ts
                token: "DEPLOYED_SPOKE_TOKEN_ADDRESS",
                distributor: "DEPLOYED_SPOKE_DISTRIBUTOR_ADDRESS",
                bridge: "DEPLOYED_SPOKE_BRIDGE_ADDRESS"
            }
        },
        421614: { // Arbitrum Sepolia
            name: "Arbitrum Sepolia", 
            contracts: {
                // These would be deployed addresses from deploy-spoke-chain.ts
                token: "DEPLOYED_SPOKE_TOKEN_ADDRESS",
                distributor: "DEPLOYED_SPOKE_DISTRIBUTOR_ADDRESS",
                bridge: "DEPLOYED_SPOKE_BRIDGE_ADDRESS"
            }
        }
    };

    const currentChainId = (await ethers.provider.getNetwork()).chainId;
    console.log(`Current Chain ID: ${currentChainId}`);

    if (currentChainId === HUB_CHAIN_ID) {
        console.log("🏛️ Configuring Hub Chain (Base Sepolia)...");
        await configureHubChain(HUB_CONTRACTS, SPOKE_CHAINS);
    } else {
        console.log("🔗 Configuring Spoke Chain...");
        await configureSpokeChain(currentChainId, HUB_CHAIN_ID, HUB_CONTRACTS);
    }
}

async function configureHubChain(hubContracts: any, spokeChains: any) {
    console.log("\n1️⃣ Configuring Hub Chain GlobalNullifier...");
    
    // Connect to GlobalNullifier
    const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
    const globalNullifier = GlobalNullifier.attach(hubContracts.globalNullifier);
    
    console.log("GlobalNullifier address:", hubContracts.globalNullifier);

    // Register spoke chains in GlobalNullifier
    for (const [chainId, config] of Object.entries(spokeChains)) {
        if (config.contracts.bridge !== "DEPLOYED_SPOKE_BRIDGE_ADDRESS") {
            console.log(`\n📝 Registering spoke chain ${chainId} (${config.name})...`);
            
            try {
                const tx = await globalNullifier.registerSpoke(
                    parseInt(chainId),
                    config.contracts.bridge
                );
                await tx.wait();
                console.log(`✅ Spoke chain ${chainId} registered`);
            } catch (error) {
                console.log(`⚠️ Failed to register spoke chain ${chainId}:`, error.message);
            }
        } else {
            console.log(`⏭️ Skipping spoke chain ${chainId} (not deployed yet)`);
        }
    }

    console.log("\n2️⃣ Configuring Hub Bridge...");
    
    // Connect to HubSpokeBridge
    const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
    const hubBridge = HubSpokeBridge.attach(hubContracts.bridge);
    
    console.log("Hub Bridge address:", hubContracts.bridge);

    // Set peers for spoke chains
    for (const [chainId, config] of Object.entries(spokeChains)) {
        if (config.contracts.bridge !== "DEPLOYED_SPOKE_BRIDGE_ADDRESS") {
            console.log(`\n🔗 Setting peer for spoke chain ${chainId}...`);
            
            try {
                // Convert address to bytes32 for LayerZero
                const peerBytes32 = ethers.utils.hexZeroPad(config.contracts.bridge, 32);
                const tx = await hubBridge.setPeer(parseInt(chainId), peerBytes32);
                await tx.wait();
                console.log(`✅ Peer set for spoke chain ${chainId}`);
            } catch (error) {
                console.log(`⚠️ Failed to set peer for spoke chain ${chainId}:`, error.message);
            }
        }
    }

    console.log("\n✅ Hub chain configuration completed!");
}

async function configureSpokeChain(currentChainId: number, hubChainId: number, hubContracts: any) {
    console.log("\n1️⃣ Configuring Spoke Bridge...");
    
    // Note: In a real deployment, you would have the deployed spoke contract addresses
    // For now, we'll show the configuration steps
    
    console.log("📋 Spoke Chain Configuration Steps:");
    console.log("1. Deploy spoke contracts using deploy-spoke-chain.ts");
    console.log("2. Set LayerZero peers between hub and spoke bridges");
    console.log("3. Register spoke contracts in hub GlobalNullifier");
    console.log("4. Test cross-chain functionality");

    console.log("\n🔗 Required Peer Configuration:");
    console.log(`Hub Chain ID: ${hubChainId}`);
    console.log(`Hub Bridge: ${hubContracts.bridge}`);
    console.log(`Current Chain ID: ${currentChainId}`);
    console.log(`Spoke Bridge: [DEPLOYED_SPOKE_BRIDGE_ADDRESS]`);

    console.log("\n📝 Manual Configuration Required:");
    console.log("1. Deploy spoke contracts first");
    console.log("2. Update this script with deployed addresses");
    console.log("3. Run configuration again");
    console.log("4. Test cross-chain transfers");

    console.log("\n⚠️ Spoke chain configuration requires deployed contracts!");
}

async function testCrossChainConnection() {
    console.log("\n🧪 Testing Cross-Chain Connection...");
    
    // This would test the actual cross-chain functionality
    // For now, just show what would be tested
    
    console.log("📋 Cross-Chain Tests:");
    console.log("1. Test token bridge from hub to spoke");
    console.log("2. Test token bridge from spoke to hub");
    console.log("3. Test reward distribution from hub to spoke");
    console.log("4. Test nullifier burn from spoke to hub");
    console.log("5. Test double-claim prevention");
    
    console.log("\n✅ Cross-chain testing framework ready!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Configuration failed:", error);
        process.exit(1);
    });
