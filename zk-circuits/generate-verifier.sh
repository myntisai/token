#!/bin/bash
# Generate Solidity verifier contract from verification key
# This script generates the Groth16 verifier contract that will be deployed on-chain

set -e

echo "📝 Generating Solidity verifier contract..."

# Check if snarkjs is installed
if ! command -v snarkjs &> /dev/null; then
    echo "❌ Error: snarkjs not found. Please install snarkjs first."
    echo "   Install: npm install -g snarkjs"
    exit 1
fi

# Check if final zkey exists
if [ ! -f "reward_claim_final.zkey" ]; then
    echo "❌ Error: reward_claim_final.zkey not found. Please generate keys first."
    echo "   Run: ./generate-keys.sh"
    exit 1
fi

# Generate verifier contract
echo "📝 Exporting Solidity verifier..."
snarkjs zkey export solidityverifier reward_claim_final.zkey ../contracts/RewardClaimVerifier_generated.sol

if [ $? -eq 0 ]; then
    echo "✅ Verifier contract generated successfully!"
    echo "   Generated file: token/contracts/RewardClaimVerifier_generated.sol"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Review the generated verifier contract"
    echo "   2. Update RewardClaimVerifier.sol to use the generated verifier"
    echo "   3. Deploy the verifier contract"
else
    echo "❌ Verifier generation failed!"
    exit 1
fi

