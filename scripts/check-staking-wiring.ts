import { ethers } from "hardhat";

async function main() {
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8";
    
    // Distributor addresses (from env or defaults)
    const NEW_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xEca88bcf4AE77e940b520565D918026464a94D8a";
    const OLD_DISTRIBUTOR = process.env.OLD_ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0";
    const LEGACY_DISTRIBUTOR = process.env.LEGACY_ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xf74dF81441D120E4e4EF1c5bCa9bcde6f44256C8";
    
    const stakingAbi = [
        "function zkMerkleDistributor() view returns (address)"
    ];
    
    const staking = await ethers.getContractAt(stakingAbi, STAKING_CONTRACT);
    const currentDistributor = await staking.zkMerkleDistributor();
    
    console.log("=".repeat(80));
    console.log("STAKING CONTRACT DISTRIBUTOR CONFIGURATION");
    console.log("=".repeat(80));
    console.log(`Staking Contract: ${STAKING_CONTRACT}`);
    console.log(`Current ZK Distributor: ${currentDistributor}`);
    console.log(`\nDistributor Addresses:`);
    console.log(`  NEW (Fixed ZK): ${NEW_DISTRIBUTOR}`);
    console.log(`  OLD (Previous): ${OLD_DISTRIBUTOR}`);
    console.log(`  LEGACY (Older): ${LEGACY_DISTRIBUTOR}`);
    
    if (currentDistributor.toLowerCase() === NEW_DISTRIBUTOR.toLowerCase()) {
        console.log("\n✅ Staking contract is wired to NEW distributor (Fixed ZK Logic)");
    } else if (currentDistributor.toLowerCase() === OLD_DISTRIBUTOR.toLowerCase()) {
        console.log("\n⚠️  Staking contract is still wired to OLD distributor");
        console.log("   Run: npx hardhat run scripts/wire-zk-distributor.ts --network <network>");
    } else if (currentDistributor.toLowerCase() === LEGACY_DISTRIBUTOR.toLowerCase()) {
        console.log("\n⚠️  Staking contract is wired to LEGACY distributor");
        console.log("   Run: npx hardhat run scripts/wire-zk-distributor.ts --network <network>");
    } else {
        console.log(`\n⚠️  Staking contract points to unknown distributor: ${currentDistributor}`);
        console.log("   Verify this is intentional or wire to new distributor");
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("WHAT THIS MEANS:");
    console.log("=".repeat(80));
    console.log("The DualPoolStaking contract has a function called fundProviderBalance().");
    console.log("When this function is called, it:");
    console.log("1. Checks that the staking contract has available balance");
    console.log("2. Approves the ZK distributor to pull tokens");
    console.log("3. Calls notifyRewardWithTransfer() on the distributor");
    console.log("4. The distributor then pulls tokens via transferFrom");
    console.log("\nThe 'wiring' means which distributor address is stored in");
    console.log("the staking contract's zkMerkleDistributor variable.");
    console.log("\nIf it's wired to the NEW distributor, funding will go to the new one.");
    console.log("If it's wired to the OLD distributor, funding will go to the old one.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
