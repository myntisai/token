import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Script to check for expired epochs in the MerkleDistributor
 * This helps identify epochs that need closeEpoch() called to recover locked funds
 */

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16";
const EPOCH_GRACE_PERIOD = 2 * 24 * 60 * 60; // 2 days in seconds

const MERKLE_DISTRIBUTOR_ABI = [
    "function providerMerkleRoots(address provider, uint256 index) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount)",
    "function getProviderBalance(address provider) view returns (uint256)",
    "function getLockedBalance(address provider) view returns (uint256)",
    "function token() view returns (address)",
    "function closeEpoch(address provider, uint256 rootIndex) external",
    "function ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)"
];

interface EpochInfo {
    rootIndex: number;
    root: string;
    expiry: number;
    expiryDate: Date;
    expiryPlusGrace: Date;
    closed: boolean;
    totalClaimable: bigint;
    claimedAmount: bigint;
    unclaimedAmount: bigint;
    status: "active" | "in_grace_period" | "expired_needs_close" | "closed";
}

async function main() {
    console.log("\n📊 CHECKING EXPIRED EPOCHS IN MERKLE DISTRIBUTOR\n");
    console.log("=".repeat(80));
    console.log(`Merkle Distributor: ${MERKLE_DISTRIBUTOR_ADDRESS}`);
    console.log(`Current Time: ${new Date().toISOString()}`);
    console.log(`Grace Period: 2 days (${EPOCH_GRACE_PERIOD} seconds)`);
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    console.log(`\nUsing account: ${deployer.address}\n`);

    const merkleDistributor = new ethers.Contract(
        MERKLE_DISTRIBUTOR_ADDRESS,
        MERKLE_DISTRIBUTOR_ABI,
        deployer
    );

    // Get provider address - using deployer as default
    const provider = process.env.PROVIDER_ADDRESS || deployer.address;
    console.log(`Checking epochs for provider: ${provider}\n`);

    // Check provider balances
    try {
        const availableBalance = await merkleDistributor.getProviderBalance(provider);
        const lockedBalance = await merkleDistributor.getLockedBalance(provider);
        
        console.log("💰 Provider Balances:");
        console.log(`   Available Balance: ${ethers.formatEther(availableBalance)} MYNT`);
        console.log(`   Locked Balance: ${ethers.formatEther(lockedBalance)} MYNT`);
        console.log(`   Total: ${ethers.formatEther(availableBalance + lockedBalance)} MYNT`);
        console.log();
    } catch (error: any) {
        console.log(`⚠️  Could not fetch balances: ${error.message}\n`);
    }

    // Check admin status
    try {
        const ADMIN_ROLE = await merkleDistributor.ADMIN_ROLE();
        const isAdmin = await merkleDistributor.hasRole(ADMIN_ROLE, deployer.address);
        console.log(`🔐 Admin Status: ${isAdmin ? "✅ You are an admin (can call closeEpoch)" : "❌ Not an admin"}\n`);
    } catch (error: any) {
        console.log(`⚠️  Could not check admin status: ${error.message}\n`);
    }

    // Find all epochs for this provider
    const epochs: EpochInfo[] = [];
    let index = 0;
    const now = Math.floor(Date.now() / 1000);

    console.log("🔍 Scanning epochs...\n");

    while (true) {
        try {
            const [root, expiry, closed, totalClaimable, claimedAmount] = 
                await merkleDistributor.providerMerkleRoots(provider, index);
            
            // If root is empty, we've reached the end
            if (root === ethers.ZeroHash) {
                break;
            }

            const expiryNum = Number(expiry);
            const expiryPlusGrace = expiryNum + EPOCH_GRACE_PERIOD;
            
            let status: EpochInfo["status"];
            if (closed) {
                status = "closed";
            } else if (now <= expiryNum) {
                status = "active";
            } else if (now <= expiryPlusGrace) {
                status = "in_grace_period";
            } else {
                status = "expired_needs_close";
            }

            epochs.push({
                rootIndex: index,
                root: root,
                expiry: expiryNum,
                expiryDate: new Date(expiryNum * 1000),
                expiryPlusGrace: new Date(expiryPlusGrace * 1000),
                closed,
                totalClaimable,
                claimedAmount,
                unclaimedAmount: totalClaimable - claimedAmount,
                status
            });

            index++;
        } catch (error: any) {
            // End of epochs array
            break;
        }
    }

    if (epochs.length === 0) {
        console.log("📭 No epochs found for this provider.\n");
        console.log("This means either:");
        console.log("   1. No merkle roots have been submitted yet");
        console.log("   2. This is a new MerkleDistributor deployment");
        console.log("   3. The provider address is incorrect\n");
        return;
    }

    console.log(`Found ${epochs.length} epoch(s)\n`);
    console.log("=".repeat(80));

    // Display each epoch
    const needsClose: EpochInfo[] = [];
    let totalUnclaimed = 0n;
    let totalLocked = 0n;

    for (const epoch of epochs) {
        const statusEmoji = {
            "active": "🟢",
            "in_grace_period": "🟡",
            "expired_needs_close": "🔴",
            "closed": "⚫"
        }[epoch.status];

        console.log(`\n📋 Epoch ${epoch.rootIndex} ${statusEmoji} ${epoch.status.toUpperCase()}`);
        console.log(`   Root: ${epoch.root.slice(0, 20)}...`);
        console.log(`   Expiry: ${epoch.expiryDate.toISOString()}`);
        console.log(`   Grace Period Ends: ${epoch.expiryPlusGrace.toISOString()}`);
        console.log(`   Total Claimable: ${ethers.formatEther(epoch.totalClaimable)} MYNT`);
        console.log(`   Claimed: ${ethers.formatEther(epoch.claimedAmount)} MYNT`);
        console.log(`   Unclaimed: ${ethers.formatEther(epoch.unclaimedAmount)} MYNT`);

        if (epoch.status === "expired_needs_close") {
            needsClose.push(epoch);
            totalUnclaimed += epoch.unclaimedAmount;
        }

        if (!epoch.closed) {
            totalLocked += epoch.totalClaimable - epoch.claimedAmount;
        }
    }

    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("\n📊 SUMMARY\n");

    const activeCount = epochs.filter(e => e.status === "active").length;
    const graceCount = epochs.filter(e => e.status === "in_grace_period").length;
    const expiredCount = epochs.filter(e => e.status === "expired_needs_close").length;
    const closedCount = epochs.filter(e => e.status === "closed").length;

    console.log(`   🟢 Active: ${activeCount}`);
    console.log(`   🟡 In Grace Period: ${graceCount}`);
    console.log(`   🔴 Expired (Needs closeEpoch): ${expiredCount}`);
    console.log(`   ⚫ Closed: ${closedCount}`);
    console.log();

    if (needsClose.length > 0) {
        console.log("⚠️  ACTION REQUIRED!\n");
        console.log(`   ${needsClose.length} epoch(s) need closeEpoch() called`);
        console.log(`   Total locked unclaimed funds: ${ethers.formatEther(totalUnclaimed)} MYNT`);
        console.log("\n   Run the following commands to close expired epochs:\n");

        for (const epoch of needsClose) {
            console.log(`   npx hardhat run scripts/close-epoch.ts --network baseSepolia -- ${provider} ${epoch.rootIndex}`);
        }

        console.log("\n   Or use the auto-close all expired epochs:");
        console.log(`   PROVIDER_ADDRESS=${provider} AUTO_CLOSE=true npx hardhat run scripts/check-expired-epochs.ts --network baseSepolia`);

        // Auto-close if requested
        if (process.env.AUTO_CLOSE === "true") {
            console.log("\n🚀 AUTO-CLOSING EXPIRED EPOCHS...\n");
            
            for (const epoch of needsClose) {
                try {
                    console.log(`   Closing epoch ${epoch.rootIndex}...`);
                    const tx = await merkleDistributor.closeEpoch(provider, epoch.rootIndex);
                    console.log(`   Tx: ${tx.hash}`);
                    await tx.wait();
                    console.log(`   ✅ Epoch ${epoch.rootIndex} closed! Recovered ${ethers.formatEther(epoch.unclaimedAmount)} MYNT\n`);
                } catch (error: any) {
                    console.log(`   ❌ Failed to close epoch ${epoch.rootIndex}: ${error.message}\n`);
                }
            }
        }
    } else {
        console.log("✅ No epochs need closing!\n");
        
        if (graceCount > 0) {
            console.log(`   Note: ${graceCount} epoch(s) are in grace period.`);
            console.log("   Users can still claim until grace period ends.\n");
        }
    }

    // Issue explanation
    console.log("=".repeat(80));
    console.log("\n❓ WHAT HAPPENS IF YOU DON'T CALL closeEpoch?\n");
    console.log("   1. Locked funds remain locked (can't use for new epochs)");
    console.log("   2. Users can't claim (past grace period)");
    console.log("   3. Unclaimed rewards aren't returned to provider balance");
    console.log("   4. Must call closeEpoch to unlock funds for redistribution\n");
    console.log("=".repeat(80));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

