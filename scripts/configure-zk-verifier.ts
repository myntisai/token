import { ethers } from "hardhat";

/**
 * Configure RewardClaimVerifier with DISTRIBUTOR_ROLE for ZKMerkleDistributor
 */

// Deployed addresses (update these)
const REWARD_CLAIM_VERIFIER = "0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978";
const ZK_MERKLE_DISTRIBUTOR = "0x01AD9e797234026c61E523BC9BaB2293Ac140F6a";

async function main() {
    console.log("=".repeat(80));
    console.log("CONFIGURE REWARD CLAIM VERIFIER");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    console.log(`\nDeployer: ${deployer.address}`);

    // Get verifier contract
    const Verifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = Verifier.attach(REWARD_CLAIM_VERIFIER);

    console.log(`\nVerifier: ${REWARD_CLAIM_VERIFIER}`);
    console.log(`Distributor: ${ZK_MERKLE_DISTRIBUTOR}`);

    // Check if distributor already has role
    const DISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE"));
    const hasRole = await verifier.hasRole(DISTRIBUTOR_ROLE, ZK_MERKLE_DISTRIBUTOR);

    if (hasRole) {
        console.log(`\n✅ ZKMerkleDistributor already has DISTRIBUTOR_ROLE`);
    } else {
        console.log(`\nGranting DISTRIBUTOR_ROLE to ZKMerkleDistributor...`);
        const tx = await verifier.grantDistributorRole(ZK_MERKLE_DISTRIBUTOR);
        console.log(`  Transaction: ${tx.hash}`);
        await tx.wait();
        console.log(`  ✅ DISTRIBUTOR_ROLE granted`);

        // Verify
        const verified = await verifier.hasRole(DISTRIBUTOR_ROLE, ZK_MERKLE_DISTRIBUTOR);
        console.log(`  Verified: ${verified ? '✅' : '❌'}`);
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("ZK PROOF CONFIGURATION COMPLETE");
    console.log("=".repeat(80));
    console.log(`
ZK proof claiming is now enabled!

When submitting a ZK-enabled epoch:
1. Provider calls: distributor.submitMerkleRoot(root, expiry, amount, true)
2. Users generate ZK proofs off-chain
3. Users call: distributor.claimWithZK(provider, rootIndex, amount, merkleProof, zkProof, publicInputs)

The ZK proof verifies:
- User is in the Merkle tree with the claimed amount
- User hasn't double-claimed (nullifier check)
- AI quality score meets threshold
`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
