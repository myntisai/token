# Quick ZK Proof Generation Test

## Prerequisites Check

```bash
cd token/zk-circuits

# Check if tools are installed
which circom
which snarkjs
node --version
npm --version
```

## Option 1: Full Automated Test

```bash
# This will compile, generate keys, and test
npm run test:full
```

## Option 2: Manual Step-by-Step

### 1. Setup Environment
```bash
./setup-test-env.sh
```

### 2. Compile Circuit
```bash
./compile.sh
```

Expected files:
- `reward_claim.wasm`
- `reward_claim.r1cs`
- `reward_claim.sym`

### 3. Generate Keys
```bash
./generate-keys.sh
```

Expected files:
- `reward_claim_final.zkey`
- `verification_key.json`

### 4. Run Test
```bash
node test_circuit.js
```

## Expected Output

```
🧪 Testing ZK Circuit - Reward Claim
✅ Circuit files found
✅ Witness generated successfully
✅ Proof verified successfully!
✅ ALL TESTS PASSED!
```

## Test with SDK

After circuit is compiled:

```bash
cd ../sdk
npx ts-node test_zk_proof_generation.ts
```

## Troubleshooting

### "circom: command not found"
```bash
npm install -g circom
```

### "snarkjs: command not found"
```bash
npm install -g snarkjs
```

### "WASM file not found"
Run `./compile.sh` first

### "ZKey file not found"
Run `./generate-keys.sh` first

## Performance

- **Compilation**: ~5-10 seconds
- **Key Generation**: ~30-60 seconds (depends on powers of tau download)
- **Proof Generation**: <1 second (target)

