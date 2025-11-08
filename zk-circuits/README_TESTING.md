# ZK Circuit Testing - Quick Reference

## Prerequisites

```bash
# Check if tools are installed
which circom && which snarkjs && node --version
```

If not installed:
```bash
npm install -g circom snarkjs
```

## Quick Test

```bash
cd token/zk-circuits

# Option 1: Full automated test
npm run test:full

# Option 2: Manual steps
./compile.sh
./generate-keys.sh
node test_circuit.js
```

## Test Files

- `test_circuit.js` - Main test script
- `setup-test-env.sh` - Environment setup
- `TESTING_GUIDE.md` - Detailed guide
- `QUICK_TEST.md` - Quick reference

## Expected Output

```
🧪 Testing ZK Circuit - Reward Claim
✅ Circuit files found
✅ Witness generated successfully
✅ Proof verified successfully!
✅ ALL TESTS PASSED!
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `circom: command not found` | `npm install -g circom` |
| `WASM file not found` | Run `./compile.sh` |
| `ZKey file not found` | Run `./generate-keys.sh` |
| `Circuit compilation failed` | Check Circom version, verify syntax |

## Next Steps

1. Test circuit ✅
2. Test SDK: `cd ../sdk && npx ts-node test_zk_proof_generation.ts`
3. Test Hardhat: `cd .. && npx hardhat test test/zk-proof-generation.test.ts`

