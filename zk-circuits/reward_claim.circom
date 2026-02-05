pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * @title RewardClaim
 * @notice ZK circuit for privacy-preserving reward claims
 * @dev Verifies AI legitimacy score, reward multiplier, and Merkle proof membership
 * @dev Generates nullifier to prevent double-claiming
 */
template RewardClaim() {
    // Public inputs (visible to verifier)
    signal input merkleRoot;
    signal input nullifier;
    signal input claimAmount;
    
    // Private inputs (hidden from verifier)
    signal input userAddress;
    signal input aiLegitimacyScore;      // From AI model (0-100)
    signal input aiRewardMultiplier;     // From AI model (10-10000 = 0.1x-10x)
    signal input merkleProof[8];
    signal input merklePathIndices[8];
    
    // Verify AI legitimacy score is within valid range (0-100)
    component legitimacyCheck = LessEqThan(32);
    legitimacyCheck.in[0] <== aiLegitimacyScore;
    legitimacyCheck.in[1] <== 100;
    legitimacyCheck.out === 1;
    
    // Verify AI legitimacy score is non-negative
    component legitimacyMinCheck = GreaterEqThan(32);
    legitimacyMinCheck.in[0] <== aiLegitimacyScore;
    legitimacyMinCheck.in[1] <== 0;
    legitimacyMinCheck.out === 1;
    
    // Verify reward multiplier is within valid bounds (10-10000)
    component multiplierLowCheck = GreaterEqThan(32);
    multiplierLowCheck.in[0] <== aiRewardMultiplier;
    multiplierLowCheck.in[1] <== 10; // 0.1x minimum
    multiplierLowCheck.out === 1;
    
    component multiplierHighCheck = LessEqThan(32);
    multiplierHighCheck.in[0] <== aiRewardMultiplier;
    multiplierHighCheck.in[1] <== 10000; // 10x maximum
    multiplierHighCheck.out === 1;
    
    // Verify claim amount is positive
    component amountCheck = GreaterThan(32);
    amountCheck.in[0] <== claimAmount;
    amountCheck.in[1] <== 0;
    amountCheck.out === 1;
    
    // Verify Merkle proof (user is in reward distribution)
    component merkleVerifier = MerkleTreeVerifier(8);
    merkleVerifier.leaf <== Poseidon(2)([userAddress, claimAmount]);
    merkleVerifier.root <== merkleRoot;
    for (var i = 0; i < 8; i++) {
        merkleVerifier.pathElements[i] <== merkleProof[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }
    merkleVerifier.root === merkleRoot;
    
    // Generate nullifier to prevent double-claiming
    // nullifier = Poseidon(userAddress, merkleRoot)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== userAddress;
    nullifierHasher.inputs[1] <== merkleRoot;
    nullifierHasher.out === nullifier;
    
    // Verify AI score consistency with reward multiplier
    // Higher legitimacy score should generally lead to higher multiplier
    // This is a basic consistency check
    component scoreMultiplierCheck = LessEqThan(32);
    scoreMultiplierCheck.in[0] <== aiLegitimacyScore * 100; // Scale to 0-10000
    scoreMultiplierCheck.in[1] <== aiRewardMultiplier;
    scoreMultiplierCheck.out === 1;
}

/**
 * @title MerkleTreeVerifier
 * @notice Verifies Merkle proof for membership in reward distribution
 */
template MerkleTreeVerifier(n) {
    signal input leaf;
    signal input root;
    signal input pathElements[n];
    signal input pathIndices[n];
    
    component hashers[n];
    
    // First hash: leaf with first path element
    hashers[0] = Poseidon(2);
    hashers[0].inputs[0] <== leaf;
    hashers[0].inputs[1] <== pathElements[0];
    
    // Subsequent hashes: previous hash with next path element
    for (var i = 1; i < n; i++) {
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== hashers[i-1].out;
        hashers[i].inputs[1] <== pathElements[i];
    }
    
    // Final hash should equal root
    hashers[n-1].out === root;
}

component main {public [merkleRoot, nullifier, claimAmount]} = RewardClaim();
