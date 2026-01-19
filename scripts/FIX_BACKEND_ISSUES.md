# Fix Backend Issues for ZK Testing

## Issue 1: Circuit Files Not Found

The backend status shows `"status": "not_ready"` even though files exist.

**Solution**: Restart the backend server so it can detect the circuit files.

```bash
# Stop the current backend (Ctrl+C)
# Then restart:
cd backend
python -m uvicorn main:app
```

The files exist at:
- `token/zk-circuits/provider_batch_js/provider_batch.wasm` ✅
- `token/zk-circuits/provider_batch_final.zkey` ✅
- `token/zk-circuits/provider_batch_verification_key.json` ✅

## Issue 2: SERVICE_API_KEY Error

Error: `"Service unavailable: Security configuration error"`

**Solution A (Recommended for testing)**: Set ENVIRONMENT=development

Add to root `.env.prod` (in Myntis-FullStack folder):
```bash
ENVIRONMENT=development
```

**Solution B**: Set SERVICE_API_KEY

Add to root `.env.prod`:
```bash
SERVICE_API_KEY=test-key-for-development
```

Then in your test script:
```bash
export SERVICE_API_KEY=test-key-for-development
./test-zk-flow.sh
```

**Note**: The backend loads environment variables from the root `.env.prod` file (not `backend/.env`). 
The backend automatically loads it on startup as shown in `backend/main.py`.

## Quick Fix Commands

```bash
# 1. Set environment in root .env.prod (choose one)
echo "ENVIRONMENT=development" >> .env.prod
# OR
echo "SERVICE_API_KEY=test-key" >> .env.prod

# 2. Restart backend (it loads .env.prod from root automatically)
cd backend
# Stop current server (Ctrl+C), then:
python -m uvicorn main:app

# 3. Test again
cd ../token/scripts
./test-zk-flow.sh
```

## Verify Fix

After restarting backend, check status:
```bash
curl http://localhost:8000/api/zk/status | jq
```

Should show:
```json
{
  "status": "ready",
  "circuit_wasm": true,
  "proving_key": true,
  "verification_key": true
}
```
