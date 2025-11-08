# ZK Circuits for Myntis Reward Claims

This directory contains the Circom circuit for zero-knowledge proof generation for privacy-preserving reward claims.

## Circuit: reward_claim.circom

### Purpose

The circuit verifies:
- AI legitimacy score is within valid range (0-100)
- Reward multiplier is within valid bounds (0.1x-10x)
- User is included in the Merkle tree reward distribution
- Nullifier is correctly generated to prevent double-claiming

### Inputs

**Public (visible to verifier):**
- `merkleRoot`: Merkle root for the claim epoch
- `nullifier`: Hash to prevent double-claiming
- `claimAmount`: Amount being claimed

**Private (hidden from verifier):**
- `userAddress`: User's wallet address
- `aiLegitimacyScore`: AI analysis score (0-100)
- `aiRewardMultiplier`: Reward multiplier (10-10000 = 0.1x-10x)
- `merkleProof[8]`: Merkle proof path elements
- `merklePathIndices[8]`: Merkle proof path indices

### Outputs

The circuit outputs the public inputs and verifies all constraints.

## Build Instructions

### Prerequisites

```bash
# Install Circom
npm install -g circom

# Install snarkjs
npm install -g snarkjs

# Install dependencies
npm install
```

### Compile Circuit

```bash
./compile.sh
```

This generates:
- `reward_claim.r1cs` - R1CS constraint system
- `reward_claim.wasm` - WASM file for witness generation
- `reward_claim.sym` - Symbol file for debugging
- `reward_claim_cpp/` - C++ files for witness generation

### Generate Keys

```bash
./generate-keys.sh
```

This generates:
- `reward_claim_0000.zkey` - Initial zkey
- `reward_claim_final.zkey` - Final proving key
- `verification_key.json` - Verification key

**⚠️  For production**: Use a proper trusted setup ceremony (MPC) instead of the single contribution in this script.

### Generate Verifier Contract

```bash
./generate-verifier.sh
```

This generates:
- `../contracts/RewardClaimVerifier_generated.sol` - Groth16 verifier contract

## Testing

```bash
npm test
```

## Circuit Constraints

1. **Legitimacy Score**: Must be between 0 and 100
2. **Reward Multiplier**: Must be between 10 and 10000
3. **Claim Amount**: Must be positive
4. **Merkle Proof**: User must be in the reward distribution
5. **Nullifier**: Correctly generated from user address and merkle root
6. **Consistency**: Higher scores should lead to higher multipliers

## Security Considerations

1. **Trusted Setup**: Keys must be generated via secure ceremony
2. **Circuit Verification**: Circuit logic must be audited
3. **Nullifier Uniqueness**: Each (user, root) pair generates unique nullifier
4. **Private Inputs**: User behavior data never revealed on-chain

## Performance

- **Circuit Size**: Optimized for Groth16
- **Proving Time**: <1s (target)
- **Verification Gas**: ~200k gas (on-chain)

## Future Enhancements

1. **Optimized Circuit**: Reduce constraint count
2. **Batch Proofs**: Multiple claims in single proof
3. **Mobile Support**: Light-client proof generation

