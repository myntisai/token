#!/bin/bash
# Setup script for ZK circuit testing environment
# Run with: ./setup-test-env.sh

set -e

echo "🔧 Setting up ZK Circuit Testing Environment"
echo "=" | head -c 60 && echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found. Please install npm first."
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Install dependencies
echo "\n📦 Installing dependencies..."
npm install

# Check if circom is installed globally
if ! command -v circom &> /dev/null; then
    echo "\n⚠️  Circom not found globally. Installing..."
    npm install -g circom
else
    echo "✅ Circom found: $(circom --version)"
fi

# Check if snarkjs is installed globally
if ! command -v snarkjs &> /dev/null; then
    echo "\n⚠️  snarkjs not found globally. Installing..."
    npm install -g snarkjs
else
    echo "✅ snarkjs found: $(snarkjs --version)"
fi

echo "\n✅ Setup complete!"
echo "\n💡 Next steps:"
echo "   1. Compile circuit: ./compile.sh"
echo "   2. Generate keys: ./generate-keys.sh"
echo "   3. Run test: node test_circuit.js"

