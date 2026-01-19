#!/bin/bash
# Compile Provider Batch ZK circuit script
# This script compiles the provider_batch.circom circuit to generate R1CS, WASM, and C files

set -e

echo "🔨 Compiling Provider Batch ZK circuit..."

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

# Compile the circuit with circomlib include path
echo "📝 Compiling provider_batch.circom..."
circom provider_batch.circom --r1cs --wasm --sym --c -l node_modules

if [ $? -eq 0 ]; then
    echo "✅ Circuit compiled successfully!"
    echo "   Generated files:"
    echo "   - provider_batch.r1cs (R1CS constraint system)"
    echo "   - provider_batch.wasm (WASM file for witness generation)"
    echo "   - provider_batch.sym (Symbol file for debugging)"
    echo "   - provider_batch_cpp/ (C++ files for witness generation)"
else
    echo "❌ Circuit compilation failed!"
    exit 1
fi
