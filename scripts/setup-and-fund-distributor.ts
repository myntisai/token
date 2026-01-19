import { ethers } from "hardhat";

/**
 * Setup and fund ZKMerkleDistributor
 * 1. Update staking contract address if needed
 * 2. Fund via staking contract (which works around OFT transferFrom issue)
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || deployer.address;
    const fundingAmount = ethers.parseEther("200");
    
    console.log("=".repeat(80));
    console.log("SETUP AND FUND DISTRIBUTOR");
    console.log("=".repeat(80));
    
    const distributorAbi = [
        "function stakingContract() view returns (address)",
        "function setStakingContract(address _stakingContract) external",
        "function ADMIN_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function providerBalance(address) view returns (uint256)"
    ];
    
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    // Check current staking contract
    const currentStaking = await distributor.stakingContract();
    console.log(`Current staking contract: ${currentStaking}`);
    console.log(`Target staking contract: ${STAKING_CONTRACT}`);
    
    // Update staking contract if needed
    if (currentStaking.toLowerCase() !== STAKING_CONTRACT.toLowerCase()) {
        console.log("\n📝 Updating staking contract address...");
        const adminRole = await distributor.ADMIN_ROLE();
        const hasAdmin = await distributor.hasRole(adminRole, deployer.address);
        
        if (!hasAdmin) {
            console.log("❌ Deployer doesn't have ADMIN_ROLE");
            return;
        }
        
        const updateTx = await distributor.setStakingContract(STAKING_CONTRACT);
        await updateTx.wait();
        console.log("✅ Staking contract updated");
    } else {
        console.log("✅ Staking contract already set correctly");
    }
    
    // Now fund via staking contract
    console.log("\n📝 Funding via staking contract...");
    const tokenAbi = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)"
    ];
    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const token = await ethers.getContractAt(tokenAbi, tokenAddress);
    
    const balance = await token.balanceOf(deployer.address);
    if (balance < fundingAmount) {
        console.log(`❌ Insufficient balance: ${ethers.formatEther(balance)} < ${ethers.formatEther(fundingAmount)}`);
        return;
    }
    
    // Transfer tokens to staking contract (transfer works, transferFrom doesn't)
    console.log("Transferring tokens to staking contract...");
    const transferTx = await token.transfer(STAKING_CONTRACT, fundingAmount);
    await transferTx.wait();
    console.log("✅ Tokens transferred to staking contract");
    
    // Wait for state sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get staking contract
    const stakingAbi = [
        "function fundProviderBalance(address provider, uint256 amount) external",
        "function zkMerkleDistributor() view returns (address)"
    ];
    const staking = await ethers.getContractAt(stakingAbi, STAKING_CONTRACT);
    
    // Verify staking contract points to correct distributor
    const stakingDistributor = await staking.zkMerkleDistributor();
    if (stakingDistributor.toLowerCase() !== ZK_DISTRIBUTOR.toLowerCase()) {
        console.log(`⚠️  Staking contract points to different distributor: ${stakingDistributor}`);
        console.log("   This may cause issues. Continuing anyway...");
    }
    
    // Fund provider balance (staking contract will transfer to distributor)
    console.log("Calling staking.fundProviderBalance...");
    const fundTx = await staking.fundProviderBalance(PROVIDER_ADDRESS, fundingAmount);
    await fundTx.wait();
    console.log("✅ Provider balance funded");
    
    // Wait for state sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify
    const providerBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    console.log(`\n✅ Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    if (providerBalance === 0n) {
        console.log("⚠️  Provider balance is still 0. This may indicate:");
        console.log("   1. Staking contract doesn't have sufficient available balance");
        console.log("   2. Staking contract's zkMerkleDistributor is not set correctly");
        console.log("   3. The fundProviderBalance call failed silently");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
