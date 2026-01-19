import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    const ZK_DIST = "0xdf25bf6A6e9532A79D16C5f46aE04248ae5bC9BE";
    
    const distAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function lockedBalance(address) view returns (uint256)",
        "function getProviderMerkleRootCount(address) view returns (uint256)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    console.log("📊 Checking state after submission:");
    console.log(`   Provider balance: ${ethers.formatEther(await dist.providerBalance(deployer.address))} MYNT`);
    console.log(`   Locked balance: ${ethers.formatEther(await dist.lockedBalance(deployer.address))} MYNT`);
    
    try {
        const rootCount = await dist.getProviderMerkleRootCount(deployer.address);
        console.log(`   Merkle root count: ${rootCount}`);
    } catch {
        console.log("   (getProviderMerkleRootCount not available)");
    }
}

main()
    .then(() => process.exit(0))
    .catch(console.error);
