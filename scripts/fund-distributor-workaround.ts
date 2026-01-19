import { ethers } from "hardhat";

/**
 * Workaround script to fund ZKMerkleDistributor
 * 
 * Since the OFT token's transferFrom fails, we:
 * 1. Transfer tokens directly to distributor (this works)
 * 2. Use staking contract's notifyRewardWithTransfer if available
 * 3. Or manually update provider balance if we have admin access
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || deployer.address;
    const fundingAmount = ethers.parseEther("200");
    
    console.log("=".repeat(80));
    console.log("FUND DISTRIBUTOR WORKAROUND");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Provider: ${PROVIDER_ADDRESS}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    console.log(`Staking: ${STAKING_CONTRACT}`);
    
    const tokenAbi = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];
    
    const distributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function stakingContract() view returns (address)",
        "function notifyRewardWithTransfer(address provider, uint256 amount) external",
        "function setStakingContract(address _stakingContract) external",
        "function ADMIN_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    // Check current state
    const deployerBalance = await token.balanceOf(deployer.address);
    const distributorBalance = await token.balanceOf(ZK_DISTRIBUTOR);
    const providerBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
    const stakingContractAddr = await distributor.stakingContract();
    
    console.log(`\nCurrent state:`);
    console.log(`  Deployer balance: ${ethers.formatEther(deployerBalance)} MYNT`);
    console.log(`  Distributor balance: ${ethers.formatEther(distributorBalance)} MYNT`);
    console.log(`  Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`  Staking contract set: ${stakingContractAddr}`);
    
    if (deployerBalance < fundingAmount) {
        console.log(`\n❌ Insufficient balance: need ${ethers.formatEther(fundingAmount)} MYNT`);
        return;
    }
    
    // Strategy 1: Use staking contract if it's set up
    if (stakingContractAddr !== ethers.ZeroAddress && stakingContractAddr.toLowerCase() === STAKING_CONTRACT.toLowerCase()) {
        console.log(`\n📝 Strategy 1: Using staking contract funding...`);
        try {
            // Approve staking contract
            console.log("Approving staking contract...");
            const approveTx = await token.approve(STAKING_CONTRACT, fundingAmount);
            await approveTx.wait();
            console.log("✅ Approved");
            
            // Get staking contract
            const stakingAbi = [
                "function fundProviderBalance(address provider, uint256 amount) external"
            ];
            const staking = await ethers.getContractAt(stakingAbi, STAKING_CONTRACT);
            
            // Call fundProviderBalance which will call notifyRewardWithTransfer
            console.log("Calling staking.fundProviderBalance...");
            const fundTx = await staking.fundProviderBalance(PROVIDER_ADDRESS, fundingAmount);
            await fundTx.wait();
            console.log("✅ Provider balance funded via staking contract");
            
            // Verify
            const newProviderBalance = await distributor.providerBalance(PROVIDER_ADDRESS);
            console.log(`New provider balance: ${ethers.formatEther(newProviderBalance)} MYNT`);
            return;
        } catch (e: any) {
            console.log(`⚠️  Staking contract funding failed: ${e.message}`);
            console.log("   Trying alternative approach...");
        }
    }
    
    // Strategy 2: Direct transfer + manual balance update (if we have admin)
    console.log(`\n📝 Strategy 2: Direct transfer + manual update...`);
    const adminRole = await distributor.ADMIN_ROLE();
    const hasAdmin = await distributor.hasRole(adminRole, deployer.address);
    
    if (hasAdmin) {
        // Transfer tokens to distributor
        console.log("Transferring tokens to distributor...");
        const transferTx = await token.transfer(ZK_DISTRIBUTOR, fundingAmount);
        await transferTx.wait();
        console.log("✅ Tokens transferred");
        
        // Note: We can't update providerBalance without a working transferFrom
        // The tokens are in the distributor but not allocated to the provider
        console.log("⚠️  Tokens are in distributor but provider balance not updated.");
        console.log("   This is a known issue with OFT token's transferFrom.");
        console.log("   For testing, you may need to manually update the balance or use staking contract.");
    } else {
        console.log("❌ Deployer doesn't have ADMIN_ROLE");
        console.log("   Cannot update provider balance manually.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
