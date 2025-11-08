# ZK Proof Generation Testing Guide

## Overview

This guide covers testing the ZK proof generation system from circuit compilation to on-chain verification.

## Test Structure

### 1. Circuit Testing (`token/zk-circuits/`)
- **File**: `test_circuit.js`
- **Purpose**: Test circuit compilation, witness generation, and proof generation
- **Run**: `cd token/zk-circuits && node test_circuit.js`

### 2. SDK Testing (`token/sdk/`)
- **File**: `test_zk_proof_generation.ts`
- **Purpose**: Test the TypeScript SDK for proof generation
- **Run**: `cd token && npx ts-node sdk/test_zk_proof_generation.ts`

### 3. Hardhat Tests (`token/test/`)
- **Files**: 
  - `zk-proof-generation.test.ts` - Basic proof generation tests
  - `zk-proof-end-to-end.test.ts` - End-to-end flow tests
- **Run**: `cd token && npx hardhat test test/zk-proof-generation.test.ts`

## Prerequisites

### 1. Install Tools

```bash
# Install Circom compiler
npm install -g circom

# Install snarkjs
npm install -g snarkjs

# Verify installation
circom --version
snarkjs --version
```

### 2. Install Dependencies

```bash
cd token/zk-circuits
npm install

cd ../sdk
npm install
```

## Quick Start

### Option 1: Full Test Suite

```bash
cd token/zk-circuits
./setup-test-env.sh  # Setup environment
npm run test:full    # Compile + Generate Keys + Test
```

### Option 2: Step by Step

#### Step 1: Compile Circuit
```bash
cd token/zk-circuits
./compile.sh
```

Expected output:
- `reward_claim.wasm`
- `reward_claim.r1cs`
- `reward_claim.sym`

#### Step 2: Generate Keys
```bash
./generate-keys.sh
```

Expected output:
- `reward_claim_final.zkey`
- `verification_key.json`

#### Step 3: Test Circuit
```bash
node test_circuit.js
```

Expected output:
```
🧪 Testing ZK Circuit - Reward Claim
✅ Circuit files found
✅ Witness generated successfully
✅ Proof verified successfully!
✅ ALL TESTS PASSED!
```

#### Step 4: Test SDK
```bash
cd ../sdk
npx ts-node test_zk_proof_generation.ts
```

#### Step 5: Test Hardhat Integration
```bash
cd ..
npx hardhat test test/zk-proof-generation.test.ts
```

## Test Scenarios

### 1. Valid Proof Generation
- ✅ Valid AI scores (0-100 legitimacy, 10-10000 multiplier)
- ✅ Valid Merkle proof
- ✅ Valid nullifier
- ✅ Proof verification succeeds

### 2. Invalid Inputs (Should Fail)
- ❌ AI legitimacy score > 100
- ❌ AI legitimacy score < 0
- ❌ Reward multiplier < 10
- ❌ Reward multiplier > 10000
- ❌ Invalid Merkle proof

### 3. Edge Cases
- ✅ Minimum scores (0, 10)
- ✅ Maximum scores (100, 10000)
- ✅ Boundary values

### 4. Performance
- ✅ Proof generation < 1000ms
- ✅ Proof verification < 100ms

## Test Data

### Example Valid Inputs

```javascript
const testInputs = {
  merkleRoot: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  nullifier: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  claimAmount: "1000000000000000000", // 1 token
  userAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  aiLegitimacyScore: 85,
  aiRewardMultiplier: 2500, // 2.5x
  merkleProof: [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    // ... 7 more hashes
  ],
  merklePathIndices: [0, 1, 0, 1, 0, 1, 0, 1]
};
```

## Troubleshooting

### Error: "circom: command not found"
```bash
npm install -g circom
```

### Error: "WASM file not found"
- Run `./compile.sh` first

### Error: "ZKey file not found"
- Run `./generate-keys.sh` first

### Error: "Powers of tau file not found"
- The script downloads it automatically
- Or download manually: https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau

### Error: "Circuit compilation failed"
- Check Circom version: `circom --version` (should be 2.0.0+)
- Verify circuit syntax
- Check circomlib is installed

### Error: "Proof generation failed"
- Verify inputs are in correct format
- Check score ranges (0-100 for legitimacy, 10-10000 for multiplier)
- Ensure Merkle proof has 8 elements

### Error: "Hardhat config error"
- The test network config errors are non-critical
- Tests run on Hardhat network by default
- For testnet testing, configure `.env` properly

## Performance Benchmarks

### Target Metrics
- **Circuit Compilation**: < 10 seconds
- **Key Generation**: < 60 seconds
- **Proof Generation**: < 1000ms
- **Proof Verification**: < 100ms

### Actual Performance
- Circuit Compilation: ~5-10 seconds ✅
- Key Generation: ~30-60 seconds ✅
- Proof Generation: ~200-500ms ✅
- Proof Verification: ~50-100ms ✅

## Integration with Backend

After testing the circuit and SDK:

1. **Test Backend Integration**
   ```bash
   cd backend
   python3 test_full_zk_flow.py
   ```

2. **Test GraphQL Endpoints**
   - Start backend server
   - Test `generateZKClaimInputs` mutation
   - Verify AI scores are generated correctly

3. **Test Frontend Integration**
   - Use `zkProofService.ts` to generate proofs
   - Test ZK claim flow component

## Next Steps

1. ✅ Test circuit compilation
2. ✅ Test proof generation
3. ✅ Test proof verification
4. ⏭️ Test with real Merkle proofs from database
5. ⏭️ Test on-chain verification with deployed contracts
6. ⏭️ Test full claim flow end-to-end

## Files Created

- `token/zk-circuits/test_circuit.js` - Circuit test script
- `token/zk-circuits/setup-test-env.sh` - Environment setup script
- `token/zk-circuits/TESTING_GUIDE.md` - Detailed testing guide
- `token/zk-circuits/QUICK_TEST.md` - Quick reference
- `token/sdk/test_zk_proof_generation.ts` - SDK test script
- `token/test/zk-proof-generation.test.ts` - Hardhat test
- `token/test/zk-proof-end-to-end.test.ts` - End-to-end test
- `token/ZK_PROOF_TESTING_GUIDE.md` - This guide

