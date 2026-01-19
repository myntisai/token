# Quick Test Guide for ZK Distributor

## Quick Start

1. **Start backend** (if not running):
   ```bash
   cd backend
   python -m uvicorn main:app
   ```

2. **Generate ZK proof**:
   ```bash
   cd token/scripts
   ./test-zk-flow.sh
   ```
   This creates `test-zk-proof.json` with the real proof.

3. **Fund distributor and create test claim**:
   ```bash
   cd token
   export ZK_PROOF_FILE=test-zk-proof.json
   npx hardhat run scripts/test-zk-distributor.ts --network base-sepolia
   ```

4. **Claim the reward**:
   Use the claim details from the output or `test-claim-data.json`

## What You'll Get

After running the test script, you'll have:

- **test-claim-data.json**: Complete claim information including:
  - Provider address
  - Root index  
  - User address
  - Amount (in wei and formatted)
  - Merkle proof array
  - Expiry date
  - Contract addresses

## Example Claim Call

```typescript
await distributor.claim(
  "0x...", // provider
  0,       // rootIndex
  "100000000000000000000", // amount (wei)
  ["0x...", "0x..."] // merkleProof
);
```

Or use the frontend with the claim data from the JSON file.
