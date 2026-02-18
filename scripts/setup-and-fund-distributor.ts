import { ethers } from "hardhat";

/**
 * Setup and fund ZKMerkleDistributor
 * 1. Ensure provider wallet has MYNT
 * 2. Provider approves distributor and calls depositBalance()
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || deployer.address;
    const fundingAmount = ethers.parseEther("200");
    
    console.log("=".repeat(80));
    console.log("SETUP AND FUND DISTRIBUTOR");
    console.log("=".repeat(80));
    
    const distributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256 amount) external"
    ];
    
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    const tokenAbi = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];
    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const token = await ethers.getContractAt(tokenAbi, tokenAddress);
    
    const balance = await token.balanceOf(deployer.address);
    if (balance < fundingAmount) {
        console.log(`❌ Insufficient balance: ${ethers.formatEther(balance)} < ${ethers.formatEther(fundingAmount)}`);
        return;
    }

    if (PROVIDER_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log("❌ PROVIDER_ADDRESS is not the connected signer.");
        console.log("   Run this script using the provider's wallet or set PROVIDER_ADDRESS to deployer.");
        return;
    }

    console.log("\n📝 Funding via provider depositBalance...");
    const approveTx = await token.approve(ZK_DISTRIBUTOR, fundingAmount);
    await approveTx.wait();
    const fundTx = await distributor.depositBalance(fundingAmount);
    await fundTx.wait();
    console.log("✅ Provider balance funded");
    
    // Verify
    const providerBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    console.log(`\n✅ Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
