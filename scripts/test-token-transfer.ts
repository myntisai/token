import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const TOKEN_ADDRESS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const fundingAmount = ethers.parseEther("200");
    
    const tokenAbi = [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    
    // Wait a bit for state to sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const allowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
    const balance = await token.balanceOf(deployer.address);
    
    console.log(`Allowance: ${ethers.formatEther(allowance)} MYNT`);
    console.log(`Balance: ${ethers.formatEther(balance)} MYNT`);
    console.log(`Required: ${ethers.formatEther(fundingAmount)} MYNT`);
    
    // Try a direct transferFrom to see if it works
    console.log("\nTrying direct transferFrom...");
    try {
        const testAmount = ethers.parseEther("1");
        const tx = await token.transferFrom(deployer.address, ZK_DISTRIBUTOR, testAmount);
        const receipt = await tx.wait();
        console.log(`✅ Direct transferFrom works: ${receipt.hash}`);
    } catch (e: any) {
        console.log(`❌ Direct transferFrom failed: ${e.message}`);
        if (e.data) {
            console.log(`   Data: ${e.data.slice(0, 20)}...`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
