import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("🔬 DEEP STORAGE ANALYSIS - STAKING CONTRACT\n");
    console.log("=" .repeat(80));

    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS!;
    console.log(`\nStaking Contract: ${STAKING_CONTRACT}\n`);

    // Read raw storage slots based on StakingContract layout
    console.log("📦 Raw Storage Slots:\n");

    // Storage layout for StakingContract:
    // Slot 0: AccessControl _roles mapping base
    // Slot 1: ReentrancyGuard _status
    // Slot 2: token (immutable, not in storage)
    // Slot 3: emissionContract address
    // Slot 4: merkleDistributor address
    // Slot 5: minimumStake
    // Slot 6: totalStake
    // Slot 7+: providers mapping base
    // Slot 8+: registered mapping base
    // Slot 9+: allProviders array

    const slots = [
        { slot: 0, name: "AccessControl _roles base" },
        { slot: 1, name: "ReentrancyGuard _status" },
        { slot: 2, name: "Should be empty (token is immutable)" },
        { slot: 3, name: "emissionContract address" },
        { slot: 4, name: "merkleDistributor address" },
        { slot: 5, name: "minimumStake" },
        { slot: 6, name: "totalStake" },
        { slot: 7, name: "providers mapping base" },
        { slot: 8, name: "registered mapping base" },
        { slot: 9, name: "allProviders array length" },
    ];

    for (const { slot, name } of slots) {
        try {
            const value = await ethers.provider.getStorage(STAKING_CONTRACT, slot);
            console.log(`Slot ${slot} (${name}):`);
            console.log(`  Raw: ${value}`);
            
            // Try to interpret the value
            if (slot === 3 || slot === 4) {
                // Address slots
                const address = "0x" + value.slice(-40);
                console.log(`  As Address: ${address}`);
                
                if (parseInt(value, 16) === 0) {
                    console.log(`  ⚠️  THIS IS ZERO! Contract not set!`);
                }
            } else if (slot === 5 || slot === 6) {
                // Uint256 slots
                const num = BigInt(value);
                console.log(`  As Uint256: ${num.toString()}`);
                if (num > 0n) {
                    console.log(`  As Ether: ${ethers.formatEther(num)} tokens`);
                }
            } else if (slot === 1) {
                // ReentrancyGuard status (1 = not entered, 2 = entered)
                const status = parseInt(value, 16);
                console.log(`  Status: ${status} (${status === 1 ? "Not Entered" : status === 2 ? "ENTERED (LOCKED!)" : "Unknown"})`);
                if (status === 2) {
                    console.log(`  🚨 CONTRACT IS LOCKED IN REENTRANCY STATE!`);
                }
            } else if (slot === 9) {
                // Array length
                const length = parseInt(value, 16);
                console.log(`  Array Length: ${length}`);
            }
            console.log();
        } catch (e: any) {
            console.log(`Slot ${slot}: ERROR - ${e.message}\n`);
        }
    }

    // Check specific provider storage
    console.log("\n" + "=".repeat(80));
    console.log("🔍 CHECKING PROVIDERS MAPPING\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = deployer.address;

    // Calculate storage slot for providers[deployer]
    // providers is at slot 7 (mapping)
    const providersMappingSlot = 7;
    
    // For mapping(address => Info), the slot is: keccak256(abi.encode(key, slot))
    const providerSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [deployerAddress, providersMappingSlot]
        )
    );

    console.log(`Provider: ${deployerAddress}`);
    console.log(`Calculated slot: ${providerSlot}\n`);

    try {
        // Info struct: { stake: uint256, rewardDebt: uint256 }
        // stake is at providerSlot
        // rewardDebt is at providerSlot + 1
        
        const stakeValue = await ethers.provider.getStorage(STAKING_CONTRACT, providerSlot);
        const stakeSlotPlus1 = BigInt(providerSlot) + 1n;
        const rewardDebtValue = await ethers.provider.getStorage(STAKING_CONTRACT, "0x" + stakeSlotPlus1.toString(16));

        console.log(`Stake (slot ${providerSlot}):`);
        console.log(`  Raw: ${stakeValue}`);
        const stake = BigInt(stakeValue);
        console.log(`  Value: ${ethers.formatEther(stake)} tokens`);

        console.log(`\nReward Debt (slot 0x${stakeSlotPlus1.toString(16)}):`);
        console.log(`  Raw: ${rewardDebtValue}`);
        const rewardDebt = BigInt(rewardDebtValue);
        console.log(`  Value: ${ethers.formatEther(rewardDebt)} tokens`);

    } catch (e: any) {
        console.log(`Error reading provider info: ${e.message}`);
    }

    // Check registered mapping
    console.log("\n" + "=".repeat(80));
    console.log("🔍 CHECKING REGISTERED MAPPING\n");

    const registeredMappingSlot = 8;
    const registeredSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [deployerAddress, registeredMappingSlot]
        )
    );

    try {
        const registeredValue = await ethers.provider.getStorage(STAKING_CONTRACT, registeredSlot);
        const isRegistered = parseInt(registeredValue, 16) === 1;
        console.log(`Provider: ${deployerAddress}`);
        console.log(`Registered: ${isRegistered}`);
        console.log(`Raw value: ${registeredValue}\n`);
    } catch (e: any) {
        console.log(`Error: ${e.message}\n`);
    }

    // Try to call the contract functions directly
    console.log("=".repeat(80));
    console.log("🧪 TESTING CONTRACT FUNCTION CALLS\n");

    const StakingFactory = await ethers.getContractFactory("StakingContract");
    const staking = StakingFactory.attach(STAKING_CONTRACT);

    // Test each function
    const tests = [
        { name: "getTotalStaked()", fn: () => staking.getTotalStaked() },
        { name: "token()", fn: () => staking.token() },
        { name: "emissionContract()", fn: () => staking.emissionContract() },
        { name: "merkleDistributor()", fn: () => staking.merkleDistributor() },
        { name: "minimumStake()", fn: () => staking.minimumStake() },
        { name: "totalStake()", fn: () => staking.totalStake() },
        { name: "getProviderInfo(deployer)", fn: () => staking.getProviderInfo(deployerAddress) },
    ];

    for (const test of tests) {
        try {
            const result = await test.fn();
            console.log(`✅ ${test.name}:`);
            console.log(`   Result: ${result.toString()}`);
        } catch (e: any) {
            console.log(`❌ ${test.name}:`);
            console.log(`   Error: ${e.message.split('\n')[0]}`);
            
            // Try to decode the revert reason
            if (e.data) {
                try {
                    const reason = ethers.toUtf8String("0x" + e.data.slice(138));
                    console.log(`   Revert Reason: "${reason}"`);
                } catch {
                    console.log(`   Revert Data: ${e.data}`);
                }
            }
        }
        console.log();
    }

    console.log("=".repeat(80));
    console.log("📋 DIAGNOSIS COMPLETE\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



