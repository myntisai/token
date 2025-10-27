import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("🔄 Updating StakingContract to use new EmissionsUpgradeable...\n");

    const [deployer] = await ethers.getSigners();
    console.log(`Updating with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    const NEW_EMISSIONS_ADDRESS = process.env.EMISSIONS_CONTRACT_ADDRESS!;
    const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS!;

    console.log(`\n📋 Configuration:`);
    console.log(`  New Emissions:   ${NEW_EMISSIONS_ADDRESS}`);
    console.log(`  Staking Contract: ${STAKING_CONTRACT_ADDRESS}`);

    // Connect to StakingContract
    const StakingFactory = await ethers.getContractFactory("StakingContract");
    const staking = StakingFactory.attach(STAKING_CONTRACT_ADDRESS);

    // Check current emission contract
    console.log(`\n🔍 Checking current emission contract...`);
    try {
        const currentEmissions = await staking.emissionContract();
        console.log(`  Current: ${currentEmissions}`);
        
        if (currentEmissions.toLowerCase() === NEW_EMISSIONS_ADDRESS.toLowerCase()) {
            console.log(`  ✅ Already using the new emissions contract!`);
            return;
        }
    } catch (error: any) {
        console.log(`  ⚠️  Could not read current emission contract:`);
        console.log(`     ${error.message}`);
        console.log(`  This might indicate the StakingContract is in a bad state.`);
    }

    // Check if deployer has ADMIN_ROLE
    console.log(`\n🔐 Checking permissions...`);
    const ADMIN_ROLE = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE
    try {
        const hasAdminRole = await staking.hasRole(ADMIN_ROLE, deployer.address);
        console.log(`  Deployer has ADMIN_ROLE: ${hasAdminRole}`);
        
        if (!hasAdminRole) {
            console.log(`  ❌ ERROR: Deployer does not have ADMIN_ROLE!`);
            console.log(`     Cannot update emission contract.`);
            console.log(`     You need to use an account with admin privileges.`);
            return;
        }
    } catch (error: any) {
        console.log(`  ⚠️  Could not check role:`);
        console.log(`     ${error.message}`);
    }

    // Attempt to update emission contract
    console.log(`\n🔄 Attempting to update emission contract...`);
    try {
        // First, estimate gas to see if it would revert
        console.log(`  Estimating gas...`);
        const gasEstimate = await staking.setEmissionContract.estimateGas(NEW_EMISSIONS_ADDRESS);
        console.log(`  ✅ Gas estimate: ${gasEstimate.toString()}`);

        // If estimation succeeds, send the transaction
        console.log(`  Sending transaction...`);
        const tx = await staking.setEmissionContract(NEW_EMISSIONS_ADDRESS);
        console.log(`  Transaction hash: ${tx.hash}`);
        
        console.log(`  Waiting for confirmation...`);
        const receipt = await tx.wait();
        console.log(`  ✅ Transaction confirmed in block ${receipt?.blockNumber}`);
        
        // Verify the update
        const newEmissions = await staking.emissionContract();
        console.log(`\n✅ Successfully updated emission contract!`);
        console.log(`  New Emission Contract: ${newEmissions}`);
        
    } catch (error: any) {
        console.log(`  ❌ Failed to update emission contract:`);
        console.log(`     ${error.message}`);
        
        if (error.data) {
            console.log(`     Error data: ${error.data}`);
        }
        
        if (error.message.includes("execution reverted")) {
            console.log(`\n  ⚠️  The StakingContract is reverting on all calls.`);
            console.log(`     This suggests the contract itself is in a broken state.`);
            console.log(`\n  🔧 Possible Solutions:`);
            console.log(`     1. The StakingContract might need to be redeployed`);
            console.log(`     2. Or use a different admin account`);
            console.log(`     3. Or investigate why the contract is reverting`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



