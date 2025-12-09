import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Close Old Epochs Script
 * 
 * Closes all expired epochs on the old MerkleDistributor before migration.
 * This prevents double-claiming and ensures clean state for the new distributor.
 * 
 * Must be run BEFORE deploying new contracts.
 */

// Old MerkleDistributor address
const OLD_MERKLE_DISTRIBUTOR = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16";

// Provider address (deployer)
const PROVIDER_ADDRESS = process.env.NEXT_PUBLIC_PROVIDER_ADDRESS || "0x0904192498effF59e0502aE1700ecAa9B1708543";

const MERKLE_ABI = [
    "function providerMerkleRoots(address, uint256) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount)",
    "function closeEpoch(address provider, uint256 rootIndex) external",
    "function getEpochInfo(address provider, uint256 rootIndex) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount)",
    "function providerBalance(address) view returns (uint256)",
    "function lockedBalance(address) view returns (uint256)",
    "function hasRole(bytes32, address) view returns (bool)",
    "event EpochClosed(address indexed provider, uint256 rootIndex)"
];

interface EpochInfo {
    index: number;
    root: string;
    expiry: Date;
    closed: boolean;
    totalClaimable: string;
    claimedAmount: string;
    unclaimed: string;
    canClose: boolean;
    reason: string;
}

async function main() {
    console.log("=".repeat(80));
    console.log("CLOSE OLD MERKLE EPOCHS");
    console.log("=".repeat(80));

    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    console.log(`\nNetwork: ${network.name} (chainId: ${network.chainId})`);
    console.log(`Signer: ${signer.address}`);
    console.log(`Old MerkleDistributor: ${OLD_MERKLE_DISTRIBUTOR}`);
    console.log(`Provider: ${PROVIDER_ADDRESS}`);

    const merkle = new ethers.Contract(OLD_MERKLE_DISTRIBUTOR, MERKLE_ABI, signer);

    // Check if signer has admin role
    const ADMIN_ROLE = ethers.ZeroHash;
    const hasAdmin = await merkle.hasRole(ADMIN_ROLE, signer.address);
    console.log(`\nSigner has ADMIN_ROLE: ${hasAdmin}`);
    
    if (!hasAdmin) {
        console.log("\nERROR: Signer does not have ADMIN_ROLE. Cannot close epochs.");
        console.log("Please use an account with ADMIN_ROLE.");
        process.exit(1);
    }

    // Get provider balances
    const providerBalance = await merkle.providerBalance(PROVIDER_ADDRESS);
    const lockedBalance = await merkle.lockedBalance(PROVIDER_ADDRESS);
    console.log(`\nProvider Balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`Locked Balance: ${ethers.formatEther(lockedBalance)} MYNT`);

    // Constants from contract
    const EPOCH_GRACE_PERIOD = 2 * 24 * 60 * 60; // 2 days in seconds
    const CLOSE_DELAY = 1 * 60 * 60; // 1 hour in seconds
    const now = Math.floor(Date.now() / 1000);

    // ============================================================
    // SCAN ALL EPOCHS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("SCANNING EPOCHS");
    console.log("=".repeat(80));

    const epochs: EpochInfo[] = [];
    let index = 0;

    while (true) {
        try {
            const [root, expiry, closed, totalClaimable, claimedAmount] = await merkle.getEpochInfo(PROVIDER_ADDRESS, index);
            
            // Check if this is a valid epoch (non-zero root)
            if (root === ethers.ZeroHash) {
                break;
            }

            const expiryTime = Number(expiry);
            const closeableTime = expiryTime + EPOCH_GRACE_PERIOD + CLOSE_DELAY;
            const canClose = !closed && now > closeableTime;
            const unclaimed = BigInt(totalClaimable) - BigInt(claimedAmount);
            
            let reason = "";
            if (closed) {
                reason = "Already closed";
            } else if (now <= expiryTime) {
                reason = "Not expired yet";
            } else if (now <= expiryTime + EPOCH_GRACE_PERIOD) {
                reason = "In grace period";
            } else if (now <= closeableTime) {
                reason = "In close delay";
            } else {
                reason = "Ready to close";
            }

            epochs.push({
                index,
                root: root.slice(0, 10) + "...",
                expiry: new Date(expiryTime * 1000),
                closed,
                totalClaimable: ethers.formatEther(totalClaimable),
                claimedAmount: ethers.formatEther(claimedAmount),
                unclaimed: ethers.formatEther(unclaimed),
                canClose,
                reason
            });

            index++;
        } catch (error) {
            // End of epochs
            break;
        }
    }

    console.log(`\nFound ${epochs.length} epochs`);

    // Display epoch summary
    console.log(`\n${"=".repeat(80)}`);
    console.log("EPOCH SUMMARY");
    console.log("=".repeat(80));

    console.log(`\n${"Index".padEnd(6)} ${"Status".padEnd(15)} ${"Expiry".padEnd(25)} ${"Total".padEnd(15)} ${"Claimed".padEnd(15)} ${"Unclaimed".padEnd(15)} Reason`);
    console.log("-".repeat(120));

    for (const epoch of epochs) {
        const status = epoch.closed ? "CLOSED" : (epoch.canClose ? "CAN CLOSE" : "ACTIVE");
        console.log(
            `${String(epoch.index).padEnd(6)} ` +
            `${status.padEnd(15)} ` +
            `${epoch.expiry.toISOString().padEnd(25)} ` +
            `${epoch.totalClaimable.padEnd(15)} ` +
            `${epoch.claimedAmount.padEnd(15)} ` +
            `${epoch.unclaimed.padEnd(15)} ` +
            `${epoch.reason}`
        );
    }

    // Filter closeable epochs
    const closeableEpochs = epochs.filter(e => e.canClose);
    const alreadyClosed = epochs.filter(e => e.closed);
    const stillActive = epochs.filter(e => !e.closed && !e.canClose);

    console.log(`\n${"=".repeat(80)}`);
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`  Total epochs:      ${epochs.length}`);
    console.log(`  Already closed:    ${alreadyClosed.length}`);
    console.log(`  Still active:      ${stillActive.length}`);
    console.log(`  Ready to close:    ${closeableEpochs.length}`);

    if (closeableEpochs.length === 0) {
        console.log(`\nNo epochs to close.`);
        if (stillActive.length > 0) {
            console.log(`\nNote: ${stillActive.length} epochs are still active. Wait for them to expire.`);
            for (const epoch of stillActive) {
                console.log(`  - Epoch ${epoch.index}: ${epoch.reason}`);
            }
        }
        process.exit(0);
    }

    // ============================================================
    // CLOSE EPOCHS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("CLOSING EPOCHS");
    console.log("=".repeat(80));

    let closedCount = 0;
    let failedCount = 0;
    let totalUnclaimed = 0n;

    for (const epoch of closeableEpochs) {
        console.log(`\n  Closing epoch ${epoch.index}...`);
        console.log(`    Unclaimed: ${epoch.unclaimed} MYNT`);

        try {
            const tx = await merkle.closeEpoch(PROVIDER_ADDRESS, epoch.index);
            console.log(`    Transaction: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`    Confirmed in block ${receipt.blockNumber}`);
            
            closedCount++;
            totalUnclaimed += ethers.parseEther(epoch.unclaimed);
            console.log(`    SUCCESS`);

        } catch (error: any) {
            console.log(`    FAILED: ${error.message.split('\n')[0]}`);
            failedCount++;
        }
    }

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("FINAL SUMMARY");
    console.log("=".repeat(80));
    console.log(`  Epochs closed:         ${closedCount}`);
    console.log(`  Epochs failed:         ${failedCount}`);
    console.log(`  Unclaimed returned:    ${ethers.formatEther(totalUnclaimed)} MYNT`);

    // Check final balances
    const finalProviderBalance = await merkle.providerBalance(PROVIDER_ADDRESS);
    const finalLockedBalance = await merkle.lockedBalance(PROVIDER_ADDRESS);
    console.log(`\n  Final Provider Balance: ${ethers.formatEther(finalProviderBalance)} MYNT`);
    console.log(`  Final Locked Balance:   ${ethers.formatEther(finalLockedBalance)} MYNT`);

    if (stillActive.length > 0) {
        console.log(`\n  WARNING: ${stillActive.length} epochs still active and cannot be closed yet.`);
        console.log(`  Run this script again after they expire.`);
    }

    if (failedCount === 0 && stillActive.length === 0) {
        console.log(`\n  All epochs closed successfully!`);
        console.log(`  Safe to proceed with migration.`);
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("DONE");
    console.log("=".repeat(80));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
