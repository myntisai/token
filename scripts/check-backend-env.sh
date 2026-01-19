#!/bin/bash
# Check what environment the running backend sees

echo "=" | tr -d '\n' | head -c 60 && echo ""
echo "Backend Environment Diagnostic"
echo "=" | tr -d '\n' | head -c 60 && echo ""

BACKEND_URL="${BACKEND_API_URL:-http://localhost:8000}"

echo ""
echo "1. Checking backend status..."
STATUS=$(curl -s "$BACKEND_URL/api/zk/status")
echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"

echo ""
echo "2. Checking .env.prod file..."
if [ -f "../.env.prod" ]; then
    echo "✅ .env.prod exists"
    echo "   ENVIRONMENT: $(grep '^ENVIRONMENT=' ../.env.prod | cut -d'=' -f2 || echo 'NOT SET')"
    echo "   SERVICE_API_KEY: $(grep '^SERVICE_API_KEY=' ../.env.prod | cut -d'=' -f2 | sed 's/./*/g' || echo 'NOT SET')"
else
    echo "❌ .env.prod not found in root directory"
fi

echo ""
echo "3. Circuit files check..."
FILES=(
    "../token/zk-circuits/provider_batch_js/provider_batch.wasm"
    "../token/zk-circuits/provider_batch_final.zkey"
    "../token/zk-circuits/provider_batch_verification_key.json"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $(basename $file)"
    else
        echo "❌ $(basename $file) - NOT FOUND"
        echo "   Expected: $file"
    fi
done

echo ""
echo "4. Recommendations:"
echo "   - If circuit files exist but backend shows 'not_ready': RESTART BACKEND"
echo "   - If ENVIRONMENT=development but getting security error: RESTART BACKEND"
echo "   - Backend loads .env.prod from root directory automatically"
echo ""
echo "   To restart backend:"
echo "   1. Stop current backend (Ctrl+C)"
echo "   2. cd backend && python -m uvicorn main:app"
