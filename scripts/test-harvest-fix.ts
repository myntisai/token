import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("🧪 Testing Harvest Fix on New Emissions Contract...\n");

    const [deployer] = await ethers.getSigners();
    console.log(`Testing with account: ${deployer.address}`);

    const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS!;
    const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS!;
    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS!;
    const merkleAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS!;

    console.log(`\n📋 Configuration:`);
    console.log(`  Emissions (New): ${emissionsAddress}`);
    console.log(`  Staking Contract: ${stakingAddress}`);
    console.log(`  Merkle Distributor: ${merkleAddress}`);

    const emissions = await ethers.getContractAt("EmissionsUpgradeable", emissionsAddress);
    const staking = await ethers.getContractAt("StakingContract", stakingAddress);
    const merkle = await ethers.getContractAt("MerkleDistributor", merkleAddress);
    const token = await ethers.getContractAt("MyntisToken", tokenAddress);

    console.log(`\n📊 Emission Stats:`);
    const stats = await emissions.getEmissionStats();
    console.log(`  Current Rate:        ${ethers.formatEther(stats.currentRate)} tokens/sec`);
    console.log(`  Total Emitted:       ${ethers.formatEther(stats.totalEmitted_)} tokens`);
    console.log(`  Minted Emissions:    ${ethers.formatEther(stats.mintedEmissions_)} tokens`);
    console.log(`  Remaining Emissions: ${ethers.formatEther(stats.remainingEmissions)} tokens`);
    console.log(`  Unaccounted:         ${ethers.formatEther(stats.unaccounted_)} tokens`);

    const providerAddress = deployer.address;
    const providerInfo = await staking.getProviderInfo(providerAddress);
    console.log(`\n👤 Provider Info (${providerAddress}):`);
    console.log(`  Stake:       ${ethers.formatEther(providerInfo[0])} tokens`);
    console.log(`  Reward Debt: ${ethers.formatEther(providerInfo[1])} tokens`);

    const pending = await emissions.pendingRewards(providerAddress);
    console.log(`  Pending:     ${ethers.formatEther(pending)} tokens`);

    if (pending > 0n) {
        console.log(`\n🧪 Simulating Harvest...`);
        const remainingEmissions = stats.totalEmitted_ > stats.mintedEmissions_
            ? stats.totalEmitted_ - stats.mintedEmissions_
            : 0n;
        if (pending <= remainingEmissions) {
            console.log(`✅ Harvest would succeed! (${ethers.formatEther(pending)} <= ${ethers.formatEther(remainingEmissions)})`);
        } else {
            console.log(`⚠️  Harvest capped to remaining emissions.`);
            console.log(`   Pending:   ${ethers.formatEther(pending)} tokens`);
            console.log(`   Remaining: ${ethers.formatEther(remainingEmissions)} tokens`);
        }

        if (process.env.EXECUTE_HARVEST === "true") {
            console.log(`\n🚀 Executing harvestRewards()...`);
            const merkleBalanceBefore = await token.balanceOf(merkleAddress);
            const tx = await staking.connect(deployer).harvestRewards({ gasLimit: 2_000_000 });
            console.log(`  Submitted tx: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`  ✅ Harvest confirmed in block ${receipt.blockNumber}`);
            const merkleBalanceAfter = await token.balanceOf(merkleAddress);
            const harvestedAmount = merkleBalanceAfter - merkleBalanceBefore;
            console.log(`  Harvested amount queued in MerkleDistributor: ${ethers.formatEther(harvestedAmount)} MYNT`);
            const providerBalance = await merkle.providerBalance(providerAddress);
            console.log(`  Provider balance recorded: ${ethers.formatEther(providerBalance)} MYNT`);
        } else {
            console.log(`\nℹ️  Set EXECUTE_HARVEST=true to run a live harvest transaction.`);
        }
    } else {
        console.log(`\nℹ️  No pending rewards to harvest.`);
    }

    console.log(`\n🔗 Checking Staking Contract Configuration...`);
    const stakingEmission = await staking.emissionContract();
    console.log(`  Staking Contract's Emission Contract: ${stakingEmission}`);
    console.log(`  ${stakingEmission.toLowerCase() === emissionsAddress.toLowerCase() ? '✅' : '⚠️'} Staking contract is using the expected emissions contract.`);

    console.log(`\n✅ Test complete!`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
