import { ethers } from "hardhat";

/**
 * Wire ZKMerkleDistributor to DualPoolStaking
 * 
 * This script:
 * 1. Sets the ZKMerkleDistributor address in DualPoolStaking
 * 2. Grants PROVIDER_ROLE to the provider address
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("WIRE ZK MERKLE DISTRIBUTOR");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Configuration
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS;
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS;
    const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS;
    
    if (!STAKING_CONTRACT) {
        throw new Error("STAKING_CONTRACT_ADDRESS environment variable not set");
    }
    if (!ZK_DISTRIBUTOR) {
        throw new Error("ZK_MERKLE_DISTRIBUTOR_ADDRESS environment variable not set");
    }
    
    console.log(`\nStaking Contract: ${STAKING_CONTRACT}`);
    console.log(`ZK Distributor: ${ZK_DISTRIBUTOR}`);
    console.log(`Provider Address: ${PROVIDER_ADDRESS || "NOT SET (will skip role grant)"}`);
    
    // Get staking contract
    const stakingAbi = [
        "function setZkMerkleDistributor(address _zkMerkleDistributor) external",
        "function zkMerkleDistributor() view returns (address)"
    ];
    const staking = await ethers.getContractAt(stakingAbi, STAKING_CONTRACT);
    
    // Check current value
    const currentDistributor = await staking.zkMerkleDistributor();
    if (currentDistributor.toLowerCase() === ZK_DISTRIBUTOR.toLowerCase()) {
        console.log(`\n✅ ZKMerkleDistributor already set to ${ZK_DISTRIBUTOR}`);
    } else {
        console.log(`\n📝 Step 1: Setting ZKMerkleDistributor in DualPoolStaking...`);
        const tx1 = await staking.setZkMerkleDistributor(ZK_DISTRIBUTOR);
        await tx1.wait();
        console.log(`✅ ZKMerkleDistributor set`);
    }
    
    // Grant PROVIDER_ROLE if provider address is set
    if (PROVIDER_ADDRESS) {
        console.log(`\n📝 Step 2: Granting PROVIDER_ROLE to ${PROVIDER_ADDRESS}...`);
        const distributorAbi = [
            "function PROVIDER_ROLE() view returns (bytes32)",
            "function grantRole(bytes32 role, address account) external",
            "function hasRole(bytes32 role, address account) view returns (bool)"
        ];
        const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
        
        const providerRole = await distributor.PROVIDER_ROLE();
        const hasRole = await distributor.hasRole(providerRole, PROVIDER_ADDRESS);
        
        if (hasRole) {
            console.log(`✅ PROVIDER_ROLE already granted`);
        } else {
            const tx2 = await distributor.grantRole(providerRole, PROVIDER_ADDRESS);
            await tx2.wait();
            console.log(`✅ PROVIDER_ROLE granted`);
        }
    } else {
        console.log(`\n⚠️  PROVIDER_ADDRESS not set - skipping role grant`);
        console.log(`   To grant later, call:`);
        console.log(`   distributor.grantRole(await distributor.PROVIDER_ROLE(), <provider-address>)`);
    }
    
    console.log("\n✅ Wiring complete!");
    console.log(`\nNext steps:`);
    console.log(`1. Update claim-generation-service .env with:`);
    console.log(`   ZK_MERKLE_DISTRIBUTOR_ADDRESS=${ZK_DISTRIBUTOR}`);
    console.log(`2. Ensure backend ZK proof service is running`);
    console.log(`3. Test reward submission with ZK proofs`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
