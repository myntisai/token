#!/bin/bash
# Compile ZK circuit script
# This script compiles the reward_claim.circom circuit to generate R1CS, WASM, and C files

set -e

echo "🔨 Compiling ZK circuit..."

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "❌ Error: circom not found. Please install circom first."
    echo "   Install: npm install -g circom"
    exit 1
fi

# Check if circomlib is available
if [ ! -d "node_modules/circomlib" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Compile the circuit
echo "📝 Compiling reward_claim.circom..."
circom reward_claim.circom --r1cs --wasm --sym --c

if [ $? -eq 0 ]; then
    echo "✅ Circuit compiled successfully!"
    echo "   Generated files:"
    echo "   - reward_claim.r1cs (R1CS constraint system)"
    echo "   - reward_claim.wasm (WASM file for witness generation)"
    echo "   - reward_claim.sym (Symbol file for debugging)"
    echo "   - reward_claim_cpp/ (C++ files for witness generation)"
else
    echo "❌ Circuit compilation failed!"
    exit 1
fi

