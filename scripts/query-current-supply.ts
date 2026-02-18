import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("📊 MYNTIS CURRENT CIRCULATING SUPPLY QUERY");
    console.log("=".repeat(80));
    console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
    console.log("=".repeat(80));

    // Contract addresses from deployment history (December 28, 2025)
    // Current production contracts on Base Sepolia
    // NOTE: Using explicit current address to avoid old contract from env vars
    const MYNTIS_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8"; // Current production token
    const GLOBAL_SUPPLY_REGISTRY = "0xFBD4a2b0c095dbF14Be62B784c01d4baFaFa57d7"; // Current registry
    
    console.log(`\n📍 Using Current Production Contracts:`);
    console.log(`   Token: ${MYNTIS_TOKEN}`);
    console.log(`   Registry: ${GLOBAL_SUPPLY_REGISTRY}`);

    // Chain IDs and EIDs
    const CHAINS = [
        { name: "Base Sepolia (Hub)", chainId: 84532, eid: 40245 },
        { name: "Ethereum Sepolia", chainId: 11155111, eid: 40161 },
        { name: "Arbitrum Sepolia", chainId: 421614, eid: 40231 },
        { name: "Optimism Sepolia", chainId: 11155420, eid: 40232 },
        { name: "zkSync Sepolia", chainId: 300, eid: 40305 },
    ];

    try {
        // Get token contract - try both contract names
        let token;
        try {
            const TokenFactory = await ethers.getContractFactory("Myntis");
            token = TokenFactory.attach(MYNTIS_TOKEN);
            // Test if contract is accessible
            await token.name();
        } catch (error) {
            // Try alternative contract name
            try {
                const TokenFactory = await ethers.getContractFactory("MyntisToken");
                token = TokenFactory.attach(MYNTIS_TOKEN);
                await token.name();
            } catch (error2) {
                throw new Error(`Could not connect to token at ${MYNTIS_TOKEN}. Tried both Myntis and MyntisToken.`);
            }
        }

        // Get GlobalSupplyRegistry contract
        const RegistryFactory = await ethers.getContractFactory("GlobalSupplyRegistry");
        const registry = RegistryFactory.attach(GLOBAL_SUPPLY_REGISTRY);

        console.log("\n🔍 Querying Hub Chain (Base Sepolia)...\n");

        // Query hub token supply
        const hubTotalSupply = await token.totalSupply();
        const hubSupplyFormatted = ethers.formatEther(hubTotalSupply);
        
        console.log(`✅ Hub Token Supply: ${hubSupplyFormatted} MYNT`);
        console.log(`   Contract: ${MYNTIS_TOKEN}`);

        // Query GlobalSupplyRegistry
        try {
            const globalCap = await registry.globalCap();
            const totalCrossChainSupply = await registry.totalCrossChainSupply();
            
            console.log(`\n🌐 Global Supply Registry:`);
            console.log(`   Global Cap: ${ethers.formatEther(globalCap)} MYNT`);
            console.log(`   Total Cross-Chain Supply: ${ethers.formatEther(totalCrossChainSupply)} MYNT`);
            
            // Query per-chain supplies
            console.log(`\n📊 Per-Chain Supply Breakdown:`);
            let totalFromRegistry = 0n;
            
            for (const chain of CHAINS) {
                try {
                    const chainSupply = await registry.chainSupply(chain.eid);
                    const chainSupplyFormatted = ethers.formatEther(chainSupply);
                    const percentage = chainSupply > 0n 
                        ? (Number(chainSupply * 10000n / totalCrossChainSupply) / 100).toFixed(2)
                        : "0.00";
                    
                    console.log(`   ${chain.name}:`);
                    console.log(`      Supply: ${chainSupplyFormatted} MYNT (${percentage}%)`);
                    totalFromRegistry += chainSupply;
                } catch (error: any) {
                    console.log(`   ${chain.name}: Error querying - ${error.message}`);
                }
            }
            
            console.log(`\n📈 Summary:`);
            console.log(`   Hub Token Supply: ${hubSupplyFormatted} MYNT`);
            console.log(`   Global Registry Total: ${ethers.formatEther(totalCrossChainSupply)} MYNT`);
            console.log(`   Registry Sum (per-chain): ${ethers.formatEther(totalFromRegistry)} MYNT`);
            console.log(`   Max Supply: ${ethers.formatEther(globalCap)} MYNT`);
            console.log(`   Circulating %: ${(Number(totalCrossChainSupply * 10000n / globalCap) / 100).toFixed(2)}%`);
            
            // Calculate difference (should be minimal if registry is synced)
            const diff = hubTotalSupply > totalCrossChainSupply 
                ? hubTotalSupply - totalCrossChainSupply 
                : totalCrossChainSupply - hubTotalSupply;
            
            if (diff > 0n) {
                console.log(`\n⚠️  Note: Hub supply and registry supply differ by ${ethers.formatEther(diff)} MYNT`);
            } else {
                console.log(`\n✅ Hub supply matches global registry`);
            }

        } catch (error: any) {
            console.log(`\n⚠️  Could not query GlobalSupplyRegistry: ${error.message}`);
            console.log(`   Using hub token supply only: ${hubSupplyFormatted} MYNT`);
        }

        // Query spoke chains if we have the addresses
        console.log(`\n🔗 Spoke Chain Supplies:`);
        const spokeAddresses: Record<string, string> = {
            "Ethereum Sepolia": process.env.ETH_SEPOLIA_MYNTIS_SPOKE || "0x1C1d3709755395BD00A0DB914a956160D72e0E8F",
            "Arbitrum Sepolia": process.env.ARB_SEPOLIA_MYNTIS_SPOKE || "0x0E44351d2e08A96C6D228b1E94E943800C4C91F9",
            "Optimism Sepolia": process.env.OP_SEPOLIA_MYNTIS_SPOKE || "0x0E44351d2e08A96C6D228b1E94E943800C4C91F9",
            "zkSync Sepolia": process.env.ZKSYNC_SEPOLIA_MYNTIS_SPOKE || "0x791d22C9183f49a6AB3eb22805ACC0DEF01335B1",
        };

        // Note: To query spoke chains, we'd need to switch networks
        // For now, we'll rely on the GlobalSupplyRegistry data
        console.log(`   (Spoke supplies tracked in GlobalSupplyRegistry above)`);

    } catch (error: any) {
        console.error(`\n❌ Error querying supply: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
