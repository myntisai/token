import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("🔍 COMPREHENSIVE CONTRACT STATE AUDIT\n");
    console.log("=" .repeat(80));

    const [deployer] = await ethers.getSigners();
    console.log(`\n👤 Auditor Account: ${deployer.address}`);
    console.log(`   Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    // Contract addresses
    const MYNTIS_TOKEN = process.env.MYNTIS_TOKEN_ADDRESS!;
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS!;
    const OLD_EMISSIONS = "0x53F6Ad26179DD689227f15924011d34469086346";
    const NEW_EMISSIONS = process.env.EMISSIONS_CONTRACT_ADDRESS!;
    const MERKLE_DISTRIBUTOR = process.env.MERKLE_DISTRIBUTOR_ADDRESS!;

    console.log(`\n📋 Contract Addresses:`);
    console.log(`   Token:              ${MYNTIS_TOKEN}`);
    console.log(`   Staking:            ${STAKING_CONTRACT}`);
    console.log(`   Emissions (Old):    ${OLD_EMISSIONS}`);
    console.log(`   Emissions (New):    ${NEW_EMISSIONS}`);
    console.log(`   Merkle Distributor: ${MERKLE_DISTRIBUTOR}`);

    // ============================================================
    // 1. MYNTIS TOKEN STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🪙  MYNTIS TOKEN STATE`);
    console.log(`${"=".repeat(80)}`);

    try {
        const TokenFactory = await ethers.getContractFactory("MyntisToken");
        const token = TokenFactory.attach(MYNTIS_TOKEN);

        const name = await token.name();
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        const totalSupply = await token.totalSupply();

        console.log(`\n✅ Basic Info:`);
        console.log(`   Name:         ${name}`);
        console.log(`   Symbol:       ${symbol}`);
        console.log(`   Decimals:     ${decimals}`);
        console.log(`   Total Supply: ${ethers.formatEther(totalSupply)} tokens`);

        // Check balances of key addresses
        console.log(`\n💰 Token Distribution:`);
        
        const deployerBalance = await token.balanceOf(deployer.address);
        console.log(`   Deployer:           ${ethers.formatEther(deployerBalance)} tokens`);

        const stakingBalance = await token.balanceOf(STAKING_CONTRACT);
        console.log(`   Staking Contract:   ${ethers.formatEther(stakingBalance)} tokens`);

        const oldEmissionsBalance = await token.balanceOf(OLD_EMISSIONS);
        console.log(`   Old Emissions:      ${ethers.formatEther(oldEmissionsBalance)} tokens`);

        const newEmissionsBalance = await token.balanceOf(NEW_EMISSIONS);
        console.log(`   New Emissions:      ${ethers.formatEther(newEmissionsBalance)} tokens`);

        const merkleBalance = await token.balanceOf(MERKLE_DISTRIBUTOR);
        console.log(`   Merkle Distributor: ${ethers.formatEther(merkleBalance)} tokens`);

        const totalAccountedFor = deployerBalance + stakingBalance + oldEmissionsBalance + newEmissionsBalance + merkleBalance;
        const unaccountedFor = totalSupply - totalAccountedFor;

        console.log(`\n📊 Supply Accounting:`);
        console.log(`   Total Supply:       ${ethers.formatEther(totalSupply)} tokens`);
        console.log(`   Accounted For:      ${ethers.formatEther(totalAccountedFor)} tokens`);
        console.log(`   Unaccounted For:    ${ethers.formatEther(unaccountedFor)} tokens`);
        
        if (unaccountedFor > 0n) {
            const percentUnaccounted = Number(unaccountedFor * 10000n / totalSupply) / 100;
            console.log(`   ⚠️  ${percentUnaccounted.toFixed(2)}% of supply in other addresses`);
        }

        // Check roles
        console.log(`\n🔐 Token Roles & Permissions:`);
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

        const hasDeployerAdmin = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        const hasDeployerMinter = await token.hasRole(MINTER_ROLE, deployer.address);
        const hasOldEmissionsMinter = await token.hasRole(MINTER_ROLE, OLD_EMISSIONS);
        const hasNewEmissionsMinter = await token.hasRole(MINTER_ROLE, NEW_EMISSIONS);
        const hasStakingMinter = await token.hasRole(MINTER_ROLE, STAKING_CONTRACT);

        console.log(`   Deployer has ADMIN: ${hasDeployerAdmin}`);
        console.log(`   Deployer has MINTER: ${hasDeployerMinter}`);
        console.log(`   Old Emissions has MINTER: ${hasOldEmissionsMinter}`);
        console.log(`   New Emissions has MINTER: ${hasNewEmissionsMinter}`);
        console.log(`   Staking has MINTER: ${hasStakingMinter}`);

    } catch (error: any) {
        console.log(`\n❌ ERROR reading token state:`);
        console.log(`   ${error.message}`);
    }

    // ============================================================
    // 2. OLD EMISSIONS CONTRACT STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🏭 OLD EMISSIONS CONTRACT STATE`);
    console.log(`${"=".repeat(80)}`);

    try {
        const OldEmissionsFactory = await ethers.getContractFactory("Emissions");
        const oldEmissions = OldEmissionsFactory.attach(OLD_EMISSIONS);

        const stats = await oldEmissions.getEmissionStats();
        
        console.log(`\n📊 Emission Stats:`);
        console.log(`   Current Rate:        ${ethers.formatEther(stats.currentRate)} tokens/sec`);
        console.log(`   Total Emitted:       ${ethers.formatEther(stats.totalEmitted_)} tokens`);
        console.log(`   Minted Emissions:    ${ethers.formatEther(stats.mintedEmissions_)} tokens`);
        console.log(`   Remaining Emissions: ${ethers.formatEther(stats.remainingEmissions)} tokens`);
        console.log(`   Unaccounted:         ${ethers.formatEther(stats.unaccounted_)} tokens`);

        const overrun = stats.mintedEmissions_ > stats.totalEmitted_;
        if (overrun) {
            const diff = stats.mintedEmissions_ - stats.totalEmitted_;
            console.log(`\n🚨 OVERRUN DETECTED:`);
            console.log(`   Minted > Emitted by: ${ethers.formatEther(diff)} tokens`);
            console.log(`   This is ${Number(diff * 10000n / stats.totalEmitted_) / 100}% over the scheduled emissions!`);
        }

        const startTime = await oldEmissions.startTime();
        const lastRewardTime = await oldEmissions.lastRewardTime();
        const accRewardPerShare = await oldEmissions.accRewardPerShare();

        console.log(`\n⏰ Timing:`);
        console.log(`   Start Time:       ${new Date(Number(startTime) * 1000).toISOString()}`);
        console.log(`   Last Reward Time: ${new Date(Number(lastRewardTime) * 1000).toISOString()}`);
        console.log(`   Current Time:     ${new Date().toISOString()}`);
        
        const timeSinceStart = BigInt(Math.floor(Date.now() / 1000)) - startTime;
        console.log(`   Time Since Start: ${Number(timeSinceStart) / 86400} days`);

        console.log(`\n📈 Accumulated Rewards:`);
        console.log(`   Acc Reward Per Share: ${accRewardPerShare.toString()}`);

    } catch (error: any) {
        console.log(`\n❌ ERROR reading old emissions state:`);
        console.log(`   ${error.message}`);
    }

    // ============================================================
    // 3. NEW EMISSIONS CONTRACT STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🏭 NEW EMISSIONS CONTRACT STATE (EmissionsUpgradeable)`);
    console.log(`${"=".repeat(80)}`);

    try {
        const NewEmissionsFactory = await ethers.getContractFactory("EmissionsUpgradeable");
        const newEmissions = NewEmissionsFactory.attach(NEW_EMISSIONS);

        const stats = await newEmissions.getEmissionStats();
        
        console.log(`\n📊 Emission Stats:`);
        console.log(`   Current Rate:        ${ethers.formatEther(stats.currentRate)} tokens/sec`);
        console.log(`   Total Emitted:       ${ethers.formatEther(stats.totalEmitted_)} tokens`);
        console.log(`   Minted Emissions:    ${ethers.formatEther(stats.mintedEmissions_)} tokens`);
        console.log(`   Remaining Emissions: ${ethers.formatEther(stats.remainingEmissions)} tokens`);
        console.log(`   Unaccounted:         ${ethers.formatEther(stats.unaccounted_)} tokens`);

        const overrun = stats.mintedEmissions_ > stats.totalEmitted_;
        if (overrun) {
            const diff = stats.mintedEmissions_ - stats.totalEmitted_;
            console.log(`\n⚠️  INHERITED OVERRUN:`);
            console.log(`   Minted > Emitted by: ${ethers.formatEther(diff)} tokens`);
            console.log(`   (This was migrated from the old contract)`);
        }

        const startTime = await newEmissions.startTime();
        const lastRewardTime = await newEmissions.lastRewardTime();
        const accRewardPerShare = await newEmissions.accRewardPerShare();

        console.log(`\n⏰ Timing:`);
        console.log(`   Start Time:       ${new Date(Number(startTime) * 1000).toISOString()}`);
        console.log(`   Last Reward Time: ${new Date(Number(lastRewardTime) * 1000).toISOString()}`);

        console.log(`\n📈 Accumulated Rewards:`);
        console.log(`   Acc Reward Per Share: ${accRewardPerShare.toString()}`);

        // Check if it points to correct staking contract
        const stakingContractAddr = await newEmissions.stakingContract();
        console.log(`\n🔗 Configuration:`);
        console.log(`   Staking Contract: ${stakingContractAddr}`);
        console.log(`   Matches expected: ${stakingContractAddr.toLowerCase() === STAKING_CONTRACT.toLowerCase()}`);

        const tokenAddr = await newEmissions.token();
        console.log(`   Token Contract:   ${tokenAddr}`);
        console.log(`   Matches expected: ${tokenAddr.toLowerCase() === MYNTIS_TOKEN.toLowerCase()}`);

    } catch (error: any) {
        console.log(`\n❌ ERROR reading new emissions state:`);
        console.log(`   ${error.message}`);
    }

    // ============================================================
    // 4. STAKING CONTRACT STATE (THE PROBLEM CHILD)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🏦 STAKING CONTRACT STATE - DEEP DIVE`);
    console.log(`${"=".repeat(80)}`);

    try {
        const StakingFactory = await ethers.getContractFactory("StakingContract");
        const staking = StakingFactory.attach(STAKING_CONTRACT);

        console.log(`\n🔍 Testing Contract Responsiveness...`);

        // Try to read basic state
        let canReadState = false;
        let totalStaked = 0n;
        let emissionContractAddr = "";

        try {
            totalStaked = await staking.getTotalStaked();
            console.log(`   ✅ getTotalStaked():  ${ethers.formatEther(totalStaked)} tokens`);
            canReadState = true;
        } catch (e: any) {
            console.log(`   ❌ getTotalStaked():  REVERTED - ${e.message.split('\n')[0]}`);
        }

        try {
            emissionContractAddr = await staking.emissionContract();
            console.log(`   ✅ emissionContract(): ${emissionContractAddr}`);
            canReadState = true;
        } catch (e: any) {
            console.log(`   ❌ emissionContract(): REVERTED - ${e.message.split('\n')[0]}`);
        }

        try {
            const token = await staking.token();
            console.log(`   ✅ token():            ${token}`);
            canReadState = true;
        } catch (e: any) {
            console.log(`   ❌ token():            REVERTED - ${e.message.split('\n')[0]}`);
        }

        if (!canReadState) {
            console.log(`\n🚨 CRITICAL: Staking contract is COMPLETELY UNRESPONSIVE!`);
            console.log(`   All state read functions are reverting.`);
            console.log(`\n🔍 Possible Causes:`);
            console.log(`   1. Contract was never properly initialized`);
            console.log(`   2. Storage corruption from failed upgrade attempt`);
            console.log(`   3. Critical bug in contract logic`);
            console.log(`   4. Malicious attack that broke the contract`);
            
            // Try to read raw storage slots
            console.log(`\n🔬 Reading Raw Storage Slots...`);
            for (let slot = 0; slot < 10; slot++) {
                try {
                    const value = await ethers.provider.getStorage(STAKING_CONTRACT, slot);
                    console.log(`   Slot ${slot}: ${value}`);
                } catch (e) {
                    console.log(`   Slot ${slot}: ERROR`);
                }
            }
        } else {
            // If we can read state, get more details
            console.log(`\n📊 Staking Statistics:`);
            console.log(`   Total Staked:     ${ethers.formatEther(totalStaked)} tokens`);
            
            if (emissionContractAddr) {
                console.log(`   Emission Contract: ${emissionContractAddr}`);
                if (emissionContractAddr.toLowerCase() === OLD_EMISSIONS.toLowerCase()) {
                    console.log(`   ⚠️  Still pointing to OLD emissions contract!`);
                } else if (emissionContractAddr.toLowerCase() === NEW_EMISSIONS.toLowerCase()) {
                    console.log(`   ✅ Pointing to NEW emissions contract!`);
                } else {
                    console.log(`   ❓ Pointing to UNKNOWN emissions contract!`);
                }
            }

            // Try to get provider info for deployer
            try {
                const providerInfo = await staking.getProviderInfo(deployer.address);
                console.log(`\n👤 Deployer's Provider Info:`);
                console.log(`   Stake:       ${ethers.formatEther(providerInfo.stake)} tokens`);
                console.log(`   Reward Debt: ${ethers.formatEther(providerInfo.rewardDebt)} tokens`);
            } catch (e: any) {
                console.log(`\n👤 Deployer's Provider Info:`);
                console.log(`   ❌ Cannot read: ${e.message.split('\n')[0]}`);
            }
        }

        // Check roles
        console.log(`\n🔐 Staking Contract Roles:`);
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
        try {
            const hasAdmin = await staking.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
            console.log(`   Deployer has ADMIN: ${hasAdmin}`);
        } catch (e: any) {
            console.log(`   ❌ Cannot check role: ${e.message.split('\n')[0]}`);
        }

    } catch (error: any) {
        console.log(`\n❌ CATASTROPHIC ERROR with Staking Contract:`);
        console.log(`   ${error.message}`);
        console.log(`\n   This contract is likely completely broken or malicious.`);
    }

    // ============================================================
    // 5. SECURITY ANALYSIS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🛡️  SECURITY ANALYSIS`);
    console.log(`${"=".repeat(80)}`);

    console.log(`\n🔍 Checking for suspicious activity...`);

    try {
        const TokenFactory = await ethers.getContractFactory("MyntisToken");
        const token = TokenFactory.attach(MYNTIS_TOKEN);
        
        const totalSupply = await token.totalSupply();
        const EXPECTED_MAX_SUPPLY = ethers.parseEther("1000000000"); // 1B tokens

        if (totalSupply > EXPECTED_MAX_SUPPLY) {
            console.log(`\n🚨 ALERT: Total supply exceeds expected maximum!`);
            console.log(`   Current:  ${ethers.formatEther(totalSupply)} tokens`);
            console.log(`   Expected: ${ethers.formatEther(EXPECTED_MAX_SUPPLY)} tokens`);
            console.log(`   Excess:   ${ethers.formatEther(totalSupply - EXPECTED_MAX_SUPPLY)} tokens`);
            console.log(`   This could indicate unauthorized minting!`);
        } else {
            console.log(`\n✅ Total supply is within expected bounds`);
            console.log(`   Current: ${ethers.formatEther(totalSupply)} / ${ethers.formatEther(EXPECTED_MAX_SUPPLY)} tokens`);
        }

        // Check if any unexpected addresses have minter role
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const suspiciousAddresses = [
            "0x0000000000000000000000000000000000000000",
            deployer.address,
        ];

        console.log(`\n🔐 Minter Role Audit:`);
        for (const addr of suspiciousAddresses) {
            const hasMinter = await token.hasRole(MINTER_ROLE, addr);
            if (hasMinter && addr !== OLD_EMISSIONS && addr !== NEW_EMISSIONS) {
                console.log(`   ⚠️  ${addr} has MINTER_ROLE (unexpected!)`);
            }
        }

    } catch (error: any) {
        console.log(`\n❌ Could not complete security analysis: ${error.message}`);
    }

    // ============================================================
    // 6. FINAL DIAGNOSIS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📋 FINAL DIAGNOSIS`);
    console.log(`${"=".repeat(80)}\n`);

    console.log(`Summary of findings will be printed above.`);
    console.log(`Review all sections carefully for issues.\n`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



