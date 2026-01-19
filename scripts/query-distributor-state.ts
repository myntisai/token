import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Query ZKMerkleDistributor State
 * 
 * This script queries the current state of the distributor:
 * - Provider balances
 * - Active Merkle roots/epochs
 * - Unclaimed amounts
 * - Claim status
 */
async function main() {
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("QUERY ZK MERKLE DISTRIBUTOR STATE");
    console.log("=".repeat(80));
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Configuration - query old distributor by default
    // Old production ZKMerkleDistributor: 0xF8adFB263Fd6682055941e6c16750d8D34BDeec0 (Dec 28, 2025)
    // New ZKMerkleDistributor: 0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D (Jan 7, 2026)
    const DISTRIBUTOR_ADDRESS = process.env.OLD_DISTRIBUTOR_ADDRESS ||
                                process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || 
                                process.env.MERKLE_DISTRIBUTOR_ADDRESS ||
                                "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0"; // Old production by default
    
    console.log(`\nDistributor Address: ${DISTRIBUTOR_ADDRESS}`);
    
    // Check if it's the new ZK distributor or old one
    const zkDistributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function lockedBalance(address) view returns (uint256)",
        "function providerMerkleRoots(address, uint256) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount, bool providerProofVerified, bytes32 batchHash)",
        "function getEpochInfo(address provider, uint256 rootIndex) view returns (bytes32, uint256, bool, uint256, uint256, bool, bytes32)",
        "function getEpochCount(address provider) view returns (uint256)",
        "function hasClaimed(address provider, uint256 rootIndex, address user) view returns (bool)",
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)"
    ];
    
    const oldDistributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function lockedBalance(address) view returns (uint256)",
        "function providerMerkleRoots(address, uint256) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount)",
        "function getEpochInfo(address provider, uint256 rootIndex) view returns (bytes32, uint256, bool, uint256, uint256)",
        "function hasClaimed(address provider, uint256 rootIndex, address user) view returns (bool)",
        "function token() view returns (address)"
    ];
    
    // Helper to get epoch count by checking array length
    async function getEpochCount(distributor: any, provider: string, isZK: boolean): Promise<number> {
        if (isZK) {
            try {
                return Number(await distributor.getEpochCount(provider));
            } catch (e) {
                // Fallback: iterate through array
                return await getEpochCountByIteration(distributor, provider);
            }
        } else {
            // Old distributor: iterate through array
            return await getEpochCountByIteration(distributor, provider);
        }
    }
    
    async function getEpochCountByIteration(distributor: any, provider: string): Promise<number> {
        let count = 0;
        const maxCheck = 1000; // Safety limit
        while (count < maxCheck) {
            try {
                await distributor.providerMerkleRoots(provider, count);
                count++;
            } catch (e: any) {
                // Array out of bounds - we've reached the end
                break;
            }
        }
        return count;
    }
    
    let distributor;
    let isZKDistributor = false;
    
    // Try ZK distributor first
    try {
        distributor = await ethers.getContractAt(zkDistributorAbi, DISTRIBUTOR_ADDRESS);
        await distributor.batchVerifier(); // This will fail if old distributor
        isZKDistributor = true;
        console.log("✅ Detected: ZKMerkleDistributor (new)");
    } catch (e) {
        // Try old distributor
        try {
            distributor = await ethers.getContractAt(oldDistributorAbi, DISTRIBUTOR_ADDRESS);
            isZKDistributor = false;
            console.log("✅ Detected: MerkleDistributor (old)");
        } catch (e2) {
            console.error("❌ Could not connect to distributor contract");
            console.error("   Make sure the address is correct and contract is deployed");
            process.exit(1);
        }
    }
    
    // Get token address
    const tokenAddress = await distributor.token();
    console.log(`Token Address: ${tokenAddress}`);
    
    // Get provider addresses to check
    // For now, we'll check common provider addresses
    const providerAddresses = process.env.PROVIDER_ADDRESSES 
        ? process.env.PROVIDER_ADDRESSES.split(",").map(a => a.trim())
        : [
            process.env.PROVIDER_ADDRESS || "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627", // Deployer from earlier
            // Add more provider addresses here if needed
        ];
    
    console.log(`\n📊 Querying ${providerAddresses.length} provider(s)...`);
    
    const results: any = {
        distributor: DISTRIBUTOR_ADDRESS,
        token: tokenAddress,
        isZKDistributor,
        network: network.name,
        chainId: network.chainId.toString(),
        providers: []
    };
    
    for (const providerAddr of providerAddresses) {
        console.log(`\n${"=".repeat(80)}`);
        console.log(`Provider: ${providerAddr}`);
        console.log(`${"=".repeat(80)}`);
        
        const providerData: any = {
            address: providerAddr,
            balances: {},
            epochs: []
        };
        
        // Query balances
        try {
            const providerBalance = await distributor.providerBalance(providerAddr);
            const lockedBalance = await distributor.lockedBalance(providerAddr);
            
            providerData.balances = {
                available: providerBalance.toString(),
                availableFormatted: ethers.formatEther(providerBalance),
                locked: lockedBalance.toString(),
                lockedFormatted: ethers.formatEther(lockedBalance),
                total: (providerBalance + lockedBalance).toString(),
                totalFormatted: ethers.formatEther(providerBalance + lockedBalance)
            };
            
            console.log(`\n💰 Balances:`);
            console.log(`   Available: ${ethers.formatEther(providerBalance)} MYNT`);
            console.log(`   Locked: ${ethers.formatEther(lockedBalance)} MYNT`);
            console.log(`   Total: ${ethers.formatEther(providerBalance + lockedBalance)} MYNT`);
        } catch (e: any) {
            console.error(`   ❌ Error querying balances: ${e.message}`);
        }
        
        // Query epochs
        try {
            const epochCount = await getEpochCount(distributor, providerAddr, isZKDistributor);
            console.log(`\n📅 Epochs: ${epochCount} total`);
            
            for (let i = 0; i < Number(epochCount); i++) {
                try {
                    let epochInfo;
                    if (isZKDistributor) {
                        epochInfo = await distributor.getEpochInfo(providerAddr, i);
                    } else {
                        epochInfo = await distributor.getEpochInfo(providerAddr, i);
                    }
                    
                    const root = epochInfo[0];
                    const expiry = Number(epochInfo[1]);
                    const closed = epochInfo[2];
                    const totalClaimable = epochInfo[3];
                    const claimedAmount = epochInfo[4];
                    const unclaimed = totalClaimable - claimedAmount;
                    const isExpired = expiry < Math.floor(Date.now() / 1000);
                    
                    const epochData: any = {
                        rootIndex: i,
                        root: root,
                        expiry: expiry,
                        expiryDate: new Date(expiry * 1000).toISOString(),
                        isExpired,
                        closed: closed,
                        totalClaimable: totalClaimable.toString(),
                        totalClaimableFormatted: ethers.formatEther(totalClaimable),
                        claimedAmount: claimedAmount.toString(),
                        claimedAmountFormatted: ethers.formatEther(claimedAmount),
                        unclaimedAmount: unclaimed.toString(),
                        unclaimedAmountFormatted: ethers.formatEther(unclaimed),
                        claimRate: totalClaimable > 0n ? (Number(claimedAmount) / Number(totalClaimable) * 100).toFixed(2) + "%" : "0%"
                    };
                    
                    if (isZKDistributor && epochInfo.length > 5) {
                        epochData.providerProofVerified = epochInfo[5];
                        epochData.batchHash = epochInfo[6];
                    }
                    
                    providerData.epochs.push(epochData);
                    
                    console.log(`\n   Epoch ${i}:`);
                    console.log(`     Root: ${root}`);
                    console.log(`     Expiry: ${new Date(expiry * 1000).toISOString()} ${isExpired ? "(EXPIRED)" : ""}`);
                    console.log(`     Status: ${closed ? "CLOSED" : "ACTIVE"}`);
                    console.log(`     Total: ${ethers.formatEther(totalClaimable)} MYNT`);
                    console.log(`     Claimed: ${ethers.formatEther(claimedAmount)} MYNT`);
                    console.log(`     Unclaimed: ${ethers.formatEther(unclaimed)} MYNT`);
                    console.log(`     Claim Rate: ${epochData.claimRate}`);
                    
                    if (isZKDistributor) {
                        console.log(`     ZK Verified: ${epochData.providerProofVerified}`);
                    }
                } catch (e: any) {
                    console.error(`   ❌ Error querying epoch ${i}: ${e.message}`);
                }
            }
            
            // Calculate totals
            const totalUnclaimed = providerData.epochs.reduce((sum: bigint, e: any) => {
                return sum + BigInt(e.unclaimedAmount);
            }, 0n);
            
            const totalClaimed = providerData.epochs.reduce((sum: bigint, e: any) => {
                return sum + BigInt(e.claimedAmount);
            }, 0n);
            
            const totalDistributed = providerData.epochs.reduce((sum: bigint, e: any) => {
                return sum + BigInt(e.totalClaimable);
            }, 0n);
            
            providerData.totals = {
                totalUnclaimed: totalUnclaimed.toString(),
                totalUnclaimedFormatted: ethers.formatEther(totalUnclaimed),
                totalClaimed: totalClaimed.toString(),
                totalClaimedFormatted: ethers.formatEther(totalClaimed),
                totalDistributed: totalDistributed.toString(),
                totalDistributedFormatted: ethers.formatEther(totalDistributed),
                activeEpochs: providerData.epochs.filter((e: any) => !e.closed && !e.isExpired).length,
                expiredEpochs: providerData.epochs.filter((e: any) => e.isExpired).length,
                closedEpochs: providerData.epochs.filter((e: any) => e.closed).length
            };
            
            console.log(`\n📊 Totals:`);
            console.log(`   Total Distributed: ${ethers.formatEther(totalDistributed)} MYNT`);
            console.log(`   Total Claimed: ${ethers.formatEther(totalClaimed)} MYNT`);
            console.log(`   Total Unclaimed: ${ethers.formatEther(totalUnclaimed)} MYNT`);
            console.log(`   Active Epochs: ${providerData.totals.activeEpochs}`);
            console.log(`   Expired Epochs: ${providerData.totals.expiredEpochs}`);
            console.log(`   Closed Epochs: ${providerData.totals.closedEpochs}`);
            
        } catch (e: any) {
            console.error(`   ❌ Error querying epochs: ${e.message}`);
        }
        
        results.providers.push(providerData);
    }
    
    // Save results
    const outputFile = path.join(__dirname, `../distributor-state-${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    console.log(`\n${"=".repeat(80)}`);
    console.log("✅ Query complete!");
    console.log(`\nResults saved to: ${outputFile}`);
    console.log(`\nSummary:`);
    console.log(`   Distributor: ${DISTRIBUTOR_ADDRESS}`);
    console.log(`   Type: ${isZKDistributor ? "ZKMerkleDistributor (new)" : "MerkleDistributor (old)"}`);
    console.log(`   Providers queried: ${providerAddresses.length}`);
    
    const globalUnclaimed = results.providers.reduce((sum: bigint, p: any) => {
        return sum + BigInt(p.totals?.totalUnclaimed || "0");
    }, 0n);
    
    console.log(`   Global Unclaimed: ${ethers.formatEther(globalUnclaimed)} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
