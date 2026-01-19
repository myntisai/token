import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    const ZK_DIST = "0xdf25bf6A6e9532A79D16C5f46aE04248ae5bC9BE";
    const TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    
    const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
    const distAbi = ["function providerBalance(address) view returns (uint256)"];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN);
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    console.log("📊 Current state:");
    console.log(`   Deployer token: ${ethers.formatEther(await token.balanceOf(deployer.address))} MYNT`);
    console.log(`   Distributor token: ${ethers.formatEther(await token.balanceOf(ZK_DIST))} MYNT`);
    console.log(`   Provider balance: ${ethers.formatEther(await dist.providerBalance(deployer.address))} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch(console.error);
