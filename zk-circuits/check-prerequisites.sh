#!/bin/bash
# Check prerequisites for ZK circuit compilation
# Run with: ./check-prerequisites.sh

echo "🔍 Checking ZK Circuit Prerequisites"
echo "=" | head -c 60 && echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm: $NPM_VERSION"
else
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

# Check Circom
if command -v circom &> /dev/null; then
    CIRCOM_VERSION=$(circom --version 2>&1 | head -1)
    echo "✅ Circom: $CIRCOM_VERSION"
else
    echo "⚠️  Circom not found globally."
    echo "   Install with: npm install -g circom"
    echo "   Or use: npx circom"
fi

# Check snarkjs
if command -v snarkjs &> /dev/null; then
    SNARKJS_VERSION=$(snarkjs --version 2>&1 | head -1)
    echo "✅ snarkjs: $SNARKJS_VERSION"
else
    echo "⚠️  snarkjs not found globally."
    echo "   Install with: npm install -g snarkjs"
    echo "   Or use: npx snarkjs"
fi

# Check if circuit file exists
if [ -f "reward_claim.circom" ]; then
    echo "✅ Circuit file found: reward_claim.circom"
else
    echo "❌ Circuit file not found: reward_claim.circom"
    exit 1
fi

# Check if circomlib is available
if [ -d "node_modules/circomlib" ] || npm list circomlib &> /dev/null; then
    echo "✅ circomlib available"
else
    echo "⚠️  circomlib not found. Installing..."
    npm install circomlib
fi

echo ""
echo "📋 Summary:"
if command -v circom &> /dev/null && command -v snarkjs &> /dev/null; then
    echo "✅ All prerequisites met! Ready to compile circuit."
    echo ""
    echo "💡 Next steps:"
    echo "   1. ./compile.sh - Compile the circuit"
    echo "   2. ./generate-keys.sh - Generate keys"
    echo "   3. node test_circuit.js - Test the circuit"
else
    echo "⚠️  Some prerequisites missing. Install them first:"
    echo "   npm install -g circom snarkjs"
    echo "   npm install circomlib"
fi

