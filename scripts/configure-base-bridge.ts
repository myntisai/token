// token/scripts/configure-base-bridge.ts
import { ethers } from "hardhat";
import dotenv from "dotenv";
// dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Adjust path if needed
import path from "path"; // Import path


// Helper function (ensure it's defined or imported)
function addressToBytes32(address: string): string {
    try {
        return ethers.zeroPadValue(ethers.getAddress(address), 32); // Ensure checksummed address before padding
    } catch (e) {
        console.error(`Invalid address format: ${address}`);
        throw e;
    }
}

async function main() {
    console.log("Configuring Base bridge: Setting remote bridge address AND peer using EIDs...");

    const [signer] = await ethers.getSigners();
    console.log(`Using account: ${signer.address} (must be owner of the bridge)`);

    // Bridge addresses
    const baseBridgeAddress = process.env.MYNT_BRIDGE_ADDRESS;
    const sepoliaBridgeAddress = process.env.MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA;

    if (!baseBridgeAddress || !sepoliaBridgeAddress) {
        console.error("Missing MYNT_BRIDGE_ADDRESS or MYNT_BRIDGE_ADDRESS_ETHEREUM_SEPOLIA in .env file");
        return;
    }
    console.log(`Base Bridge Address: ${baseBridgeAddress}`);
    console.log(`Sepolia Bridge Address: ${sepoliaBridgeAddress}`);

    // Correct LayerZero v2 EIDs (ensure these are up-to-date)
    const baseEid = process.env.BASE_SEPOLIA_EID ? parseInt(process.env.BASE_SEPOLIA_EID) : 40245;
    const sepoliaEid = process.env.ETHEREUM_SEPOLIA_EID ? parseInt(process.env.ETHEREUM_SEPOLIA_EID) : 40161;
    console.log(`Base Sepolia EID: ${baseEid}`);
    console.log(`Ethereum Sepolia EID: ${sepoliaEid}`);

    // Convert Sepolia address to bytes32 for configuration
    const sepoliaBridgeBytes32 = addressToBytes32(sepoliaBridgeAddress);
    console.log(`Sepolia Bridge Address (bytes32): ${sepoliaBridgeBytes32}`);

    // --- Configuration Steps ---
    try {
        const baseBridge = await ethers.getContractAt("MyntisBridge", baseBridgeAddress);
        const owner = await baseBridge.owner();
        if (owner.toLowerCase() !== signer.address.toLowerCase()) {
            console.error(`Signer ${signer.address} is not the owner of the Base bridge contract (${owner}). Aborting.`);
            return;
        }
        console.log(`Signer ${signer.address} confirmed as owner.`);

        // 1. Configure Remote Bridge Address (using EID)
        console.log("\nStep 1: Configuring remoteBridgeAddresses mapping using EID...");
        // *** Use EID for the check ***
        const currentRemote = await baseBridge.remoteBridgeAddresses(sepoliaEid);
        if (currentRemote.toLowerCase() === sepoliaBridgeBytes32.toLowerCase()) {
            console.log(`Remote bridge address for Sepolia (EID ${sepoliaEid}) already configured: ${currentRemote}`);
        } else {
            console.log(`Setting remote bridge for Sepolia (EID ${sepoliaEid}) to ${sepoliaBridgeBytes32}...`);
            // *** Use EID for the update ***
            const txUpdate = await baseBridge.updateRemoteBridge(sepoliaEid, sepoliaBridgeBytes32);
            console.log(` -> updateRemoteBridge Tx submitted: ${txUpdate.hash}`);
            await txUpdate.wait();
            console.log(` -> Remote bridge address configured for EID ${sepoliaEid}.`);
        }

        // 2. Configure Peer (using EID - already correct)
        console.log("\nStep 2: Configuring LayerZero peer using EID...");
        const currentPeer = await baseBridge.peers(sepoliaEid);
        if (currentPeer.toLowerCase() === sepoliaBridgeBytes32.toLowerCase()) {
            console.log(`Peer for Sepolia (EID ${sepoliaEid}) already configured: ${currentPeer}`);
        } else {
            console.log(`Setting peer for Sepolia (EID ${sepoliaEid}) to ${sepoliaBridgeBytes32}...`);
            const txSetPeer = await baseBridge.setPeer(sepoliaEid, sepoliaBridgeBytes32);
            console.log(` -> setPeer Tx submitted: ${txSetPeer.hash}`);
            await txSetPeer.wait();
            console.log(` -> Peer configured for EID ${sepoliaEid}.`);
        }

        console.log("\nConfiguration on Base complete.");

    } catch (error: any) {
        console.error(`Error configuring Base bridge: ${error.message}`);
        // ... (rest of error handling) ...
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: any) => {
        console.error("Unhandled error in main:", error);
        process.exit(1);
    });