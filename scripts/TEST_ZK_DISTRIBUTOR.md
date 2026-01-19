# Testing ZK Distributor Flow

This guide walks you through testing the new ZKMerkleDistributor with real ZK proofs.

## Prerequisites

1. **Backend service running** with ZK proof generation enabled
2. **Contracts deployed** on base-sepolia:
   - ZKMerkleDistributor: `0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D`
   - Groth16Verifier: `0x725bC5d5C75Dc6afB4e61A43fbC35909866e4C8e`
   - MYNT Token: `0x5242925C716225C58459f557E5B4Be51373aB767`
3. **Environment variables set**:
   ```bash
   export MYNTIS_TOKEN_ADDRESS=0x5242925C716225C58459f557E5B4Be51373aB767
   export ZK_MERKLE_DISTRIBUTOR_ADDRESS=0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D
   export BACKEND_API_URL=http://localhost:8000
   export SERVICE_API_KEY=<your-service-api-key>
   ```

## Step-by-Step Testing

### Step 1: Generate Real ZK Proof

**Option A: Using the shell script**
```bash
cd token/scripts
./test-zk-flow.sh
```

**Option B: Using curl directly**
```bash
curl -X POST http://localhost:8000/api/zk/generate-provider-proof \
  -H "Content-Type: application/json" \
  -H "X-Service-API-Key: <your-key>" \
  -d '{
    "users": ["0x1111111111111111111111111111111111111111"],
    "scores": [75],
    "multipliers": [1000],
    "amounts": ["100000000000000000000"],
    "base_reward_amount": 1000000
  }' | jq '.'
```

Save the response to `test-zk-proof.json`.

### Step 2: Fund the Distributor

Run the test script to fund the distributor and create a test claim:

```bash
cd token
npx hardhat run scripts/test-zk-distributor.ts --network base-sepolia
```

This will:
- Grant PROVIDER_ROLE to your deployer address
- Fund the distributor with 1000 MYNT
- Generate test batch data
- Build Merkle tree
- **Note**: It uses a mock proof initially - you'll need to replace it with the real proof

### Step 3: Submit Merkle Root with Real ZK Proof

Edit `test-zk-distributor.ts` to use the real proof from Step 1, or modify it to load from `test-zk-proof.json`.

The proof structure should be:
```typescript
const proofA = [BigInt(proof.proof.a[0]), BigInt(proof.proof.a[1])];
const proofB = [
  [BigInt(proof.proof.b[0][0]), BigInt(proof.proof.b[0][1])],
  [BigInt(proof.proof.b[1][0]), BigInt(proof.proof.b[1][1])]
];
const proofC = [BigInt(proof.proof.c[0]), BigInt(proof.proof.c[1])];
const publicInputs = proof.public_signals.map(s => BigInt(s));
```

### Step 4: Test User Claim

After submitting the Merkle root, you'll get claim details:
- Provider address
- Root index
- Amount (in wei)
- Merkle proof

Use these to claim:

```typescript
await distributor.claim(
  providerAddress,
  rootIndex,
  amount,
  merkleProof
);
```

Or use the frontend claim interface with the provided claim data.

## Expected Output

After running the test script, you'll get:

1. **Claim data JSON file** (`test-claim-data.json`) with:
   - Provider address
   - Root index
   - User address
   - Amount (wei and formatted)
   - Merkle proof
   - Expiry date
   - Contract addresses

2. **Console output** with:
   - Transaction hashes
   - Epoch information
   - Claim function call details

## Troubleshooting

### ZK Proof Generation Fails
- Check backend is running: `curl http://localhost:8000/api/zk/status`
- Verify circuit files exist: `ls token/zk-circuits/provider_batch_*.zkey`
- Check SERVICE_API_KEY is set correctly

### Proof Verification Fails
- Ensure proof is from the correct circuit (provider_batch)
- Verify public inputs match (merkleRoot, totalAmount, batchHash)
- Check proof format matches contract expectations

### Claim Fails
- Verify Merkle proof is correct
- Check root index matches submitted epoch
- Ensure user address matches Merkle leaf
- Verify amount matches exactly

## Next Steps

Once testing is successful:
1. Wire DualPoolStaking to new distributor
2. Grant PROVIDER_ROLE to production provider
3. Update production environment variables
4. Monitor first few batches
