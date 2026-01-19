#!/bin/bash
# Generate proving and verification keys for Provider Batch ZK circuit
# This script generates the trusted setup keys needed for proof generation and verification

set -e

echo "🔑 Generating Provider Batch ZK circuit keys..."

# Check if snarkjs is installed
if ! command -v snarkjs &> /dev/null; then
    echo "❌ Error: snarkjs not found. Please install snarkjs first."
    echo "   Install: npm install -g snarkjs"
    exit 1
fi

# Check if R1CS file exists
if [ ! -f "provider_batch.r1cs" ]; then
    echo "❌ Error: provider_batch.r1cs not found. Please compile the circuit first."
    echo "   Run: ./compile-provider-batch.sh"
    exit 1
fi

# Check if powers of tau file exists, download if not
if [ ! -f "pot12_final.ptau" ]; then
    echo "📥 Downloading powers of tau file (this may take a while)..."
    wget -O pot12_final.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau
fi

# Phase 1: Setup (creates initial zkey with contribution)
echo "⚙️  Phase 1: Setting up trusted setup..."
snarkjs groth16 setup provider_batch.r1cs pot12_final.ptau provider_batch_0000.zkey

# Phase 2: Contribute (for production, you should do a proper ceremony)
# For development, we'll make a single contribution
echo "⚙️  Phase 2: Contributing to trusted setup..."
echo "   Note: For production, use a proper MPC ceremony!"
snarkjs zkey contribute provider_batch_0000.zkey provider_batch_final.zkey

# Phase 3: Export verification key
echo "⚙️  Phase 3: Exporting verification key..."
snarkjs zkey export verificationkey provider_batch_final.zkey provider_batch_verification_key.json

# Phase 4: Export Solidity verifier
echo "⚙️  Phase 4: Exporting Solidity verifier..."
snarkjs zkey export solidityverifier provider_batch_final.zkey ../contracts/Groth16Verifier.sol

if [ $? -eq 0 ]; then
    echo "✅ Keys generated successfully!"
    echo "   Generated files:"
    echo "   - provider_batch_0000.zkey (initial zkey)"
    echo "   - provider_batch_final.zkey (final proving key)"
    echo "   - provider_batch_verification_key.json (verification key)"
    echo "   - ../contracts/Groth16Verifier.sol (Solidity verifier contract)"
    echo ""
    echo "⚠️  For production: Use a proper trusted setup ceremony!"
else
    echo "❌ Key generation failed!"
    exit 1
fi
