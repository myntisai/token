#!/bin/bash
# Complete ZK circuit setup script
# This script completes the key generation process

set -e

echo "🔧 Completing ZK Circuit Setup"
echo "=" | head -c 60 && echo ""

# Check if circuit is compiled
if [ ! -f "reward_claim.r1cs" ]; then
    echo "❌ Circuit not compiled. Run compilation first."
    exit 1
fi

# Step 1: Generate powers of tau (if not exists)
if [ ! -f "pot13_0000.ptau" ]; then
    echo "📦 Step 1: Generating powers of tau (power 13)..."
    echo "   This will take several minutes..."
    npx snarkjs powersoftau new bn128 13 pot13_0000.ptau -v
    echo "✅ Powers of tau phase 1 complete"
else
    echo "✅ Powers of tau phase 1 already exists"
fi

# Step 2: Contribute to ceremony
if [ ! -f "pot13_0001.ptau" ]; then
    echo "📦 Step 2: Contributing to ceremony..."
    echo "test" | npx snarkjs powersoftau contribute pot13_0000.ptau pot13_0001.ptau --name="Test" -v
    echo "✅ Contribution complete"
else
    echo "✅ Contribution already exists"
fi

# Step 3: Prepare phase 2
if [ ! -f "pot13_final.ptau" ]; then
    echo "📦 Step 3: Preparing phase 2..."
    npx snarkjs powersoftau prepare phase2 pot13_0001.ptau pot13_final.ptau -v
    echo "✅ Phase 2 preparation complete"
else
    echo "✅ Phase 2 already prepared"
fi

# Step 4: Setup Groth16
if [ ! -f "reward_claim_0000.zkey" ]; then
    echo "📦 Step 4: Setting up Groth16..."
    npx snarkjs groth16 setup reward_claim.r1cs pot13_final.ptau reward_claim_0000.zkey
    echo "✅ Groth16 setup complete"
else
    echo "✅ Groth16 setup already exists"
fi

# Step 5: Contribute to zkey
if [ ! -f "reward_claim_final.zkey" ]; then
    echo "📦 Step 5: Contributing to zkey..."
    echo "test" | npx snarkjs zkey contribute reward_claim_0000.zkey reward_claim_final.zkey --name="Test" -v
    echo "✅ Zkey contribution complete"
else
    echo "✅ Final zkey already exists"
fi

# Step 6: Export verification key
if [ ! -f "verification_key.json" ]; then
    echo "📦 Step 6: Exporting verification key..."
    npx snarkjs zkey export verificationkey reward_claim_final.zkey verification_key.json
    echo "✅ Verification key exported"
else
    echo "✅ Verification key already exists"
fi

# Step 7: Generate verifier contract
echo "📦 Step 7: Generating verifier contract..."
npx snarkjs zkey export solidityverifier reward_claim_final.zkey ../contracts/RewardClaimVerifier_generated.sol
echo "✅ Verifier contract generated"

echo ""
echo "🎉🎉🎉 SETUP COMPLETE! 🎉🎉🎉"
echo ""
echo "Generated files:"
ls -lh reward_claim.wasm reward_claim_final.zkey verification_key.json ../contracts/RewardClaimVerifier_generated.sol 2>&1
echo ""
echo "Next steps:"
echo "  1. Test circuit: node test_circuit.js"
echo "  2. Test SDK: cd ../sdk && npx ts-node test_zk_proof_generation.ts"
echo "  3. Deploy contracts with generated verifier"

