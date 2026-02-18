import { ethers } from "hardhat";

/**
 * Fund ZKMerkleDistributor using provider depositBalance.
 *
 * Current flow:
 * 1. Provider harvests rewards from staking (off-chain step)
 * 2. Provider approves distributor and calls depositBalance()
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || deployer.address;
    const fundingAmount = ethers.parseEther("200");
    
    console.log("=".repeat(80));
    console.log("FUND DISTRIBUTOR WORKAROUND");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Provider: ${PROVIDER_ADDRESS}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    
    const tokenAbi = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];
    
    const distributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256 amount) external"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    // Check current state
    const deployerBalance = await token.balanceOf(deployer.address);
    const distributorBalance = await token.balanceOf(ZK_DISTRIBUTOR);
    const providerBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    
    console.log(`\nCurrent state:`);
    console.log(`  Deployer balance: ${ethers.formatEther(deployerBalance)} MYNT`);
    console.log(`  Distributor balance: ${ethers.formatEther(distributorBalance)} MYNT`);
    console.log(`  Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    if (deployerBalance < fundingAmount) {
        console.log(`\n❌ Insufficient balance: need ${ethers.formatEther(fundingAmount)} MYNT`);
        return;
    }

    if (PROVIDER_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log("\n❌ PROVIDER_ADDRESS is not the connected signer.");
        console.log("   Run this script using the provider's wallet or set PROVIDER_ADDRESS to deployer.");
        return;
    }

    console.log("\n📝 Funding via provider depositBalance...");
    const approveTx = await token.approve(ZK_DISTRIBUTOR, fundingAmount);
    await approveTx.wait();
    const depositTx = await distributor.depositBalance(fundingAmount);
    await depositTx.wait();
    const newProviderBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    console.log(`✅ Provider balance updated: ${ethers.formatEther(newProviderBalance)} MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
