# ZK Circuit Testing Guide

**Last Updated**: November 9, 2025

## Prerequisites

1. **Install Circom**
```bash
npm install -g circom
# Or use npx: npx circom2 --version
```

2. **Install snarkjs**
```bash
npm install -g snarkjs
# Or use npx: npx snarkjs --version
```

3. **Install dependencies**
```bash
cd token/zk-circuits
npm install
```

4. **Verify Installation**
```bash
# Check if tools are installed
which circom && which snarkjs && node --version

# Or check versions
circom --version
snarkjs --version
node --version
```

## Quick Test

### Option 1: Full Test (Compile + Generate Keys + Test)
```bash
cd token/zk-circuits
npm run test:full
```

This will:
1. Compile the circuit
2. Generate keys (test setup)
3. Export verification key
4. Run the test

### Option 2: Step by Step

#### Step 1: Compile Circuit
```bash
cd token/zk-circuits
./compile.sh
# Or: npm run compile
```

Expected output:
- `reward_claim.r1cs` - R1CS constraint system
- `reward_claim.wasm` - WASM file
- `reward_claim.sym` - Symbol file
- `reward_claim_cpp/` - C++ files

#### Step 2: Generate Keys
```bash
./generate-keys.sh
# Or: npm run setup && npm run contribute && npm run export-vkey
```

Expected output:
- `reward_claim_0000.zkey` - Initial zkey
- `reward_claim_final.zkey` - Final proving key
- `verification_key.json` - Verification key

#### Step 3: Run Test
```bash
node test_circuit.js
# Or: npm test
```

## Test Output

Successful test output:
```
🧪 Testing ZK Circuit - Reward Claim
✅ Circuit files found
✅ Witness generated successfully
✅ Proof verified successfully!
✅ ALL TESTS PASSED!
```

## Testing Different Scenarios

### Test with Different AI Scores

Edit `test_circuit.js` to test different scores:

```javascript
const testInputs = {
  // ... other inputs
  aiLegitimacyScore: 95,  // High score
  aiRewardMultiplier: 9000, // 9x multiplier
  // ...
};
```

### Test Edge Cases

The test script automatically tests:
- Minimum scores (0, 10)
- Maximum scores (100, 10000)
- Invalid scores (should fail)

## Common Issues

| Error | Solution |
|-------|----------|
| `circom: command not found` | `npm install -g circom` or use `npx circom2` |
| `snarkjs: command not found` | `npm install -g snarkjs` or use `npx snarkjs` |
| `WASM file not found` | Run `./compile.sh` first |
| `ZKey file not found` | Run `./generate-keys.sh` first |
| `Powers of tau not found` | Script downloads automatically, or download manually |
| `Circuit compilation failed` | Check Circom version (2.0.0+), verify syntax |
| `Proof generation failed` | Verify input format and ranges |

## Performance Testing

Measure proof generation time:

```javascript
const startTime = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(...);
const endTime = Date.now();
console.log(`Proof generation time: ${endTime - startTime}ms`);
```

Target: <1000ms

## Quick Reference

### Prerequisites Check
```bash
cd token/zk-circuits

# Check if tools are installed
which circom
which snarkjs
node --version
npm --version
```

### Full Automated Test
```bash
# This will compile, generate keys, and test
npm run test:full
```

### Manual Step-by-Step
```bash
# 1. Setup environment
./setup-test-env.sh

# 2. Compile circuit
./compile.sh

# 3. Generate keys
./generate-keys.sh

# 4. Run test
node test_circuit.js
```

### Test with SDK
After circuit is compiled:
```bash
cd ../sdk
npx ts-node test_zk_proof_generation.ts
```

### Test with Hardhat
```bash
cd ..
npx hardhat test test/zk-proof-generation.test.ts
```

## Troubleshooting

### Error: "WASM file not found"
- Run `./compile.sh` first

### Error: "ZKey file not found"
- Run `./generate-keys.sh` first

### Error: "Powers of tau file not found"
- The script will download it automatically
- Or download manually: https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau

### Error: "Circuit compilation failed"
- Check Circom version: `circom --version` (should be 2.0.0+)
- Verify circuit syntax
- Check circomlib is installed

### Error: "Proof generation failed"
- Verify inputs are in correct format
- Check score ranges (0-100 for legitimacy, 10-10000 for multiplier)
- Ensure Merkle proof has 8 elements

## Integration with SDK

After testing the circuit, test the SDK:

```bash
cd token
npx ts-node sdk/test_zk_proof_generation.ts
```

## Next Steps

1. ✅ Test circuit compilation
2. ✅ Test proof generation
3. ✅ Test proof verification
4. ⏭️ Test with real Merkle proofs
5. ⏭️ Test on-chain verification
6. ⏭️ Test full claim flow

