import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("🌾 QUERYING HARVEST HISTORY FROM STAKING CONTRACT\n");
    console.log("=".repeat(80));

    const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e";
    
    if (!ethers.isAddress(STAKING_CONTRACT_ADDRESS)) {
        throw new Error("Invalid STAKING_CONTRACT_ADDRESS");
    }

    console.log(`Staking Contract: ${STAKING_CONTRACT_ADDRESS}\n`);

    // Get the contract instance
    const StakingFactory = await ethers.getContractFactory("StakingContract");
    const staking = StakingFactory.attach(STAKING_CONTRACT_ADDRESS);

    // Get provider address (from env or use deployer)
    const [deployer] = await ethers.getSigners();
    const providerAddress = process.env.PROVIDER_ADDRESS || deployer.address;
    console.log(`Provider Address: ${providerAddress}\n`);

    // Query Harvested events in chunks to avoid block range limits
    // Event: Harvested(address indexed provider, uint256 amount)
    const harvestedEventFilter = staking.filters.Harvested(providerAddress);
    
    console.log("🔍 Querying Harvested events...");
    console.log("(Querying in chunks to avoid block range limits)\n");

    try {
        // Get current block number
        const currentBlock = await ethers.provider.getBlockNumber();
        console.log(`Current block: ${currentBlock}`);
        
        // Query in chunks of 50,000 blocks (safe limit)
        const chunkSize = 50000;
        const allEvents: any[] = [];
        
        // Start from a reasonable block (e.g., 6 months ago or contract deployment)
        // For Base Sepolia, let's start from block 0 or a known deployment block
        let fromBlock = 0;
        const deploymentBlock = 0; // Adjust if you know the deployment block
        
        console.log(`Querying from block ${fromBlock} to ${currentBlock} in chunks of ${chunkSize}...\n`);
        
        for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
            const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
            process.stdout.write(`  Querying blocks ${startBlock} to ${endBlock}... `);
            
            try {
                const chunkEvents = await staking.queryFilter(
                    harvestedEventFilter,
                    startBlock,
                    endBlock
                );
                allEvents.push(...chunkEvents);
                console.log(`✅ Found ${chunkEvents.length} event(s)`);
            } catch (error: any) {
                if (error.message.includes("max block range")) {
                    // If chunk is still too large, try smaller chunks
                    const smallerChunk = Math.floor(chunkSize / 2);
                    for (let subStart = startBlock; subStart <= endBlock; subStart += smallerChunk) {
                        const subEnd = Math.min(subStart + smallerChunk - 1, endBlock);
                        try {
                            const subEvents = await staking.queryFilter(
                                harvestedEventFilter,
                                subStart,
                                subEnd
                            );
                            allEvents.push(...subEvents);
                        } catch (subError) {
                            console.log(`⚠️  Skipped blocks ${subStart}-${subEnd} due to error`);
                        }
                    }
                    console.log(`✅ Processed chunk`);
                } else {
                    console.log(`⚠️  Error: ${error.message}`);
                }
            }
        }
        
        const events = allEvents;
        
        if (events.length === 0) {
            console.log("❌ No harvest events found for this provider.");
            console.log("   This could mean:");
            console.log("   - No harvests have occurred yet");
            console.log("   - Provider address doesn't match");
            console.log("   - Events are on a different network\n");
        } else {
            console.log(`✅ Found ${events.length} harvest event(s)\n`);
            console.log("=".repeat(80));
            console.log("📋 HARVEST HISTORY:\n");

            let totalHarvested = 0n;
            
            // Sort events by block number (oldest first)
            const sortedEvents = events.sort((a, b) => {
                if (a.blockNumber === b.blockNumber) {
                    return (a.index || 0) - (b.index || 0);
                }
                return a.blockNumber - b.blockNumber;
            });

            sortedEvents.forEach((event, index) => {
                const args = event.args as any;
                const provider = args.provider;
                const amount = args.amount as bigint;
                const amountFormatted = ethers.formatEther(amount);
                
                totalHarvested += amount;

                const timestamp = new Date().toISOString(); // We don't have timestamp from event
                
                console.log(`Harvest #${index + 1}:`);
                console.log(`  Provider: ${provider}`);
                console.log(`  Amount: ${amountFormatted} MYNT`);
                console.log(`  Block: ${event.blockNumber}`);
                console.log(`  Transaction: ${event.transactionHash}`);
                console.log(`  Event Index: ${event.index || 'N/A'}`);
                console.log();
            });

            console.log("=".repeat(80));
            console.log("📊 SUMMARY:\n");
            console.log(`Total Harvest Events: ${events.length}`);
            console.log(`Total Harvested: ${ethers.formatEther(totalHarvested)} MYNT`);
            console.log(`Average per Harvest: ${ethers.formatEther(totalHarvested / BigInt(events.length))} MYNT`);
        }

        // Also check current provider balance in MerkleDistributor
        console.log("\n" + "=".repeat(80));
        console.log("💰 CURRENT PROVIDER BALANCE:\n");
        
        try {
            // We need the MerkleDistributor address to check balance
            // Try to get it from the staking contract
            const merkleDistributorAddress = await staking.merkleDistributor();
            
            if (merkleDistributorAddress && merkleDistributorAddress !== ethers.ZeroAddress) {
                const MerkleDistributorABI = [
                    "function getProviderBalance(address provider) view returns (uint256)"
                ];
                const merkleDistributor = new ethers.Contract(
                    merkleDistributorAddress,
                    MerkleDistributorABI,
                    deployer
                );
                
                const currentBalance = await merkleDistributor.getProviderBalance(providerAddress);
                console.log(`Merkle Distributor: ${merkleDistributorAddress}`);
                console.log(`Current Provider Balance: ${ethers.formatEther(currentBalance)} MYNT`);
            } else {
                console.log("⚠️  MerkleDistributor not set in staking contract");
            }
        } catch (error: any) {
            console.log(`⚠️  Could not fetch current balance: ${error.message}`);
        }

    } catch (error: any) {
        console.error("❌ Error querying events:", error.message);
        if (error.message.includes("queryFilter")) {
            console.log("\n💡 Tip: Make sure you're connected to the correct network");
            console.log("   and the contract address is correct.");
        }
        throw error;
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ Query complete!\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

