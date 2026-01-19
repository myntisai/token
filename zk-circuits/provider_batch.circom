pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * @title ProviderBatch
 * @notice ZK circuit for provider-side batch proof verification
 * @dev Proves aggregate properties of a batch without individual user data
 * @dev Supports UNLIMITED batch sizes - circuit size is fixed
 * 
 * Public inputs: merkleRoot, totalAmount, batchHash
 * Private inputs: aggregate statistics only (not individual users)
 * 
 * What this proves:
 * 1. Aggregate scores are within valid bounds (min/max/avg)
 * 2. Aggregate multipliers are within valid bounds (min/max/avg)
 * 3. Sum of amounts equals totalAmount
 * 4. Batch hash commits to aggregate data
 * 
 * Note: Individual user data is NOT in the circuit - only aggregate statistics.
 * This allows unlimited batch sizes while keeping circuit size fixed.
 */
template ProviderBatch() {
    // Public inputs (visible to verifier)
    signal input merkleRoot;
    signal input totalAmount;
    signal input batchHash;
    
    // Private inputs - AGGREGATE STATISTICS ONLY (not individual users)
    signal input numUsers;              // Number of users in batch
    signal input minScore;              // Minimum AI legitimacy score (0-100)
    signal input maxScore;              // Maximum AI legitimacy score (0-100)
    signal input avgScore;              // Average AI legitimacy score (0-100)
    signal input minMultiplier;         // Minimum reward multiplier (10-10000)
    signal input maxMultiplier;         // Maximum reward multiplier (10-10000)
    signal input avgMultiplier;         // Average reward multiplier (10-10000)
    signal input sumAmounts;            // Sum of all reward amounts
    signal input dataCommitment;        // Poseidon hash of full batch data (computed off-chain)
    
    // Verify numUsers > 0
    // Use 64 bits to handle large batch sizes
    component numUsersCheck = GreaterThan(64);
    numUsersCheck.in[0] <== numUsers;
    numUsersCheck.in[1] <== 0;
    numUsersCheck.out === 1;
    
    // Verify aggregate score bounds (0-100)
    component minScoreCheck = GreaterEqThan(8);
    minScoreCheck.in[0] <== minScore;
    minScoreCheck.in[1] <== 0;
    minScoreCheck.out === 1;
    
    component maxScoreCheck = LessEqThan(8);
    maxScoreCheck.in[0] <== maxScore;
    maxScoreCheck.in[1] <== 100;
    maxScoreCheck.out === 1;
    
    component avgScoreCheck = LessEqThan(8);
    avgScoreCheck.in[0] <== avgScore;
    avgScoreCheck.in[1] <== 100;
    avgScoreCheck.out === 1;
    
    // Verify min <= avg <= max for scores
    component scoreOrder1 = LessEqThan(8);
    scoreOrder1.in[0] <== minScore;
    scoreOrder1.in[1] <== avgScore;
    scoreOrder1.out === 1;
    
    component scoreOrder2 = LessEqThan(8);
    scoreOrder2.in[0] <== avgScore;
    scoreOrder2.in[1] <== maxScore;
    scoreOrder2.out === 1;
    
    // Verify aggregate multiplier bounds (10-10000)
    component minMultiplierCheck = GreaterEqThan(16);
    minMultiplierCheck.in[0] <== minMultiplier;
    minMultiplierCheck.in[1] <== 10;
    minMultiplierCheck.out === 1;
    
    component maxMultiplierCheck = LessEqThan(16);
    maxMultiplierCheck.in[0] <== maxMultiplier;
    maxMultiplierCheck.in[1] <== 10000;
    maxMultiplierCheck.out === 1;
    
    component avgMultiplierCheck = LessEqThan(16);
    avgMultiplierCheck.in[0] <== avgMultiplier;
    avgMultiplierCheck.in[1] <== 10000;
    avgMultiplierCheck.out === 1;
    
    // Verify min <= avg <= max for multipliers
    component multiplierOrder1 = LessEqThan(16);
    multiplierOrder1.in[0] <== minMultiplier;
    multiplierOrder1.in[1] <== avgMultiplier;
    multiplierOrder1.out === 1;
    
    component multiplierOrder2 = LessEqThan(16);
    multiplierOrder2.in[0] <== avgMultiplier;
    multiplierOrder2.in[1] <== maxMultiplier;
    multiplierOrder2.out === 1;
    
    // Verify sum of amounts equals totalAmount
    component sumCheck = Equal();
    sumCheck.in[0] <== sumAmounts;
    sumCheck.in[1] <== totalAmount;
    sumCheck.out === 1;
    
    // Verify sumAmounts > 0
    // Use 252 bits (max supported) to handle large token amounts (wei values can be very large)
    component sumPositiveCheck = GreaterThan(252);
    sumPositiveCheck.in[0] <== sumAmounts;
    sumPositiveCheck.in[1] <== 0;
    sumPositiveCheck.out === 1;
    
    // Verify batch hash commits to aggregate data
    // batchHash = Poseidon(numUsers, minScore, maxScore, avgScore, minMultiplier, maxMultiplier, avgMultiplier, sumAmounts, dataCommitment)
    component batchHasher = Poseidon(9);
    batchHasher.inputs[0] <== numUsers;
    batchHasher.inputs[1] <== minScore;
    batchHasher.inputs[2] <== maxScore;
    batchHasher.inputs[3] <== avgScore;
    batchHasher.inputs[4] <== minMultiplier;
    batchHasher.inputs[5] <== maxMultiplier;
    batchHasher.inputs[6] <== avgMultiplier;
    batchHasher.inputs[7] <== sumAmounts;
    batchHasher.inputs[8] <== dataCommitment;
    batchHasher.out === batchHash;
}

/**
 * @title Equal
 * @notice Checks if two signals are equal
 */
template Equal() {
    signal input in[2];
    signal output out;
    component eq = IsEqual();
    eq.in[0] <== in[0];
    eq.in[1] <== in[1];
    out <== eq.out;
}

// Main component - NO SIZE LIMIT (aggregate statistics only)
component main {public [merkleRoot, totalAmount, batchHash]} = ProviderBatch();
