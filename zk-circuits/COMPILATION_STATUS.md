# ZK Circuit Compilation Status

**Last Updated**: November 9, 2025

## Current Status

✅ **Circuit Compiled Successfully**  
✅ **Keys Generated** (Test Setup)

## Generated Files

### Circuit Files
- ✅ `reward_claim.r1cs` - R1CS constraint system (692KB)
- ✅ `reward_claim.wasm` - WebAssembly file for witness generation (1.7MB)
- ✅ `reward_claim.sym` - Symbol file for debugging
- ✅ `reward_claim_js/` - JavaScript witness generation files
- ✅ `reward_claim_cpp/` - C++ witness generation files

### Key Files
- ✅ `reward_claim_0000.zkey` - Initial zkey
- ✅ `reward_claim_final.zkey` - Final proving key (2.3MB)
- ✅ `verification_key.json` - Verification key (3.2KB)

### Powers of Tau Files
- ✅ `pot13_0000.ptau` - Initial powers of tau
- ✅ `pot13_0001.ptau` - Contributed powers of tau
- ✅ `pot13_final.ptau` - Final powers of tau (phase 2)

## Circuit Statistics

- **Template instances**: 84
- **Non-linear constraints**: 2,532
- **Linear constraints**: 2,764
- **Total constraints**: 5,296
- **Public inputs**: 3
- **Private inputs**: 19
- **Wires**: 5,297
- **Labels**: 7,855

## Compilation Process

### 1. Install Dependencies
```bash
npm install circomlib
```

### 2. Compile Circuit
```bash
npx circom2 reward_claim.circom --r1cs --wasm --sym --c -l node_modules
```

### 3. Generate Powers of Tau
The circuit requires **power 13** powers of tau (circuit has 5,296 constraints, needs 2^13 = 8,192).

```bash
# Generate initial powers of tau
npx snarkjs powersoftau new bn128 13 pot13_0000.ptau -v

# Contribute to ceremony
echo "test" | npx snarkjs powersoftau contribute pot13_0000.ptau pot13_0001.ptau --name="Test" -v

# Prepare phase 2
npx snarkjs powersoftau prepare phase2 pot13_0001.ptau pot13_final.ptau -v
```

### 4. Generate Keys
```bash
# Setup Groth16
npx snarkjs groth16 setup reward_claim.r1cs pot13_final.ptau reward_claim_0000.zkey

# Contribute to ceremony
echo "test" | npx snarkjs zkey contribute reward_claim_0000.zkey reward_claim_final.zkey --name="Test"

# Export verification key
npx snarkjs zkey export verificationkey reward_claim_final.zkey verification_key.json
```

## Alternative: Download Pre-Generated Powers of Tau

For faster setup, you can download a pre-generated power 12 powers of tau file:

```bash
curl -L -o pot12_final.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau
```

**Note**: Power 12 (4,096 constraints) may not be sufficient for this circuit (5,296 constraints). Power 13 (8,192 constraints) is required.

## Important Notes

⚠️ **For Production**: The keys generated here are for **testing only**. For production, you must:
- Use a proper trusted setup ceremony (MPC ceremony)
- Have multiple participants contribute to the ceremony
- Destroy toxic waste properly
- Use secure randomness for contributions

## Next Steps

1. ✅ Circuit compiled
2. ✅ Keys generated
3. ⏭️ Test circuit: `node test_circuit.js`
4. ⏭️ Test SDK: `cd ../sdk && npx ts-node test_zk_proof_generation.ts`
5. ⏭️ Generate verifier contract: `npx snarkjs zkey export solidityverifier reward_claim_final.zkey ../contracts/RewardClaimVerifier_generated.sol`

## Testing

Run the test script to verify everything works:
```bash
node test_circuit.js
```

This will:
- Generate a test proof
- Verify the proof
- Test edge cases
- Validate all constraints

## Troubleshooting

### Circuit Compilation Issues
- Ensure `circomlib` is installed: `npm install circomlib`
- Use `npx circom2` (not the deprecated `circom` package)
- Check include paths: `-l node_modules`

### Key Generation Issues
- Ensure powers of tau file is large enough (power 13 for this circuit)
- Verify powers of tau file is valid
- Check that phase 2 preparation completed successfully

### File Not Found Errors
- Run `./compile.sh` to compile circuit
- Run `./generate-keys.sh` to generate keys
- Check that all prerequisite files exist

## Related Documentation

- `README.md` - Main circuit documentation
- `TESTING_GUIDE.md` - Comprehensive testing guide
- `INSTALL_CIRCOM.md` - Installation instructions
- `docs/05-token/ZK_PROOF_SYSTEM.md` - ZK system overview

