#!/bin/bash
# Test ZK Distributor Flow
# This script helps test the full ZK distributor flow

set -e

echo "=" | tr -d '\n' | head -c 80 && echo ""
echo "TEST ZK DISTRIBUTOR FLOW"
echo "=" | tr -d '\n' | head -c 80 && echo ""

# Configuration
BACKEND_URL="${BACKEND_API_URL:-http://localhost:8000}"
SERVICE_API_KEY="${SERVICE_API_KEY:-}"
ZK_DISTRIBUTOR="${ZK_MERKLE_DISTRIBUTOR_ADDRESS:-0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D}"
TOKEN_ADDRESS="${MYNTIS_TOKEN_ADDRESS:-0x5242925C716225C58459f557E5B4Be51373aB767}"

echo "Backend URL: $BACKEND_URL"
echo "ZK Distributor: $ZK_DISTRIBUTOR"
echo "Token: $TOKEN_ADDRESS"
echo ""

# Step 1: Check backend is running
echo "📝 Step 1: Checking backend service..."
if curl -s -f "$BACKEND_URL/api/zk/status" > /dev/null; then
    echo "✅ Backend is running"
    STATUS=$(curl -s "$BACKEND_URL/api/zk/status")
    echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"
    
    # Check if circuit files are ready
    if echo "$STATUS" | jq -e '.status == "ready"' > /dev/null 2>&1; then
        echo "✅ Circuit files are ready"
    else
        echo "⚠️  Circuit files not found. Checking paths..."
        echo "   Expected locations:"
        echo "   - token/zk-circuits/provider_batch_js/provider_batch.wasm"
        echo "   - token/zk-circuits/provider_batch_final.zkey"
        echo "   - token/zk-circuits/provider_batch_verification_key.json"
        echo ""
        echo "   If files exist, backend may need restart to detect them."
    fi
else
    echo "❌ Backend is not running or not accessible"
    echo "   Start it with: cd backend && python -m uvicorn main:app"
    exit 1
fi

# Step 2: Generate ZK proof
echo ""
echo "📝 Step 2: Generating ZK proof..."
echo "   (This will call the backend API)"

# Test data
TEST_DATA='{
  "users": [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333"
  ],
  "scores": [75, 80, 70],
  "multipliers": [1000, 1200, 800],
  "amounts": ["100000000000000000000", "50000000000000000000", "25000000000000000000"],
  "base_reward_amount": 1000000
}'

# Build headers
HEADERS=(-H "Content-Type: application/json")
if [ -n "$SERVICE_API_KEY" ]; then
    HEADERS+=(-H "X-Service-API-Key: $SERVICE_API_KEY")
    echo "   Using SERVICE_API_KEY for authentication"
else
    echo "   ⚠️  No SERVICE_API_KEY set - will work only if ENVIRONMENT=development"
fi

PROOF_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/zk/generate-provider-proof" \
  "${HEADERS[@]}" \
  -d "$TEST_DATA")

if echo "$PROOF_RESPONSE" | jq -e '.proof' > /dev/null 2>&1; then
    echo "✅ ZK proof generated successfully"
    echo "$PROOF_RESPONSE" | jq '{merkle_root, batch_hash, public_signals: .public_signals[:3]}'
    
    # Save proof to file
    echo "$PROOF_RESPONSE" > test-zk-proof.json
    echo "   Proof saved to: test-zk-proof.json"
else
    echo "❌ Failed to generate ZK proof:"
    echo "$PROOF_RESPONSE" | jq '.' 2>/dev/null || echo "$PROOF_RESPONSE"
    
    # Check for specific errors
    if echo "$PROOF_RESPONSE" | grep -q "Service unavailable"; then
        echo ""
        echo "💡 Fix: Set ENVIRONMENT=development in backend/.env or set SERVICE_API_KEY"
        echo "   export ENVIRONMENT=development"
        echo "   # OR"
        echo "   export SERVICE_API_KEY=your-secret-key"
    fi
    
    if echo "$PROOF_RESPONSE" | grep -q "Circuit files not compiled"; then
        echo ""
        echo "💡 Fix: Compile the circuit first:"
        echo "   cd token/zk-circuits"
        echo "   ./compile-provider-batch.sh"
        echo "   ./generate-provider-batch-keys.sh"
    fi
    
    exit 1
fi

echo ""
echo "📝 Step 3: Next steps"
echo "   1. Fund the distributor (run test-zk-distributor.ts)"
echo "   2. Submit Merkle root with the proof"
echo "   3. Test user claims"
echo ""
echo "To use this proof in the test script:"
echo "   export ZK_PROOF_FILE=test-zk-proof.json"
echo "   npx hardhat run scripts/test-zk-distributor.ts --network base-sepolia"
