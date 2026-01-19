import { ethers } from "hardhat";

async function main() {
    // From proof generation
    const merkleRootHex = "0xb37f2716f97ebf9b93b844a32737936cfd3bf54c4aa80ce224f068101329c361";
    const publicSignal0 = "15523930645614966092010330480312289387025943186142241989971870957131568628574";
    
    // Convert merkle root hex to uint256
    const merkleRootAsUint = BigInt(merkleRootHex);
    
    console.log("📊 Merkle root comparison:");
    console.log(`   Hex root: ${merkleRootHex}`);
    console.log(`   Hex as uint256: ${merkleRootAsUint.toString()}`);
    console.log(`   Public signal[0]: ${publicSignal0}`);
    console.log(`   Match: ${merkleRootAsUint.toString() === publicSignal0}`);
    
    // Also check the reverse - convert public signal to hex
    const publicSignalAsHex = "0x" + BigInt(publicSignal0).toString(16).padStart(64, '0');
    console.log(`\n   Public signal as hex: ${publicSignalAsHex}`);
    console.log(`   Matches root: ${publicSignalAsHex.toLowerCase() === merkleRootHex.toLowerCase()}`);
    
    // The backend is using a different root calculation
    // Let me check what the backend merkle root actually represents
    console.log("\n📝 Backend needs to output merkle root that matches public signal!");
}

main()
    .then(() => process.exit(0))
    .catch(console.error);
